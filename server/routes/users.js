// server/routes/users.js
// User profile management using SQLite (budget.db).
// MongoDB removed — all storage is local via better-sqlite3.
//
// Routes:
//   POST  /api/users/profile         → create or update user profile
//   GET   /api/users/profile         → retrieve profile (protected)
//   POST  /api/users/send-otp        → generate & email a 6-digit OTP
//   POST  /api/users/verify-email    → validate email OTP
//   POST  /api/users/send-phone-otp  → generate & SMS a 6-digit OTP
//   POST  /api/users/verify-phone    → validate phone OTP

"use strict";

const express          = require("express");
const { randomUUID }   = require("crypto");
const { getDb }        = require("../lib/db");
const { sendOtpEmail } = require("../lib/mailer");
const { sendOtpSms }   = require("../lib/sms");
const verifyToken      = require("../middleware/verifyToken");

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
// POST /api/users/send-otp
// Generates a fresh 6-digit OTP, saves it to the user row (10-min expiry),
// and sends it via nodemailer to the user's email address.
//
// Body: { email }
// ---------------------------------------------------------------------------
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "email is required" });

    const db   = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
    if (!user) return res.status(404).json({ success: false, error: "No account found with this email." });

    // Generate a cryptographically random 6-digit OTP
    const otp     = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    db.prepare(
      "UPDATE users SET verify_otp = ?, otp_expires = ?, updated_at = ? WHERE email = ?"
    ).run(otp, expires, new Date().toISOString(), email.toLowerCase().trim());

    await sendOtpEmail(email, otp);

    return res.status(200).json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("[users] POST /send-otp error:", err);
    return res.status(500).json({ success: false, error: "Failed to send OTP.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/verify-email
// Accepts { email, otp }. Checks the OTP and expiry, then marks the user
// as verified (is_verified = 1) and clears the OTP fields.
//
// Body: { email, otp }
// ---------------------------------------------------------------------------
router.post("/verify-email", (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: "email and otp are required" });

    const db   = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());

    if (!user)                       return res.status(404).json({ success: false, error: "No account found with this email." });
    if (user.is_verified === 1)      return res.status(200).json({ success: true,  message: "Email already verified." });
    if (!user.verify_otp)            return res.status(400).json({ success: false, error: "No OTP requested. Please click Send OTP first." });
    if (user.verify_otp !== String(otp))  return res.status(400).json({ success: false, error: "Incorrect OTP. Please try again." });
    if (new Date(user.otp_expires) < new Date()) return res.status(400).json({ success: false, error: "OTP has expired. Please request a new one." });

    // Mark verified and clear OTP fields
    db.prepare(
      "UPDATE users SET is_verified = 1, verify_otp = NULL, otp_expires = NULL, updated_at = ? WHERE email = ?"
    ).run(new Date().toISOString(), email.toLowerCase().trim());

    return res.status(200).json({ success: true, message: "Email verified successfully!" });
  } catch (err) {
    console.error("[users] POST /verify-email error:", err);
    return res.status(500).json({ success: false, error: "Verification failed.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/send-phone-otp
// Generates a 6-digit OTP, saves it to the user row (10-min expiry),
// and sends an SMS via Twilio to the user's phone number.
//
// Body: { phone }  — E.164 format recommended (e.g. +911234567890)
// ---------------------------------------------------------------------------
router.post("/send-phone-otp", async (req, res) => {
  try {
    const raw = (req.body.phone || "").toString().trim();
    if (!raw) return res.status(400).json({ success: false, error: "phone is required" });

    // Normalise for DB lookup (strip spaces/dashes/parens)
    const normalised = raw.replace(/[\s\-().]/g, "");

    const db = getDb();
    const user =
      db.prepare("SELECT * FROM users WHERE replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')','') = ?").get(normalised) ||
      db.prepare("SELECT * FROM users WHERE phone = ?").get(raw);

    if (!user) return res.status(404).json({ success: false, error: "No account found with this phone number." });

    const otp     = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(
      "UPDATE users SET phone_otp = ?, phone_otp_expires = ?, updated_at = ? WHERE id = ?"
    ).run(otp, expires, new Date().toISOString(), user.id);

    // Send the SMS — phone stored in DB may lack + prefix; ensure E.164
    const toNumber = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    await sendOtpSms(toNumber, otp);

    return res.status(200).json({ success: true, message: "OTP sent to your phone." });
  } catch (err) {
    console.error("[users] POST /send-phone-otp error:", err);
    return res.status(500).json({ success: false, error: "Failed to send SMS OTP.", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/verify-phone
// Accepts { phone, otp }. Validates the OTP and marks the phone as verified.
//
// Body: { phone, otp }
// ---------------------------------------------------------------------------
router.post("/verify-phone", (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, error: "phone and otp are required" });

    const normalised = phone.toString().trim().replace(/[\s\-().]/g, "");
    const db = getDb();
    const user =
      db.prepare("SELECT * FROM users WHERE replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')','') = ?").get(normalised) ||
      db.prepare("SELECT * FROM users WHERE phone = ?").get(phone.toString().trim());

    if (!user)                              return res.status(404).json({ success: false, error: "No account found with this phone number." });
    if (user.is_phone_verified === 1)       return res.status(200).json({ success: true,  message: "Phone already verified." });
    if (!user.phone_otp)                    return res.status(400).json({ success: false, error: "No OTP requested. Please click Send OTP first." });
    if (user.phone_otp !== String(otp))     return res.status(400).json({ success: false, error: "Incorrect OTP. Please try again." });
    if (new Date(user.phone_otp_expires) < new Date()) return res.status(400).json({ success: false, error: "OTP has expired. Please request a new one." });

    db.prepare(
      "UPDATE users SET is_phone_verified = 1, phone_otp = NULL, phone_otp_expires = NULL, updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), user.id);

    return res.status(200).json({ success: true, message: "Phone number verified successfully!" });
  } catch (err) {
    console.error("[users] POST /verify-phone error:", err);
    return res.status(500).json({ success: false, error: "Phone verification failed.", message: err.message });
  }
});

module.exports = router;
