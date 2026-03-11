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
    const sb = getDb();
    const { data: rows, error } = await sb
      .from("transactions")
      .select("*")
      .eq("uid", req.user.uid)
      .eq("type", "lent")
      .in("loan_status", ["PENDING", "PARTIALLY_REPAID", "OVERDUE"])
      .order("date", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);

    // Auto-mark as OVERDUE server-side if due date has passed
    const today = new Date();
    const loans = await Promise.all((rows || []).map(async (row) => {
      const loan = loanFromRow(row);
      if (
        loan.loanStatus !== "FULLY_REPAID" &&
        loan.dueDate &&
        new Date(loan.dueDate) < today &&
        loan.loanStatus !== "OVERDUE"
      ) {
        await sb.from("transactions").update({ loan_status: "OVERDUE" }).eq("id", row.id);
        loan.loanStatus = "OVERDUE";
      }
      return loan;
    }));

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
// Steps (sequential — Supabase service-role key, auth enforced by verifyToken):
//   1. Validate inputs.
//   2. Find & validate the original LENT transaction (ownership + status checks).
//   3. Reject if repayment amount exceeds what is still owed.
//   4. Update original loan: repaidAmount ↑, remainingAmount ↓, recalculate status.
//   5. Create a new "repaid" transaction (records money returning to the user's
//      balance — this is the wallet credit; balance is derived from all transactions).
//
// Response (201):
//   { success: true, loan: {...}, repaymentTransaction: {...} }
// ---------------------------------------------------------------------------
router.post("/repayment", async (req, res) => {
  const { loanId, amount } = req.body;
  const userId = req.user.uid;

  // ── 1. Input validation ───────────────────────────────────────────────────
  if (!loanId || amount === undefined || amount === null) {
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
    const sb = getDb();

    // ── 2. Find & validate the original LENT transaction ─────────────────────
    const { data: loanRow, error: fetchErr } = await sb
      .from("transactions")
      .select("*")
      .eq("id", loanId)
      .eq("uid", userId)
      .eq("type", "lent")
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

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

    // ── 3. Guard: repayment cannot exceed remaining balance ───────────────────
    const currentRepaid  = Number(loanRow.repaid_amount)   || 0;
    const currentRemain  = Number(loanRow.remaining_amount) ?? Number(loanRow.amount) ?? 0;

    if (parsedAmount > currentRemain) {
      return res.status(400).json({
        success: false,
        message: `Repayment amount (${parsedAmount}) exceeds the remaining balance (${currentRemain}).`,
      });
    }

    // ── 4. Compute updated loan values ────────────────────────────────────────
    const newRepaid    = currentRepaid + parsedAmount;
    const newRemaining = Math.max(0, currentRemain - parsedAmount);
    const isOverdue    = loanRow.due_date && new Date(loanRow.due_date) < new Date();

    let newStatus;
    if (newRemaining <= 0) {
      newStatus = "FULLY_REPAID";
    } else {
      newStatus = isOverdue ? "OVERDUE" : "PARTIALLY_REPAID";
    }

    // Update the original loan record
    const { data: updatedLoanRow, error: updateErr } = await sb
      .from("transactions")
      .update({
        repaid_amount:    newRepaid,
        remaining_amount: newRemaining,
        loan_status:      newStatus,
      })
      .eq("id", loanId)
      .select()
      .single();
    if (updateErr) throw new Error(updateErr.message);

    // ── 5. Create REPAID transaction — this credits the user's wallet ─────────
    // Balance is derived from all transactions: income + repaid − expense − lent.
    // Inserting this record IS the wallet update; no separate balance field needed.
    const borrower = loanRow.borrower_name || "friend";
    const today    = new Date().toISOString().substring(0, 10);

    const { data: repaymentRow, error: insertErr } = await sb
      .from("transactions")
      .insert({
        id:             randomUUID(),
        uid:            userId,
        type:           "repaid",
        amount:         parsedAmount,
        category:       "Loan Repayment",
        description:    `Repaid by ${borrower}`,
        date:           today,
        needs_review:   false,
        ai_categorized: false,
        borrower_name:  loanRow.borrower_name || null,
        loan_status:    null,
      })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

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
