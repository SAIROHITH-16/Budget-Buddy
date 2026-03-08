// server/routes/auth.js
// Authentication routes that sit outside Firebase's standard email/password flow.
//
// Routes:
//   POST /api/auth/verify-phone-email  → verify a Phone.Email user_json_url and return
//                                        a Firebase Custom Token for sign-in

"use strict";

const express          = require("express");
const { createHmac }   = require("crypto");
const { randomUUID }   = require("crypto");
const { adminAuth }    = require("../firebaseAdmin");
const { getDb }        = require("../lib/db");

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/verify-phone-email
// ---------------------------------------------------------------------------
// Called by the frontend after Phone.Email's login_automated_v1_2.js widget
// fires window.phoneEmailListener({ user_json_url }).
//
// The frontend sends: { token: "<user_json_url>" }
//
// This route:
//   1. Validates the URL is from phone.email
//   2. Fetches the URL to retrieve { country_code, phone_no, hmac, ... }
//   3. Verifies the HMAC with PHONE_EMAIL_CLIENT_SECRET
//   4. Upserts the user in SQLite
//   5. Returns a Firebase Custom Token
//
// Returns: { success: true, customToken: "<Firebase Custom Token>", phone }
// ---------------------------------------------------------------------------
router.post("/verify-phone-email", async (req, res) => {
  try {
    // ── 1. Validate request body ────────────────────────────────────────────
    const { token: user_json_url } = req.body;
    if (!user_json_url || typeof user_json_url !== "string") {
      return res.status(400).json({
        success: false,
        error: "token (user_json_url) is required in the request body.",
      });
    }

    // ── 2. Check server config ──────────────────────────────────────────────
    if (!adminAuth) {
      return res.status(503).json({
        success: false,
        error: "Server misconfigured: Firebase Admin is not initialised.",
      });
    }

    // ── 3. Validate the URL is actually from phone.email ───────────────────
    let parsedUrl;
    try {
      parsedUrl = new URL(user_json_url);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid user_json_url." });
    }
    if (!parsedUrl.hostname.endsWith("phone.email")) {
      return res.status(400).json({
        success: false,
        error: "user_json_url must be from the phone.email domain.",
      });
    }

    // ── 4. Fetch user data from Phone.Email ────────────────────────────────
    let userData;
    try {
      const resp = await fetch(user_json_url);
      if (!resp.ok) {
        return res.status(401).json({
          success: false,
          error: `Phone.Email returned HTTP ${resp.status} for user_json_url.`,
        });
      }
      userData = await resp.json();
    } catch (fetchErr) {
      return res.status(502).json({
        success: false,
        error: "Failed to fetch user data from Phone.Email.",
        details: fetchErr.message,
      });
    }

    // ── 5. HMAC verification (optional but recommended) ────────────────────
    // If PHONE_EMAIL_CLIENT_SECRET is set, verify the response HMAC so we know
    // the data hasn't been tampered with. Skip silently if secret not configured.
    const clientSecret = process.env.PHONE_EMAIL_CLIENT_SECRET || process.env.PHONE_EMAIL_SECRET;
    if (clientSecret && userData.hmac) {
      const { country_code: cc, phone_no: pn, timestamp } = userData;
      const expected = createHmac("sha256", clientSecret)
        .update(`${cc}${pn}${timestamp}`)
        .digest("hex");
      if (expected !== userData.hmac) {
        return res.status(401).json({ success: false, error: "Phone.Email HMAC verification failed." });
      }
    }

    // ── 6. Extract and format the phone number ──────────────────────────────
    const { country_code, phone_no } = userData;
    if (!country_code || !phone_no) {
      return res.status(400).json({
        success: false,
        error: "Phone.Email response is missing country_code or phone_no.",
      });
    }

    // Combine into E.164 format: +[country_code][phone_no]
    const formattedPhone = `+${String(country_code).replace(/^\+/, "")}${phone_no}`;

    // ── 5. Find or create the user ──────────────────────────────────────────
    const db  = getDb();
    const now = new Date().toISOString();

    // Normalise the stored phone for comparison (strip spaces, dashes, dots)
    const normalise = (p) => p.replace(/[\s\-.()]/g, "");

    const existingUser = db
      .prepare(
        `SELECT * FROM users
         WHERE replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')','') = ?`
      )
      .get(normalise(formattedPhone));

    let firebaseUid;

    if (existingUser) {
      // ── User found — mark their phone as verified ─────────────────────────
      firebaseUid = existingUser.firebase_uid;

      db.prepare(
        "UPDATE users SET is_phone_verified = 1, updated_at = ? WHERE firebase_uid = ?"
      ).run(now, firebaseUid);

    } else {
      // ── User not found — check Firebase Auth, or create a new user ─────────

      // First try to find an existing Firebase user for this phone number.
      // Firebase stores phone numbers in E.164 format natively.
      try {
        const fbUser = await adminAuth.getUserByPhoneNumber(formattedPhone);
        firebaseUid  = fbUser.uid;
      } catch {
        // No Firebase Auth record for this phone → create one
        const newFbUser = await adminAuth.createUser({ phoneNumber: formattedPhone });
        firebaseUid     = newFbUser.uid;
      }

      // Create the SQLite user record.
      // Email is a placeholder because phone-only sign-in provides no email.
      // The user can update their profile with a real email later.
      const id               = randomUUID();
      const placeholderEmail = `phone_${firebaseUid.slice(0, 8)}@phoneauth.local`;

      db.prepare(
        `INSERT INTO users
           (id, firebase_uid, name, email, phone, is_phone_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(id, firebaseUid, "Phone User", placeholderEmail, formattedPhone, now, now);
    }

    // ── 6. Generate a Firebase Custom Token ────────────────────────────────
    // The frontend will call signInWithCustomToken(auth, customToken) to
    // establish a real Firebase Auth session for this user.
    const customToken = await adminAuth.createCustomToken(firebaseUid, {
      // Optional extra claims available to client-side Firebase rules
      phone_verified: true,
    });

    return res.status(200).json({
      success:     true,
      customToken,
      phone:       formattedPhone,
    });

  } catch (err) {
    console.error("[auth] POST /verify-phone-email error:", err);
    return res.status(500).json({
      success:  false,
      error:    "Phone verification failed.",
      message:  err.message,
    });
  }
});

module.exports = router;
