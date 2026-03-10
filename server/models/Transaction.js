// server/models/Transaction.js
// Full manual Mongoose Transaction model.
// No template. No scaffold. Every field and validator is explicit.
//
// Schema design:
//   Each transaction belongs to exactly one Firebase user (identified by uid).
//   The `uid` field is indexed so queries like
//     Transaction.find({ uid: req.user.uid }) run efficiently.
//
// MongoDB collection name: "transactions" (pluralised automatically by Mongoose)

"use strict";

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// 1. Define the schema
// ---------------------------------------------------------------------------
const transactionSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // uid — Firebase user ID
    // Every document is owned by a single user. This field is used to filter
    // results and enforce ownership in update/delete operations.
    // -----------------------------------------------------------------------
    uid: {
      type: String,
      required: [true, "uid (Firebase user ID) is required"],
      trim: true,
      index: true,  // Indexed for fast owner-based lookups
    },

    // -----------------------------------------------------------------------
    // type — "income", "expense", "lent", or "repaid"
    // -----------------------------------------------------------------------
    type: {
      type: String,
      required: [true, "Transaction type is required"],
      enum: {
        values: ["income", "expense", "lent", "repaid"],
        message: 'Transaction type must be "income", "expense", "lent", or "repaid"',
      },
    },

    // -----------------------------------------------------------------------
    // amount — positive decimal number
    // Stored as a Number; validated to be > 0 so negative amounts are rejected.
    // -----------------------------------------------------------------------
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },

    // -----------------------------------------------------------------------
    // category — e.g. "Food", "Rent", "Salary", "Uncategorized"
    // -----------------------------------------------------------------------
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
      default: "Uncategorized",
    },

    // -----------------------------------------------------------------------
    // description — free-text note about the transaction
    // -----------------------------------------------------------------------
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },

    // -----------------------------------------------------------------------
    // date — when the transaction occurred (ISO 8601 string, stored as Date)
    // The frontend sends a string like "2026-02-23"; Mongoose casts it to Date.
    // The API serialises it back to an ISO string when responding.
    // -----------------------------------------------------------------------
    date: {
      type: Date,
      required: [true, "Date is required"],
    },

    // -----------------------------------------------------------------------
    // needsReview — true for transactions imported from a bank CSV that the
    // user has not yet reviewed/described.  Set to false once the user edits
    // the transaction and saves it normally.
    // -----------------------------------------------------------------------
    needsReview: {
      type:    Boolean,
      default: false,
      index:   true,   // indexed so the /pending filter is fast
    },

    // -----------------------------------------------------------------------
    // bankReferenceId — opaque reference string sent by the bank CSV
    // (e.g. a cheque number, transaction ID, or generated hash of date+amount).
    //
    // Uniqueness is enforced PER USER via the compound sparse index below:
    //   { uid: 1, bankReferenceId: 1 }  unique, sparse
    //
    // Sparse means documents that do NOT have a bankReferenceId at all
    // (manually-entered transactions) are excluded from the index and can
    // coexist in unlimited numbers — no accidental duplicate errors.
    // -----------------------------------------------------------------------
    bankReferenceId: {
      type:  String,
      trim:  true,
      // NOTE: unique:true is NOT set here. Uniqueness is enforced below via
      // a compound sparse index so the constraint is per-user, not global.
    },

    // -----------------------------------------------------------------------
    // Loan-specific fields — only populated when type === "lent" or "repaid"
    // -----------------------------------------------------------------------

    // borrowerName — the friend who borrowed the money
    borrowerName: {
      type:     String,
      trim:     true,
      maxlength: [100, "Borrower name cannot exceed 100 characters"],
    },

    // dueDate — when the borrower is expected to repay
    dueDate: {
      type: Date,
    },

    // repaidAmount — cumulative amount received back so far (default 0)
    repaidAmount: {
      type:    Number,
      default: 0,
      min:     [0, "Repaid amount cannot be negative"],
    },

    // remainingAmount — amount still owed; defaults to the original amount at creation
    remainingAmount: {
      type: Number,
      min:  [0, "Remaining amount cannot be negative"],
    },

    // status — lifecycle state of the loan
    loanStatus: {
      type:    String,
      enum:    {
        values:  ["PENDING", "PARTIALLY_REPAID", "FULLY_REPAID", "OVERDUE"],
        message: "loanStatus must be PENDING, PARTIALLY_REPAID, FULLY_REPAID, or OVERDUE",
      },
      default: "PENDING",
    },
  },
  {
    // -----------------------------------------------------------------------
    // Schema options
    // -----------------------------------------------------------------------

    // Automatically add `createdAt` and `updatedAt` fields
    timestamps: true,

    // When converting a document to JSON (for API responses), apply transforms:
    toJSON: {
      virtuals: false,
      transform(doc, ret) {
        // Rename _id → _id (keep as string so the frontend can use it directly)
        ret._id = ret._id.toString();

        // Serialise the `date` field as an ISO date string (YYYY-MM-DD)
        if (ret.date instanceof Date) {
          ret.date = ret.date.toISOString().split("T")[0];
        }

        // Remove internal Mongoose version key (__v) from responses
        delete ret.__v;

        return ret;
      },
    },
  }
);

// ---------------------------------------------------------------------------
// 2. Indexes
// ---------------------------------------------------------------------------

// Fast owner-scoped date-sorted queries (used by GET /api/transactions)
transactionSchema.index({ uid: 1, date: -1 });

// Per-user duplicate prevention for bank imports.
// sparse:true means only documents that actually have a bankReferenceId are
// included in the index — manually-entered transactions are ignored.
transactionSchema.index(
  { uid: 1, bankReferenceId: 1 },
  { unique: true, sparse: true, name: "uid_bankRefId_unique" }
);

// ---------------------------------------------------------------------------
// 3. Compile the model from the schema
//    Mongoose.model() is idempotent — safe to call multiple times with the same name.
// ---------------------------------------------------------------------------
const Transaction = mongoose.models.Transaction
  || mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
