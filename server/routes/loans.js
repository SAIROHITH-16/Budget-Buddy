// server/routes/loans.js
// Protected API routes for lending/repayment tracking.
//
// Routes:
//   GET  /api/loans/pending    → list PENDING, PARTIALLY_REPAID, and OVERDUE loans
//   POST /api/loans/repayment  → atomically record a repayment against a loan

"use strict";

const express        = require("express");
const { randomUUID } = require("crypto");
const { getDb }      = require("../lib/db");
const verifyToken    = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

// ---------------------------------------------------------------------------
// Helper: map a raw SQLite row to the camelCase shape the frontend expects.
// Mirrors the pattern from lib/db.js fromRow() for loan-specific fields.
// ---------------------------------------------------------------------------
function loanFromRow(row) {
  if (!row) return null;
  return {
    id:              row.id,
    uid:             row.uid,
    type:            row.type,
    amount:          row.amount,
    category:        row.category,
    description:     row.description,
    date:            row.date,
    borrowerName:    row.borrower_name   ?? null,
    dueDate:         row.due_date        ?? null,
    repaidAmount:    row.repaid_amount   ?? 0,
    remainingAmount: row.remaining_amount ?? row.amount ?? 0,
    loanStatus:      row.loan_status     ?? "PENDING",
    createdAt:       row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/loans/pending
// Returns all LENT transactions for the user that are not yet fully repaid.
// Includes PENDING, PARTIALLY_REPAID, and OVERDUE records.
//
// Response: array of loan objects (see loanFromRow shape above)
// ---------------------------------------------------------------------------
router.get("/pending", async (req, res) => {
  try {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT * FROM transactions
      WHERE uid = ? AND type = 'lent'
        AND loan_status IN ('PENDING', 'PARTIALLY_REPAID', 'OVERDUE')
      ORDER BY date DESC, id DESC
    `).all(req.user.uid);

    // Auto-mark as OVERDUE server-side if due date has passed
    const today = new Date();
    const loans = rows.map((row) => {
      const loan = loanFromRow(row);
      if (
        loan.loanStatus !== "FULLY_REPAID" &&
        loan.dueDate &&
        new Date(loan.dueDate) < today
      ) {
        if (loan.loanStatus !== "OVERDUE") {
          db.prepare(`UPDATE transactions SET loan_status = 'OVERDUE' WHERE id = ?`)
            .run(row.id);
          loan.loanStatus = "OVERDUE";
        }
      }
      return loan;
    });

    return res.json(loans);
  } catch (err) {
    console.error("[GET /loans/pending] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error: failed to fetch pending loans.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/loans/repayment
// Records a (partial or full) repayment against an existing LENT transaction.
//
// Request body (JSON):
//   { "loanId": "<transaction id>", "amount": number }
//
// Atomically (SQLite transaction):
//   1. Adds `amount` to repaidAmount on the loan record
//   2. Recalculates remainingAmount
//   3. Updates loanStatus (PARTIALLY_REPAID → FULLY_REPAID when remaining = 0)
//   4. Creates a new "repaid" transaction for the returned money
//
// Response (201):
//   { success: true, loan: {...}, repaymentTransaction: {...} }
// ---------------------------------------------------------------------------
router.post("/repayment", async (req, res) => {
  const { loanId, amount } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!loanId || !amount) {
    return res.status(400).json({
      success: false,
      message: "Bad request: loanId and amount are required.",
    });
  }
  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Bad request: amount must be a positive number.",
    });
  }

  try {
    const db = getDb();

    // ── Ownership + existence check (outside the transaction for early exit) ─
    const loanRow = db.prepare(
      `SELECT * FROM transactions WHERE id = ? AND uid = ? AND type = 'lent' LIMIT 1`
    ).get(loanId, req.user.uid);

    if (!loanRow) {
      return res.status(404).json({
        success: false,
        message: "Loan not found or does not belong to this account.",
      });
    }
    if (loanRow.loan_status === "FULLY_REPAID") {
      return res.status(400).json({
        success: false,
        message: "This loan has already been fully repaid.",
      });
    }

    // ── Atomic update ─────────────────────────────────────────────────────────
    let updatedLoanRow, repaymentRow;

    db.transaction(() => {
      const currentRepaid = loanRow.repaid_amount || 0;
      const newRepaid     = currentRepaid + parsedAmount;
      const originalAmt   = loanRow.amount || 0;
      const newRemaining  = Math.max(0, originalAmt - newRepaid);

      // Determine new status
      let newStatus;
      if (newRemaining <= 0) {
        newStatus = "FULLY_REPAID";
      } else if (newRepaid > 0) {
        // Check overdue before assigning PARTIALLY_REPAID
        const isOverdue =
          loanRow.due_date && new Date(loanRow.due_date) < new Date();
        newStatus = isOverdue ? "OVERDUE" : "PARTIALLY_REPAID";
      } else {
        newStatus = "PENDING";
      }

      // 1. Update the loan record
      db.prepare(`
        UPDATE transactions
        SET repaid_amount = ?, remaining_amount = ?, loan_status = ?
        WHERE id = ?
      `).run(newRepaid, newRemaining, newStatus, loanId);

      // 2. Create a REPAID transaction (money returning to the user)
      const repayId   = randomUUID();
      const today     = new Date().toISOString().substring(0, 10);
      const borrower  = loanRow.borrower_name || "friend";
      const desc      = `Repaid by ${borrower}`;

      db.prepare(`
        INSERT INTO transactions
          (id, uid, type, amount, category, description, date,
           needs_review, ai_categorized, borrower_name, loan_status)
        VALUES (?, ?, 'repaid', ?, 'Loan Repayment', ?, ?, 0, 0, ?, 'FULLY_REPAID')
      `).run(
        repayId, req.user.uid, parsedAmount, desc, today,
        loanRow.borrower_name || null
      );

      // Read back the updated rows
      updatedLoanRow = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(loanId);
      repaymentRow   = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(repayId);
    })();

    return res.status(201).json({
      success:              true,
      loan:                 loanFromRow(updatedLoanRow),
      repaymentTransaction: loanFromRow(repaymentRow),
    });
  } catch (err) {
    console.error("[POST /loans/repayment] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error: failed to process repayment.",
    });
  }
});

module.exports = router;
