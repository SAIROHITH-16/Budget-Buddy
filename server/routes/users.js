// server/routes/users.js
// User profile management using SQLite (budget.db).
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
    id:              row.id,
    firebaseUid:     row.firebase_uid,
    name:            row.name,
    email:           row.email,
    phone:           row.phone || null,
    isVerified:      row.is_verified === 1,
    isPhoneVerified: row.is_phone_verified === 1,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// POST /api/users/profile
// Create or update a user profile in SQLite (upsert by firebase_uid).
//
// Body: { firebaseUid, name, email, phone? }
// ---------------------------------------------------------------------------
router.post("/profile", (req, res) => {
  try {
    const { firebaseUid, name, email, phone } = req.body;

    // Validate required fields
    if (!firebaseUid) return res.status(400).json({ success: false, error: "firebaseUid is required" });
    if (!name)        return res.status(400).json({ success: false, error: "name is required" });
    if (!email)       return res.status(400).json({ success: false, error: "email is required" });

    const db  = getDb();
    const now = new Date().toISOString();

    // Check if user already exists
    const existing = db.prepare(
      "SELECT * FROM users WHERE firebase_uid = ?"
    ).get(firebaseUid);

    if (existing) {
      // Update
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, updated_at = ?
        WHERE firebase_uid = ?
      `).run(name, email, phone || null, now, firebaseUid);

      const updated = db.prepare(
        "SELECT * FROM users WHERE firebase_uid = ?"
      ).get(firebaseUid);

      return res.status(200).json({
        success: true,
        message: "User profile updated successfully",
        data: toPublicProfile(updated),
      });
    }

    // Insert new
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, firebase_uid, name, email, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, firebaseUid, name, email, phone || null, now, now);

    const created = db.prepare(
      "SELECT * FROM users WHERE id = ?"
    ).get(id);

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
router.get("/lookup-by-phone", (req, res) => {
  try {
    const raw = (req.query.phone || "").toString().trim();
    if (!raw) {
      return res.status(400).json({ success: false, error: "phone query parameter is required" });
    }

    // Normalise: strip spaces, dashes, parentheses for matching
    const normalised = raw.replace(/[\s\-().]/g, "");

    const db = getDb();
    // Try exact match first, then normalised
    const user =
      db.prepare("SELECT email FROM users WHERE replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')','') = ?").get(normalised) ||
      db.prepare("SELECT email FROM users WHERE phone = ?").get(raw);

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
router.get("/profile", verifyToken, (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const db   = getDb();
    const user = db.prepare(
      "SELECT * FROM users WHERE firebase_uid = ?"
    ).get(firebaseUid);

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

    const db   = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ success: false, error: "No account found with this email." });

    if (user.is_verified === 1) {
      return res.status(200).json({ success: true, message: "Email already verified." });
    }

    // Generate a secure UUID token with 24-hour expiry
    const token   = randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "UPDATE users SET verify_otp = ?, otp_expires = ?, updated_at = ? WHERE email = ?"
    ).run(token, expires, new Date().toISOString(), email.toLowerCase().trim());

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
router.get("/activate-email", (req, res) => {
  try {
    const token = (req.query.token || "").toString().trim();
    if (!token) return res.status(400).json({ success: false, error: "token is required" });

    const db   = getDb();
    const user = db.prepare("SELECT * FROM users WHERE verify_otp = ?").get(token);

    if (!user)                           return res.status(400).json({ success: false, error: "Invalid or expired activation link." });
    if (user.is_verified === 1)          return res.status(200).json({ success: true,  message: "Email already verified." });
    if (new Date(user.otp_expires) < new Date()) return res.status(400).json({ success: false, error: "Activation link has expired. Please request a new one." });

    db.prepare(
      "UPDATE users SET is_verified = 1, verify_otp = NULL, otp_expires = NULL, updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), user.id);

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
router.post("/mark-phone-verified", verifyToken, (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE firebase_uid = ?").get(firebaseUid);

    if (!user) {
      return res.status(404).json({ success: false, error: "User profile not found." });
    }

    db.prepare(
      "UPDATE users SET is_phone_verified = 1, updated_at = ? WHERE firebase_uid = ?"
    ).run(new Date().toISOString(), firebaseUid);

    return res.status(200).json({ success: true, message: "Phone number verified successfully!" });
  } catch (err) {
    console.error("[users] POST /mark-phone-verified error:", err);
    return res.status(500).json({ success: false, error: "Failed to mark phone as verified.", message: err.message });
  }
});

module.exports = router;
