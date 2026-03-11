// server/routes/users.js
// User profile management using Supabase Postgres.
//
// Routes:
//   POST  /api/users/profile               → create or update user profile
//   GET   /api/users/profile               → retrieve profile (protected)
//   POST  /api/users/send-activation-email → send account activation link by email
//   GET   /api/users/activate-email        → activate account via link token
//   POST  /api/users/mark-phone-verified   → mark phone verified (Firebase handled the OTP)

"use strict";

const express                 = require("express");
const { randomUUID }          = require("crypto");
const { getDb }               = require("../lib/db");
const { sendActivationEmail } = require("../lib/mailer");
const verifyToken             = require("../middleware/verifyToken");

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper — format a raw SQLite row as a public profile object
// ---------------------------------------------------------------------------
function toPublicProfile(row) {
  return {
    id:          row.id,
    firebaseUid: row.firebase_uid,
    name:        row.name,
    email:       row.email,
    phone:       row.phone || null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// POST /api/users/profile
// Create or update a user profile in Supabase (upsert by firebase_uid).
//
// Body: { firebaseUid, name, email, phone? }
// ---------------------------------------------------------------------------
router.post("/profile", async (req, res) => {
  try {
    const { firebaseUid, name, email, phone } = req.body;

    // Validate required fields
    if (!firebaseUid) return res.status(400).json({ success: false, error: "firebaseUid is required" });
    if (!name)        return res.status(400).json({ success: false, error: "name is required" });
    if (!email)       return res.status(400).json({ success: false, error: "email is required" });

    const sb  = getDb();
    const now = new Date().toISOString();

    // Check if user already exists
    const { data: existing } = await sb
      .from("users")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (existing) {
      await sb
        .from("users")
        .update({ name, email, phone: phone || null, updated_at: now })
        .eq("firebase_uid", firebaseUid);

      const { data: updated } = await sb
        .from("users")
        .select("*")
        .eq("firebase_uid", firebaseUid)
        .single();

      return res.status(200).json({
        success: true,
        message: "User profile updated successfully",
        data: toPublicProfile(updated),
      });
    }

    // Insert new
    const { data: created, error: insertErr } = await sb
      .from("users")
      .insert({
        firebase_uid: firebaseUid,
        name,
        email,
        phone: phone || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return res.status(201).json({
      success: true,
      message: "User profile created successfully",
      data: toPublicProfile(created),
    });

  } catch (err) {
    console.error("[users] POST /profile error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to save user profile",
      message: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/lookup-by-phone
// Public endpoint — resolves a phone number to the associated email address
// so the client can use it for Firebase email+password sign-in.
//
// Query param: phone (e.g. "+1 234 567 8900" or "1234567890")
// Returns: { success: true, email: "user@example.com" }
// ---------------------------------------------------------------------------
router.get("/lookup-by-phone", async (req, res) => {
  try {
    const raw = (req.query.phone || "").toString().trim();
    if (!raw) {
      return res.status(400).json({ success: false, error: "phone query parameter is required" });
    }

    const normalise = (p) => p.replace(/[\s\-().]/g, "");
    const normalised = normalise(raw);

    const sb = getDb();
    // Fetch all users and normalise phone in JS (Supabase JS client doesn't support SQL REPLACE)
    const { data: allUsers } = await sb.from("users").select("email, phone");
    const user = (allUsers || []).find(
      (u) => u.phone && (normalise(u.phone) === normalised || u.phone === raw)
    );

    if (!user) {
      return res.status(404).json({ success: false, error: "No account found with this phone number." });
    }

    return res.status(200).json({ success: true, email: user.email });
  } catch (err) {
    console.error("[users] GET /lookup-by-phone error:", err);
    return res.status(500).json({ success: false, error: "Lookup failed", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/profile
// Retrieve the authenticated user's profile from SQLite.
// Protected by verifyToken — requires valid Firebase JWT.
// ---------------------------------------------------------------------------
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const sb = getDb();
    const { data: user } = await sb
      .from("users")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: toPublicProfile(user),
    });

  } catch (err) {
    console.error("[users] GET /profile error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve user profile",
      message: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/send-activation-email
// Generates a UUID activation token (24-hour expiry), stores it in the user
// row, and emails the user a one-click activation link.
//
// Body: { email }
// ---------------------------------------------------------------------------
router.post("/send-activation-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "email is required" });

    const sb = getDb();
    const { data: user } = await sb
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (!user) return res.status(404).json({ success: false, error: "No account found with this email." });

    if (user.is_verified === true) {
      return res.status(200).json({ success: true, message: "Email already verified." });
    }

    // Generate a secure UUID token with 24-hour expiry
    const token   = randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await sb
      .from("users")
      .update({ verify_otp: token, otp_expires: expires, updated_at: new Date().toISOString() })
      .eq("email", email.toLowerCase().trim());

    // Build the activation URL pointing at the frontend
    const frontendUrl = process.env.FRONTEND_URL || "https://budgetbuddy1.vercel.app";
    const activationUrl = `${frontendUrl}/verify-email?token=${token}`;

    await sendActivationEmail(email, user.name, activationUrl);

    return res.status(200).json({ success: true, message: "Activation email sent. Please check your inbox." });
  } catch (err) {
    console.error("[users] POST /send-activation-email error:", err);
    return res.status(500).json({ success: false, error: "Failed to send activation email.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/activate-email?token=<uuid>
// Validates the activation token and marks the user as verified.
// Called by the frontend /verify-email page when the user clicks the link.
// ---------------------------------------------------------------------------
router.get("/activate-email", async (req, res) => {
  try {
    const token = (req.query.token || "").toString().trim();
    if (!token) return res.status(400).json({ success: false, error: "token is required" });

    const sb = getDb();
    const { data: user } = await sb
      .from("users")
      .select("*")
      .eq("verify_otp", token)
      .maybeSingle();

    if (!user)                                          return res.status(400).json({ success: false, error: "Invalid or expired activation link." });
    if (user.is_verified === true)                      return res.status(200).json({ success: true,  message: "Email already verified." });
    if (new Date(user.otp_expires) < new Date())        return res.status(400).json({ success: false, error: "Activation link has expired. Please request a new one." });

    await sb
      .from("users")
      .update({ is_verified: true, verify_otp: null, otp_expires: null, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    return res.status(200).json({ success: true, message: "Email verified successfully! You can now close this page." });
  } catch (err) {
    console.error("[users] GET /activate-email error:", err);
    return res.status(500).json({ success: false, error: "Verification failed.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/mark-phone-verified
// Called by the frontend after Firebase Phone Auth confirms the OTP.
// Firebase handles sending and verifying the SMS — this route simply records
// the verification outcome in SQLite.
// Protected by verifyToken — requires valid Firebase JWT.
// ---------------------------------------------------------------------------
router.post("/mark-phone-verified", verifyToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const sb = getDb();
    const { data: user } = await sb
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    await sb
      .from("users")
      .update({ is_phone_verified: true, updated_at: new Date().toISOString() })
      .eq("firebase_uid", firebaseUid);

    return res.status(200).json({ success: true, message: "Phone number verified successfully!" });
  } catch (err) {
    console.error("[users] POST /mark-phone-verified error:", err);
    return res.status(500).json({ success: false, error: "Failed to mark phone as verified.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/users/update-phone
// Updates the phone number stored in SQLite for the authenticated user.
// Firebase Phone Auth has already verified the new number on the client side
// before this endpoint is called.
// Protected by verifyToken — requires valid Firebase JWT.
//
// Body: { phone }  (E.164 format, e.g. "+919876543210")
// ---------------------------------------------------------------------------
router.patch("/update-phone", verifyToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { phone }   = req.body;

    if (!phone || typeof phone !== "string" || phone.trim().length < 5) {
      return res.status(400).json({ success: false, error: "A valid phone number is required." });
    }

    const sb  = getDb();
    const now = new Date().toISOString();
    const { data: user } = await sb
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (!user) {
      // Profile not created yet — create a minimal row using JWT claims
      const { email, name: tokenName } = req.user;
      const resolvedName  = tokenName || (email ? email.split("@")[0] : "User");
      const resolvedEmail = email || null;
      const { error: insertErr } = await sb.from("users").insert({
        firebase_uid:      firebaseUid,
        name:              resolvedName,
        email:             resolvedEmail,
        phone:             phone.trim(),
        is_phone_verified: true,
        created_at:        now,
        updated_at:        now,
      });
      if (insertErr) throw new Error(insertErr.message);
    } else {
      await sb
        .from("users")
        .update({ phone: phone.trim(), is_phone_verified: true, updated_at: now })
        .eq("firebase_uid", firebaseUid);
    }

    return res.status(200).json({ success: true, message: "Phone number updated successfully." });
  } catch (err) {
    console.error("[users] PATCH /update-phone error:", err);
    return res.status(500).json({ success: false, error: "Failed to update phone number.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/users/setup
// Called by the OnboardingWizard to save phone (step 1) or acknowledge
// currency preference (step 2, stored client-side in localStorage).
// Protected by verifyToken — requires valid Firebase JWT.
//
// Body: { phone?: string, currency?: string }
// ---------------------------------------------------------------------------
router.put("/setup", verifyToken, async (req, res) => {
  try {
    const { phone, currency } = req.body;
    const sb  = getDb();
    const now = new Date().toISOString();
    const uid = req.user.uid;

    const { data: user } = await sb
      .from("users")
      .select("id")
      .eq("firebase_uid", uid)
      .maybeSingle();

    if (!user) {
      // Row not yet created — create a minimal one so subsequent updates work.
      const { email, name: tokenName } = req.user;
      const resolvedName  = tokenName || (email ? email.split("@")[0] : "User");
      const resolvedEmail = email || null;
      const { error: insertErr } = await sb.from("users").insert({
        firebase_uid: uid,
        name:         resolvedName,
        email:        resolvedEmail,
        created_at:   now,
        updated_at:   now,
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    if (phone && typeof phone === "string" && phone.trim().length >= 5) {
      await sb
        .from("users")
        .update({ phone: phone.trim(), updated_at: now })
        .eq("firebase_uid", uid);
    }
    // currency is stored client-side; backend simply acknowledges.

    return res.status(200).json({ success: true, message: "Setup saved." });
  } catch (err) {
    console.error("[users] PUT /setup error:", err);
    return res.status(500).json({ success: false, error: "Setup failed.", message: err.message });
  }
});

module.exports = router;
