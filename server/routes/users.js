// server/routes/users.js
// User profile management using SQLite (budget.db).
// MongoDB removed — all storage is local via better-sqlite3.
//
// Routes:
//   POST  /api/users/profile        → create or update user profile
//   GET   /api/users/profile        → retrieve profile (protected)
//   POST  /api/users/send-otp       → send 6-digit OTP to email or phone
//   POST  /api/users/verify-otp     → verify OTP code

"use strict";

const express        = require("express");
const { randomUUID } = require("crypto");
const { getDb }      = require("../lib/db");
const verifyToken    = require("../middleware/verifyToken");

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
// In-memory OTP store  { key → { code, expiresAt } }
// Key format: "email:<address>" or "phone:<number>"
// ---------------------------------------------------------------------------
const otpStore = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------------------------------------------------------------------------
// POST /api/users/send-otp
// Body: { type: "email"|"phone", target: string, deliverTo?: string }
//   type      — "email" verifies the email address; "phone" verifies the phone
//   target    — the value being verified (email address or phone number)
//   deliverTo — for type="phone", the email address to deliver the code to
//               (since SMS requires a third-party provider)
// ---------------------------------------------------------------------------
router.post("/send-otp", async (req, res) => {
  const { type, target, deliverTo } = req.body;

  if (!type || !target) {
    return res.status(400).json({ error: "type and target are required" });
  }
  if (!["email", "phone"].includes(type)) {
    return res.status(400).json({ error: 'type must be "email" or "phone"' });
  }
  if (type === "phone" && !deliverTo) {
    return res.status(400).json({ error: "deliverTo (email) is required for phone OTP delivery" });
  }

  const code       = generateOtp();
  const key        = `${type}:${target}`;
  const expiresAt  = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore.set(key, { code, expiresAt });

  const recipient = type === "email" ? target : deliverTo;
  const subject   = type === "email"
    ? "Budget Buddy — Email Verification Code"
    : "Budget Buddy — Phone Verification Code";
  const body =
    type === "email"
      ? `Your email verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`
      : `Your phone number verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`;

  try {
    const { sendMail } = require("../lib/mailer");
    await sendMail({ to: recipient, subject, text: body });
    return res.json({ success: true });
  } catch (err) {
    if (err.message === "SMTP_NOT_CONFIGURED") {
      // Development fallback — return the code directly so the app still works
      // without email configuration.  In production, configure SMTP_* env vars.
      console.warn("[OTP] SMTP not configured — returning code in response (dev only)");
      return res.json({ success: true, devCode: code });
    }
    console.error("[OTP] send-otp error:", err);
    return res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/verify-otp
// Body: { type: "email"|"phone", target: string, code: string }
// ---------------------------------------------------------------------------
router.post("/verify-otp", (req, res) => {
  const { type, target, code } = req.body;

  if (!type || !target || !code) {
    return res.status(400).json({ error: "type, target, and code are required" });
  }

  const key    = `${type}:${target}`;
  const stored = otpStore.get(key);

  if (!stored) {
    return res.status(400).json({ error: "No OTP found. Please request a new code." });
  }
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return res.status(400).json({ error: "Code has expired. Please request a new one." });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }

  otpStore.delete(key);
  return res.json({ success: true });
});

module.exports = router;
