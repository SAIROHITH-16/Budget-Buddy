"use strict";

// server/routes/budget.js
// Budget limit routes — protected by verifyToken middleware.
//
//   GET  /api/budget   → return the user's budget (or sensible defaults)
//   POST /api/budget   → upsert monthlyLimit and alertThreshold

const express     = require("express");
const db          = require("../lib/db");
const verifyToken = require("../middleware/verifyToken");

const BG_COLL = "budgets";

const router = express.Router();
router.use(verifyToken);

// ---------------------------------------------------------------------------
// GET /api/budget
// Returns the current budget document for the authenticated user.
// If no document exists yet, returns the schema defaults without persisting.
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const budget = await db.findOne(BG_COLL, { uid: req.user.uid });
    if (!budget) return res.json({ monthlyLimit: 0, alertThreshold: 80 });
    res.json({ monthlyLimit: budget.monthlyLimit, alertThreshold: budget.alertThreshold });
  } catch (err) {
    console.error("[budget] GET error:", err);
    res.status(500).json({ error: "Failed to fetch budget" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/budget
// Upserts the user's budget document with the provided values.
// Validates that monthlyLimit >= 0 and alertThreshold is 1–100.
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const { monthlyLimit, alertThreshold } = req.body;

    // --- input validation ---
    if (monthlyLimit !== undefined && (typeof monthlyLimit !== "number" || monthlyLimit < 0)) {
      return res.status(400).json({ error: "monthlyLimit must be a number >= 0" });
    }
    if (alertThreshold !== undefined && (typeof alertThreshold !== "number" || alertThreshold < 1 || alertThreshold > 100)) {
      return res.status(400).json({ error: "alertThreshold must be a number between 1 and 100" });
    }

    const updates = {};
    if (monthlyLimit  !== undefined) updates.monthlyLimit  = monthlyLimit;
    if (alertThreshold !== undefined) updates.alertThreshold = alertThreshold;

    const budget = await db.upsertByUid(BG_COLL, req.user.uid, updates);
    res.json({ monthlyLimit: budget.monthlyLimit ?? 0, alertThreshold: budget.alertThreshold ?? 80 });
  } catch (err) {
    console.error("[budget] POST error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to save budget" });
  }
});

module.exports = router;
