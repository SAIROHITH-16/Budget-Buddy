// server/routes/auth.js
// Authentication routes that sit outside Firebase's standard email/password flow.
//
// Routes:
//   POST /api/auth/verify-phone-email  → verify a Phone.Email JWT and return
//                                        a Firebase Custom Token for sign-in

"use strict";

const express        = require("express");
const jwt            = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { adminAuth }  = require("../firebaseAdmin");
const { getDb }      = require("../lib/db");

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/verify-phone-email
// ---------------------------------------------------------------------------
// Called by the frontend after Phone.Email redirects back with a signed JWT.
// The JWT was issued by Phone.Email and should be verified with the shared
// secret stored in process.env.PHONE_EMAIL_SECRET.
//
// Body:    { token: "<JWT from Phone.Email>" }
// Returns: { success: true, customToken: "<Firebase Custom Token>", phone }
//
// The frontend must call:
//   import { signInWithCustomToken } from "firebase/auth";
//   await signInWithCustomToken(auth, customToken);
// to complete the Firebase sign-in session.
// ---------------------------------------------------------------------------
router.post("/verify-phone-email", async (req, res) => {
  try {
    // ── 1. Validate request body ────────────────────────────────────────────
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        error: "token is required in the request body.",
      });
    }

    // ── 2. Check server config ──────────────────────────────────────────────
    if (!adminAuth) {
      return res.status(503).json({
        success: false,
        error: "Server misconfigured: Firebase Admin is not initialised.",
      });
    }

    const secret = process.env.PHONE_EMAIL_SECRET;
    if (!secret) {
      console.error("[auth] PHONE_EMAIL_SECRET is not set in server/.env");
      return res.status(503).json({
        success: false,
        error: "Server misconfigured: PHONE_EMAIL_SECRET is missing.",
      });
    }

    // ── 3. Verify the Phone.Email JWT ───────────────────────────────────────
    // Phone.Email signs its callback token with a secret you configure in
    // their dashboard (Settings → Webhook Secret). Store that value in .env
    // as PHONE_EMAIL_SECRET.
    let decoded;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error:   "Invalid or expired Phone.Email verification token.",
        details: jwtErr.message,
      });
    }

    // ── 4. Extract and format the phone number ──────────────────────────────
    // Phone.Email payload contains: { country_code: "91", phone_no: "9876543210", ... }
    const { country_code, phone_no } = decoded;
    if (!country_code || !phone_no) {
      return res.status(400).json({
        success: false,
        error: "Phone.Email token payload is missing country_code or phone_no.",
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
