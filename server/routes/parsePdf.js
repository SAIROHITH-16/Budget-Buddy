"use strict";

// server/routes/parsePdf.js
// Accepts a bank-statement PDF upload, extracts text with pdf-parse,
// then applies heuristics to produce structured rows ready for the
// frontend ColumnMapper — same shape as PapaParse CSV output.
//
// POST /api/parse-pdf
//   Content-Type: multipart/form-data
//   Field "file": the PDF binary
//
// Response 200:
//   {
//     "headers": ["date", "description", "amount", "type"],
//     "rows":    [{ "date": "...", "description": "...", "amount": "...", "type": "..." }, ...]
//   }
//
// Protected by verifyToken (same JWT auth as all other routes).

const express  = require("express");
const multer   = require("multer");

// pdf-parse v2.x exports as default, so we need to handle both CommonJS and ES module styles
const pdfParseModule = require("pdf-parse");
const pdfParse = pdfParseModule.default || pdfParseModule;

const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// ---------------------------------------------------------------------------
// multer — store the upload in memory (Buffer); max 20 MB
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },   // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted."));
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a raw date token into YYYY-MM-DD.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY, DD Mon YYYY
 */
function normaliseDate(raw) {
  if (!raw) return "";

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY  or  DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? (Number(y) > 50 ? "19" + y : "20" + y) : y;
    return `${year.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD Mon YYYY  (e.g. "24 Feb 2026")
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const dMonY = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (dMonY) {
    const [, d, mon, y] = dMonY;
    const m = months[mon.toLowerCase()];
    if (m) return `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return raw;   // return as-is if we can't parse
}

/**
 * Strip comma-thousands formatting and return a plain decimal string.
 * "1,23,456.78 Dr" → "123456.78"
 */
function normaliseAmount(raw) {
  return raw.replace(/,/g, "").replace(/\s*(Dr|Cr|DR|CR)\s*$/, "").trim();
}

/**
 * Check whether a token looks like a money amount.
 * Allows Indian lakh formatting: 1,23,456.78
 */
function isAmount(token) {
  return /^\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?$/.test(token.replace(/\s*(Dr|Cr|DR|CR)$/, "").trim());
}

/**
 * Main parsing function.
 * Returns { headers, rows } where rows are plain objects.
 */
function extractTransactions(text) {
  // ------------------------------------------------------------------
  // 1.  Split into lines, remove entirely blank ones
  // ------------------------------------------------------------------
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // ------------------------------------------------------------------
  // 2.  Identify lines that look like transaction rows:
  //     they must contain at least one date token AND one amount token.
  // ------------------------------------------------------------------

  // Date patterns (we try each in order):
  //   DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY
  const datePat = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/;
  // Amount: number with optional comma-grouping + optional 2 decimal places, optional "Dr"/"Cr"
  const amtPat  = /\b(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)(?:\s*(?:Dr|Cr|DR|CR))?\b/g;

  const txLines = rawLines.filter(line => datePat.test(line) && amtPat.test(line));

  if (txLines.length === 0) {
    // Fallback: return entire text split into single-column rows so the
    // user at least has something to work with in the ColumnMapper.
    return {
      headers: ["raw_text"],
      rows: rawLines.map(l => ({ raw_text: l })),
    };
  }

  // ------------------------------------------------------------------
  // 3.  Determine the column structure by examining the first few lines.
  //     Strategy: for each tx line, split by multi-space (≥2 spaces) or
  //     by known separators, then bucket tokens as date / amount / text.
  // ------------------------------------------------------------------

  const parsed = txLines.map(line => {
    // Extract the date
    const dateMatch = line.match(datePat);
    const dateRaw   = dateMatch ? dateMatch[0] : "";
    const date      = normaliseDate(dateRaw);

    // Extract all amounts (last = running balance, others = debit/credit)
    const allAmounts = [];
    let am;
    amtPat.lastIndex = 0;          // reset RegExp state
    while ((am = amtPat.exec(line)) !== null) allAmounts.push(am[0].trim());

    // Remove the date and amounts from the line — what's left is the description
    let remainder = line.replace(datePat, "");
    for (const a of allAmounts) {
      remainder = remainder.replace(a, "");
    }
    const description = remainder.replace(/\s{2,}/g, " ").replace(/[|\t]/g, " ").trim();

    // Classify amounts:
    //  • If the last amount token contains "Dr" → it's a debit
    //  • If there are 3+ amounts → likely [debit, credit, balance]
    //  • If there are 2  amounts → likely [amount, balance]
    //  • If there is  1  amount  → unknown; set as plain "amount"

    let debit = "", credit = "", balance = "", amount = "";

    const rawAmounts = allAmounts.map(a => ({
      raw: a,
      isCr: /Cr$/i.test(a.trim()),
      isDr: /Dr$/i.test(a.trim()),
      clean: normaliseAmount(a),
    }));

    if (rawAmounts.length === 0) {
      // nothing — leave blank
    } else if (rawAmounts.length === 1) {
      amount = rawAmounts[0].clean;
    } else if (rawAmounts.length === 2) {
      amount  = rawAmounts[0].clean;
      balance = rawAmounts[1].clean;
    } else {
      // 3 or more: try debit / credit / balance layout
      // Detect explicit Dr/Cr markers first
      const drEntries = rawAmounts.filter(a => a.isDr);
      const crEntries = rawAmounts.filter(a => a.isCr);
      balance = rawAmounts[rawAmounts.length - 1].clean;

      if (drEntries.length > 0) {
        debit  = drEntries[0].clean;
      } else if (rawAmounts.length >= 2) {
        // First non-balance amount is debit, second is credit (if present)
        debit  = rawAmounts[0].clean;
        if (rawAmounts.length >= 3) credit = rawAmounts[1].clean;
      }

      if (crEntries.length > 0) credit = crEntries[0].clean;
    }

    // Decide final "amount" and "type" for simple ColumnMapper auto-detection
    // If neither debit nor credit populated, use generic amount
    if (debit || credit) {
      amount = debit || credit;
    }
    const type = debit ? "expense" : (credit ? "income" : "");

    return { date, description, amount, debit, credit, balance, type };
  });

  // ------------------------------------------------------------------
  // 4.  Decide which headers to include (omit columns that are all empty)
  // ------------------------------------------------------------------
  const candidates = ["date", "description", "amount", "debit", "credit", "balance", "type"];
  const headers = candidates.filter(h => parsed.some(r => r[h] && r[h].trim() !== ""));

  const rows = parsed.map(r => {
    const out = {};
    for (const h of headers) out[h] = r[h] ?? "";
    return out;
  });

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// POST /api/parse-pdf
// ---------------------------------------------------------------------------
router.post(
  "/",
  verifyToken,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No PDF file received." });
    }

    try {
      const data = await pdfParse(req.file.buffer);
      const text = data.text;

      if (!text || text.trim().length === 0) {
        return res.status(422).json({
          success: false,
          message:
            "Could not extract any text from this PDF. " +
            "The file may be scanned/image-only. Try a CSV export from your bank instead.",
        });
      }

      const { headers, rows } = extractTransactions(text);

      return res.status(200).json({
        success: true,
        pageCount: data.numpages,
        rowCount:  rows.length,
        headers,
        rows,
      });
    } catch (err) {
      console.error("[POST /parse-pdf] Error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to parse PDF: " + (err.message || "unknown error"),
      });
    }
  }
);

module.exports = router;
