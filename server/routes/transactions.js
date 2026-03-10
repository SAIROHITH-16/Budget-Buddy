// server/routes/transactions.js
// Full manual Express route implementation for transaction CRUD.
// No template. No scaffold. Route-level verifyToken protection is explicit.
//
// All routes in this file are protected by the verifyToken middleware.
// verifyToken must run and succeed (200 OK from Firebase verification) before
// any route handler executes. If the token is invalid, verifyToken sends
// a 401 response and stops the request — route handlers never run.
//
// Routes:
//   GET    /api/transactions         → list all transactions for the signed-in user
//   POST   /api/transactions         → create a new transaction
//   PUT    /api/transactions/:id     → update a transaction (ownership verified)
//   DELETE /api/transactions/:id     → delete a transaction (ownership verified)

"use strict";

const express  = require("express");
// verifyToken middleware
const verifyToken         = require("../middleware/verifyToken");
// SQLite database layer
const db                  = require("../lib/db");
// Server-side AI categorization
const { categorizeBatch } = require("../lib/categorize");

// ID validation — accepts any non-empty string (UUIDs from SQLite)
const isValidId = (id) => typeof id === "string" && id.trim().length > 0;

// Plain-JS row validator (replaces Mongoose validateSync)
function validateRow(item) {
  const errs = [];
  if (!item.type || !["income","expense","lent","repaid"].includes(item.type)) errs.push("type: must be income, expense, lent, or repaid");
  if (item.amount === undefined || isNaN(Number(item.amount))) errs.push("amount: must be a number");
  if (!item.date) errs.push("date: required");
  return errs;
}

const TX_COLL = "transactions";

const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware: apply verifyToken to ALL routes in this router.
// Any request that reaches this router without a valid Firebase token is
// rejected with 401 before the route handler runs.
// ---------------------------------------------------------------------------
router.use(verifyToken);

// ---------------------------------------------------------------------------
// GET /api/transactions
// List transactions for the authenticated user with optional filtering,
// search, and pagination.
//
// Query parameters (all optional):
//   page      – page number, 1-based (default: 1)
//   limit     – records per page (default: 20, max: 100)
//   search    – partial, case-insensitive match on description
//   category  – exact category match
//   type      – "income" or "expense"
//   startDate – ISO date string, inclusive lower bound on date (YYYY-MM-DD)
//   endDate   – ISO date string, inclusive upper bound on date (YYYY-MM-DD)
//
// Response shape:
//   {
//     "data":         [...],   // array of transaction objects
//     "totalRecords": 42,      // total documents matching the filter
//     "totalPages":   3,       // ceil(totalRecords / limit)
//     "currentPage":  1        // the page that was returned
//   }
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    // Allow callers (e.g. Dashboard totals) to request up to 10 000 records at once.
    // Default stays 20 for paginated list views.
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    // Build base filter — uid is always required
    const firestoreFilter = { uid: req.user.uid };
    // Allow filtering by any valid type (income, expense, lent, repaid)
    const validTypes = ["income", "expense", "lent", "repaid"];
    if (req.query.type && validTypes.includes(req.query.type)) {
      firestoreFilter.type = req.query.type;
    }

    // Fetch all matching docs sorted by date desc, then filter in memory
    const { docs: allDocs } = await db.find(TX_COLL, firestoreFilter, {
      sort: { date: -1, _id: -1 },
    });

    // In-memory filters
    const searchTerm  = req.query.search?.trim().toLowerCase()  || "";
    const categoryStr = req.query.category?.trim().toLowerCase() || "";

    let startTs = null, endTs = null;
    if (req.query.startDate) { const d = new Date(req.query.startDate); if (!isNaN(d)) startTs = d.getTime(); }
    if (req.query.endDate)   { const d = new Date(req.query.endDate); if (!isNaN(d)) { d.setHours(23,59,59,999); endTs = d.getTime(); } }

    const filtered = allDocs.filter((t) => {
      if (searchTerm  && !String(t.description ?? "").toLowerCase().includes(searchTerm))  return false;
      if (categoryStr && String(t.category ?? "").toLowerCase() !== categoryStr)           return false;
      if (startTs !== null || endTs !== null) {
        const tMs = new Date(t.date).getTime();
        if (startTs !== null && tMs < startTs) return false;
        if (endTs   !== null && tMs > endTs)   return false;
      }
      return true;
    });

    const totalRecords = filtered.length;
    const data         = filtered.slice(skip, skip + limit);

    return res.status(200).json({
      data,
      totalRecords,
      totalPages:  Math.ceil(totalRecords / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("[GET /transactions] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: failed to retrieve transactions.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/transactions
// Create a new transaction for the authenticated user.
//
// Request body (JSON):
//   {
//     "type":        "income" | "expense",   (required)
//     "amount":      number,                  (required, > 0)
//     "category":    string,                  (required)
//     "description": string,                  (required)
//     "date":        "YYYY-MM-DD"             (required)
//   }
// ---------------------------------------------------------------------------
router.post("/", async (req, res) => {
  const { type, amount, category, description, date, borrowerName, dueDate } = req.body;

  // -------------------------------------------------------------------------
  // Basic input validation — respond 400 for missing required fields
  // -------------------------------------------------------------------------
  const missingFields = [];
  if (!type)        missingFields.push("type");
  if (!amount)      missingFields.push("amount");
  if (!description) missingFields.push("description");
  if (!date)        missingFields.push("date");

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Bad request: missing required fields: ${missingFields.join(", ")}.`,
    });
  }

  // Validate type enum
  if (!["income", "expense", "lent", "repaid"].includes(type)) {
    return res.status(400).json({
      success: false,
      message: `Bad request: type must be one of: income, expense, lent, repaid.`,
    });
  }

  // LENT requires a borrower name
  if (type === "lent" && !String(borrowerName ?? "").trim()) {
    return res.status(400).json({
      success: false,
      message: "Bad request: borrowerName is required for lent transactions.",
    });
  }

  // Validate numeric amount
  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Bad request: amount must be a positive number.",
    });
  }

  // Validate date is a real date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      message: "Bad request: date is not a valid ISO date string.",
    });
  }

  // -------------------------------------------------------------------------
  // Build the document to insert
  // -------------------------------------------------------------------------
  const doc = {
    uid:         req.user.uid,
    type,
    amount:      parsedAmount,
    category:    category?.trim() || (type === "lent" ? "Loan" : "Uncategorized"),
    description: description.trim(),
    date:        typeof date === "string" ? date : parsedDate.toISOString().substring(0, 10),
  };

  // Attach loan-specific fields when lending money
  if (type === "lent") {
    doc.borrowerName    = String(borrowerName).trim();
    doc.remainingAmount = parsedAmount;
    doc.loanStatus      = "PENDING";
    if (dueDate) {
      const parsedDue = new Date(dueDate);
      if (!isNaN(parsedDue.getTime())) doc.dueDate = dueDate;
    }
  }

  // -------------------------------------------------------------------------
  // Insert via SQLite
  // -------------------------------------------------------------------------
  try {
    const saved = await db.insertOne(TX_COLL, doc);
    return res.status(201).json(saved);
  } catch (error) {
    console.error("[POST /transactions] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: failed to create transaction.",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/transactions/pending
// Return all transactions for this user where needsReview === true,
// sorted newest-first.
//
// ⚠️  Must be defined before /:id so the literal string "pending" is never
//     treated as a MongoDB ObjectId parameter.
//
// Response: array of transaction objects (same shape as GET /api/transactions data[])
// ---------------------------------------------------------------------------
router.get("/pending", async (req, res) => {
  try {
    const { docs: data } = await db.find(
      TX_COLL,
      { uid: req.user.uid, needsReview: true },
      { sort: { date: -1 } }
    );
    return res.json(data);
  } catch (error) {
    console.error("[GET /transactions/pending] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: failed to retrieve pending transactions.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/transactions/import
// Import an array of bank-CSV transactions into the review queue.
//
// ⚠️  Must be defined before /:id.
//
// Every imported transaction is flagged needsReview:true so the user can
// review and add personal descriptions at the end of the day.
//
// Duplicate handling — "upsert-on-insert" strategy with bulkWrite:
//   Each operation targets { uid, bankReferenceId }.  If a document with
//   that pair already exists it is left completely untouched ($setOnInsert
//   only runs on a real insert, never on an update).  This means:
//     • Re-uploading the same statement produces 0 new documents.
//     • A user who has already reviewed a duplicate is not overwritten.
//
// Request body:
//   {
//     "transactions": [
//       {
//         "bankReferenceId": "TXN-20260224-001",  // required for dedup
//         "type":        "expense",
//         "amount":      45.00,
//         "category":    "Groceries",
//         "description": "POS WOOLWORTHS",
//         "date":        "2026-02-24"
//       },
//       ...
//     ]
//   }
//
// Response (201):
//   { inserted: 3, duplicates: 2, total: 5 }
// ---------------------------------------------------------------------------
router.post("/import", async (req, res) => {
  const { transactions } = req.body;

  // ── 1. Shape validation ──────────────────────────────────────────────────
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Bad request: req.body.transactions must be a non-empty array.",
    });
  }

  const MAX_BATCH = 1000;
  if (transactions.length > MAX_BATCH) {
    return res.status(400).json({
      success: false,
      message: `Bad request: batch size ${transactions.length} exceeds the maximum of ${MAX_BATCH}.`,
    });
  }

  // ── 2. Per-row pre-validation ────────────────────────────────────────────
  const validDocs  = [];  // plain doc objects ready to insert
  const rowErrors  = [];

  transactions.forEach((item, index) => {
    const rowNum = index + 1;

    // bankReferenceId is required for the dedup guarantee
    if (!item.bankReferenceId || typeof item.bankReferenceId !== "string") {
      rowErrors.push({ row: rowNum, errors: ["bankReferenceId is required for import"] });
      return;
    }

    const errs = validateRow(item);
    if (errs.length > 0) {
      rowErrors.push({ row: rowNum, errors: errs });
      return;
    }

    validDocs.push({
      uid:             req.user.uid,
      bankReferenceId: item.bankReferenceId.trim(),
      type:            item.type,
      amount:          Number(item.amount),
      category:        item.category?.trim() || "Uncategorized",
      description:     item.description?.trim() || "Imported transaction",
      date:            item.date,
      needsReview:     true,
    });
  });

  // Reject the entire batch if any row failed pre-validation
  if (rowErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Validation failed: ${rowErrors.length} of ${transactions.length} row(s) are invalid. Nothing was saved.`,
      invalid: rowErrors,
    });
  }

  // ── 3. AI categorization ───────────────────────────────────────────────────
  try {
    const uncategorisedIndices = validDocs
      .map((doc, i) => doc.category === "Uncategorized" ? i : -1)
      .filter((i) => i !== -1);

    if (uncategorisedIndices.length > 0) {
      const descriptions = uncategorisedIndices.map((i) => validDocs[i].description);
      const aiCategories = await categorizeBatch(descriptions);

      uncategorisedIndices.forEach((docIdx, pos) => {
        const predicted = aiCategories[pos];
        if (predicted && predicted !== "Uncategorized") {
          validDocs[docIdx].category = predicted;
        }
      });
    }
  } catch (aiErr) {
    console.warn("[POST /import] AI categorization failed, proceeding without:", aiErr.message);
  }

  // ── 4. Dedup-aware insert ─────────────────────────────────────────────────
  try {
    const allRefIds   = validDocs.map((d) => d.bankReferenceId);
    const existingSet = await db.existingRefIds(TX_COLL, req.user.uid, allRefIds);

    const newDocs    = validDocs.filter((d) => !existingSet.has(d.bankReferenceId));
    const duplicates = validDocs.length - newDocs.length;
    let   inserted   = 0;

    if (newDocs.length > 0) {
      const result = await db.insertMany(TX_COLL, newDocs);
      inserted = result.length;
    }

    return res.status(201).json({ success: true, inserted, duplicates, total: validDocs.length });
  } catch (error) {
    console.error("[POST /transactions/import] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error: bulk import failed.",
      detail:  error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/transactions/bulk
// Insert an array of transactions for the authenticated user in one operation.
//
// ⚠️  This route MUST be defined before PUT/DELETE /:id so that the literal
//     path segment "bulk" is never matched as a MongoDB ObjectId parameter.
//
// Request body (JSON):
//   {
//     "transactions": [
//       { "type": "expense", "amount": 12.5, "category": "Food",
//         "description": "Lunch", "date": "2026-02-24" },
//       ...
//     ]
//   }
//
// Validation strategy — "all or nothing":
//   1. Every row is validated in-process with Mongoose's validateSync()
//      before any write reaches MongoDB.
//   2. If ANY row is invalid, the entire request is rejected with 400 and
//      a per-row error report. Nothing is written.
//   3. Only when all rows pass do we call insertMany(), which is a single
//      bulk-write round-trip instead of N individual saves.
//
// Response (201):
//   {
//     "inserted": 47,               // number of documents saved
//     "ids": ["<ObjectId>", ...]    // new _id values, in input order
//   }
// ---------------------------------------------------------------------------
router.post("/bulk", async (req, res) => {
  const { transactions } = req.body;

  // -------------------------------------------------------------------------
  // 1. Top-level shape validation
  // -------------------------------------------------------------------------
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Bad request: req.body.transactions must be a non-empty array.",
    });
  }

  // Hard cap to prevent accidental or malicious oversized payloads
  const MAX_BATCH = 1000;
  if (transactions.length > MAX_BATCH) {
    return res.status(400).json({
      success: false,
      message: `Bad request: batch size ${transactions.length} exceeds the maximum of ${MAX_BATCH}.`,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Per-row validation using the plain validateRow() helper.
  //    Collect ALL errors first so the caller gets a complete picture in a
  //    single round-trip.
  // -------------------------------------------------------------------------
  const docs   = [];   // valid plain objects ready for SQLite insert
  const errors = [];   // { row, errors } for every invalid row

  transactions.forEach((item, index) => {
    const rowNum = index + 1;  // 1-based for human-readable messages

    const errs = validateRow(item);
    if (errs.length > 0) {
      errors.push({ row: rowNum, errors: errs });
      return;
    }

    docs.push({
      uid:         req.user.uid,
      type:        item.type,
      amount:      Number(item.amount),
      category:    item.category?.trim()    || "Uncategorized",
      description: item.description?.trim() || "",
      date:        item.date,
    });
  });

  // If any row failed validation, reject the entire batch.
  if (errors.length > 0) {
    return res.status(400).json({
      success:  false,
      message:  `Validation failed: ${errors.length} of ${transactions.length} row(s) are invalid. Nothing was saved.`,
      invalid:  errors,
    });
  }

  // -------------------------------------------------------------------------
  // 3. Bulk insert — single SQLite transaction.
  // -------------------------------------------------------------------------
  try {
    const result = await db.insertMany(TX_COLL, docs);
    return res.status(201).json({ success: true, inserted: result.length, ids: result.map(d => d._id) });
  } catch (error) {
    console.error("[POST /transactions/bulk] Error:", error);
    return res.status(500).json({ success: false, message: "Server error: bulk insert failed.", detail: error.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/transactions/:id
// Update an existing transaction.
// Ownership is verified: req.user.uid must match the document's uid.
//
// Request body (JSON) — same shape as POST:
//   {
//     "type":        "income" | "expense",
//     "amount":      number,
//     "category":    string,
//     "description": string,
//     "date":        "YYYY-MM-DD"
//   }
// ---------------------------------------------------------------------------
router.put("/:id", async (req, res) => {
  const { id } = req.params;

  // -------------------------------------------------------------------------
  // Validate that the provided id is a valid MongoDB ObjectId format
  // -------------------------------------------------------------------------
  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: `Bad request: "${id}" is not a valid transaction ID.`,
    });
  }

  const { type, amount, category, description, date, needsReview } = req.body;

  // Build the update object — only include fields that were provided
  const updates = {};
  if (type !== undefined)        updates.type = type;
  if (amount !== undefined)      updates.amount = Number(amount);
  if (category !== undefined)    updates.category = category.trim();
  if (description !== undefined) updates.description = description.trim();
  if (date !== undefined)        updates.date = typeof date === "string" ? date : date;
  if (needsReview !== undefined) updates.needsReview = Boolean(needsReview);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Bad request: no fields to update were provided.",
    });
  }

  try {
    const updated = await db.findOneAndUpdate(
      TX_COLL,
      { _id: id, uid: req.user.uid },
      { $set: updates }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Transaction not found or you do not have permission to modify it." });
    }
    return res.status(200).json(updated);
  } catch (error) {
    console.error("[PUT /transactions/:id] Error:", error);
    return res.status(500).json({ success: false, message: "Server error: failed to update transaction." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/transactions/:id
// Delete a transaction.
// Ownership is verified: req.user.uid must match the document's uid.
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: `Bad request: "${id}" is not a valid transaction ID.`,
    });
  }

  try {
    const deleted = await db.findOneAndDelete(TX_COLL, { _id: id, uid: req.user.uid });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Transaction not found or you do not have permission to delete it." });
    }
    return res.status(200).json({ success: true, message: "Transaction deleted successfully.", deletedId: id });
  } catch (error) {
    console.error("[DELETE /transactions/:id] Error:", error);
    return res.status(500).json({ success: false, message: "Server error: failed to delete transaction." });
  }
});

module.exports = router;
