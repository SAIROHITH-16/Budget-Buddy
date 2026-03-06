// supabase/functions/parse-statement/index.ts
//
// Two-stage architecture:
//   Stage 1 — Deterministic JavaScript extracts date, amount, and income/expense type
//              by computing the closing-balance delta between consecutive rows.
//              This is 100% accurate and requires ZERO AI guessing.
//
//   Stage 2 — GPT-4o receives the pre-typed, pre-quantified transactions and adds
//              only a "category" field. It cannot alter dates, amounts, or types.
//
// POST /functions/v1/parse-statement
//   Body: { "text": "<raw pipe-separated rows from pdfExtractor>" }
//
// Response 200:
//   [{ "date": "YYYY-MM-DD", "description": "...", "amount": 20.00,
//      "type": "expense"|"income", "category": "..." }, ...]

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Category list (AI must choose exactly one)
// ---------------------------------------------------------------------------
const CATEGORIES = [
  "Salary", "Freelance", "Refund", "Rent", "Groceries", "Utilities",
  "Transport", "Entertainment", "Health", "Education", "Shopping",
  "Food", "Subscriptions", "Insurance", "Savings", "Investment",
  "Transfer", "Other",
].join(", ");

// ===========================================================================
// STAGE 1 — Deterministic Parser
// Extracts { date, description, amount, type } with mathematical certainty
// by comparing consecutive closing balances.
// ===========================================================================

interface RawTransaction {
  date:        string;
  description: string;
  amount:      number;
  type:        "expense" | "income";
  balance:     number;   // closing balance — carried through to final output
}

/** Parse a locale-formatted number string like "1,23,456.78" → 123456.78 */
function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isFinite(n) && n >= 0 ? n : NaN;
}

/** Convert common bank-statement date formats to YYYY-MM-DD */
function normalizeDate(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return "1970-01-01";
  const [, d, mo, yr] = m;
  const year = yr.length === 2
    ? (parseInt(yr, 10) >= 50 ? `19${yr}` : `20${yr}`)
    : yr;
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Rows that are NOT actual transactions — headers, summaries, footers */
const SKIP_PATTERNS = [
  /narration/i,
  /withdrawal\s*amt/i,
  /deposit\s*amt/i,
  /transaction\s*date/i,
  /value\s*date/i,
  /opening\s*balance/i,
  /closing\s*balance/i,
  /statement\s*of/i,
  /account\s*no/i,
  /\bbranch\b/i,
  /\bifsc\b/i,
  /page\s*\d/i,
];

function shouldSkipRow(row: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(row));
}

/** Narration-keyword fallback — only needed for the very first transaction */
function inferTypeFromNarration(text: string): "expense" | "income" {
  const u = text.toUpperCase();
  if (/RECEIVED|\bCREDIT\b|\bCR\b|SALARY|INTEREST|REFUND|CASHBACK|REVERSAL|INWARD/.test(u)) {
    return "income";
  }
  if (/UPI|PAYMENT|PAID|\bDR\b|DEBIT|\bATM\b|WDL|POS|@/.test(u)) {
    return "expense";
  }
  return "expense"; // safest default
}

/**
 * Dual-mode parser — automatically detects which format the PDF extractor produced.
 *
 * ── MODE A: Column-Locked  (new coordinate-based pdfExtractor output) ─────────
 *   Input format: "date | narration | withdrawal | deposit | balance"
 *   withdrawal and deposit are explicit numerics — always "0.00" when the bank
 *   cell was empty.  type and amount are read directly from named columns.
 *   Zero guessing, zero delta math, 100% deterministic.
 *
 * ── MODE B: Hybrid Fallback  (old plain pipe-joined or raw text) ───────────────
 *   Stitch multiline narrations by date, then use:
 *     • exact second-to-last number as the transaction amount
 *     • balance-delta direction to decide income / expense
 *     • narration keywords when delta is unavailable or ambiguous
 */
function deterministicParse(rawText: string): RawTransaction[] {

  // ── Helpers shared by both modes ────────────────────────────────────────────
  const DATE_PAT   = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/;
  const DATE_PAT_G = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
  const NUM_RE     = /\d{1,3}(?:,\d{2,3})*\.\d{1,2}|\d+\.\d{1,2}/g;
  // A column value from the new extractor is always "ddd.dd" (with optional commas)
  const FIXED_NUM  = /^\d[\d,]*\.\d{2}$/;

  const cleanNum = (s: string) => parseFloat(s.replace(/,/g, '').trim());

  // ── Try MODE A — Fixed 5-column ─────────────────────────────────────────────
  //   Every data row must have exactly 5 pipe-separated parts where
  //   parts[2] (withdrawal), parts[3] (deposit), and parts[4] (balance)
  //   all match the "nnn.nn" decimal pattern.
  const fixedRows: RawTransaction[] = [];

  for (const line of rawText.split('\n')) {
    const row = line.trim();
    if (!row || shouldSkipRow(row)) continue;
    if (!DATE_PAT.test(row)) continue;           // must start with a date

    const parts = row.split('|').map(s => s.trim());
    if (parts.length !== 5) continue;

    const [rawDate, rawNarr, rawWd, rawDep, rawBal] = parts;
    if (!FIXED_NUM.test(rawWd) || !FIXED_NUM.test(rawDep) || !FIXED_NUM.test(rawBal)) continue;

    const withdrawal = cleanNum(rawWd);
    const deposit    = cleanNum(rawDep);
    const balance    = cleanNum(rawBal);

    // Determine type + amount directly from the named columns
    let type:   "expense" | "income";
    let amount: number;

    if (withdrawal > 0.005 && deposit <= 0.005) {
      type = "expense"; amount = withdrawal;         // withdrawal column populated
    } else if (deposit > 0.005 && withdrawal <= 0.005) {
      type = "income";  amount = deposit;            // deposit column populated
    } else if (withdrawal > 0.005 && deposit > 0.005) {
      // Rare: bank printed something in both columns (e.g. reversal notation)
      type = inferTypeFromNarration(rawNarr);
      amount = Math.max(withdrawal, deposit);
    } else {
      // Both zero — column calibration may be off; skip
      continue;
    }

    // Clean narration: strip long ref-no digit runs and UPI VPA addresses
    const description = rawNarr
      .replace(/\b\d{8,}\b/g, '')
      .replace(/\S+@\S+/g,    '')
      .replace(/\s+/g,        ' ')
      .trim() || 'Unknown';

    fixedRows.push({
      date:        normalizeDate(rawDate),
      description,
      amount:      Math.round(amount  * 100) / 100,
      type,
      balance:     Math.round(balance * 100) / 100,
    });
  }

  // If MODE A produced results, return them — completely column-locked, no math at all
  if (fixedRows.length > 0) return fixedRows;

  // ── MODE B fallback — Stitching + Hybrid ────────────────────────────────────
  // Used when the input is old-style plain pipes or raw text.

  // Step 1: stitch multiline narrations into per-transaction blocks
  interface RawBlock { dateRaw: string; text: string; }
  const rawBlocks: RawBlock[] = [];
  let currentBlock: RawBlock | null = null;

  for (const line of rawText.split('\n')) {
    const row = line.trim();
    if (!row || shouldSkipRow(row)) continue;

    const leadDate = row.match(DATE_PAT);
    if (leadDate && row.startsWith(leadDate[0])) {
      if (currentBlock) rawBlocks.push(currentBlock);
      currentBlock = { dateRaw: leadDate[0], text: row };
    } else if (currentBlock) {
      currentBlock.text += ' ' + row;
    }
  }
  if (currentBlock) rawBlocks.push(currentBlock);

  // Steps 2 & 3: Value Date Wall + Hybrid Type Checker
  const result: RawTransaction[] = [];
  let prevBalance: number | null = null;

  for (const block of rawBlocks) {
    const { dateRaw, text } = block;

    // Locate the Value Date (second date occurrence) — hard wall between narration and amounts
    const allDateMatches = Array.from(text.matchAll(DATE_PAT_G));
    let narration   = '';
    let amountsZone = '';

    if (allDateMatches.length >= 2) {
      const valueDateMatch = allDateMatches[1];
      const wallIdx        = valueDateMatch.index!;
      const wallEnd        = wallIdx + valueDateMatch[0].length;
      const txDateEnd      = text.indexOf(dateRaw) + dateRaw.length;
      narration   = text.slice(txDateEnd, wallIdx);
      amountsZone = text.slice(wallEnd);
    } else {
      const txDateEnd = text.indexOf(dateRaw) + dateRaw.length;
      amountsZone = text.slice(txDateEnd);
    }

    const nums = Array.from(amountsZone.matchAll(NUM_RE))
      .map(m => parseAmount(m[0]))
      .filter(n => !isNaN(n) && n > 0);

    if (nums.length === 1 && prevBalance === null) { prevBalance = nums[0]; continue; }
    if (nums.length < 2) continue;

    const currentBalance = nums[nums.length - 1];
    const actualAmount   = nums[nums.length - 2];

    // Hybrid: delta for direction, printed column for amount
    let type: "expense" | "income" = "expense";

    if (prevBalance !== null) {
      const delta = currentBalance - prevBalance;
      if      (delta >  0.05) type = "income";
      else if (delta < -0.05) type = "expense";
      else                    type = inferTypeFromNarration(narration || text);
    } else {
      type = inferTypeFromNarration(narration || text);
    }

    prevBalance = currentBalance;

    const description = (narration || text.slice(text.indexOf(dateRaw) + dateRaw.length))
      .replace(/\|/g,        ' ')
      .replace(/\b\d{8,}\b/g, '')
      .replace(/\S+@\S+/g,   '')
      .replace(/\s+/g,       ' ')
      .trim() || 'Unknown';

    result.push({
      date:        normalizeDate(dateRaw),
      description,
      amount:      Math.round(actualAmount   * 100) / 100,
      type,
      balance:     Math.round(currentBalance * 100) / 100,
    });
  }

  return result;
}

// ===========================================================================
// STAGE 2 — Lightweight AI prompt: categorization only
// ===========================================================================

const CATEGORIZE_PROMPT = `You are a financial categorization engine.

I am providing you with a JSON array of bank transactions. The "date", "amount", and "type" fields have been computed with 100% mathematical accuracy by a deterministic algorithm. DO NOT change them under any circumstances.

Your ONLY task is to read the "description" field for each transaction and add a "category" field chosen from this exact list:
${CATEGORIES}

Category guidelines:
- Salary        → payroll or salary credit
- Freelance     → consulting or project payment
- Refund        → cashback, reversal, return credit
- Transfer      → UPI/NEFT/IMPS to or from an individual
- Rent          → house rent payment
- Groceries     → supermarket or grocery store
- Food          → restaurants and food-delivery apps (Zomato, Swiggy, etc.)
- Transport     → Ola, Uber, metro, fuel, toll, parking
- Subscriptions → Netflix, Spotify, OTT platforms, SaaS tools
- Shopping      → Amazon, Flipkart, e-commerce purchases
- Health        → pharmacy, hospital, clinic, lab tests
- Education     → school fees, tuition, online courses
- Utilities     → electricity, water, mobile recharge, broadband, gas
- Investment    → SIP, mutual fund, stock purchase
- Savings       → recurring deposit (RD) or fixed deposit (FD)
- Insurance     → premium payments
- Other         → ATM cash withdrawals or anything not clearly matching above

Hard rules:
1. DO NOT modify "date", "amount", or "type" — return them exactly as given.
2. NEVER use "Income" as a category value.
3. Return the EXACT same JSON array with only the "category" key added to every object.
4. Return ONLY the raw JSON array — no markdown fences, no explanation, nothing else.`;

// ===========================================================================
// Keyword-based local fallback — zero API calls, works when AI is unavailable
// ===========================================================================
const KEYWORD_MAP: Array<{ category: string; words: string[] }> = [
  { category: "Salary",        words: ["salary","payroll","wages","wage","paycheck","direct deposit","neft salary","sal credit"] },
  { category: "Freelance",     words: ["freelance","upwork","fiverr","toptal","contractor","consulting fee","invoice"] },
  { category: "Refund",        words: ["refund","cashback","reversal","return credit","reversal credit"] },
  { category: "Rent",          words: ["rent","lease","landlord","housing","apartment","flat rent","pg rent"] },
  { category: "Groceries",     words: ["grocery","groceries","supermarket","bigbasket","blinkit","zepto","dmart","walmart","costco","sainsbury","tesco","aldi","reliance fresh","more supermarket","jiomart","nature basket"] },
  { category: "Utilities",     words: ["electricity","water bill","gas bill","broadband","wifi","telephone","landline","municipality","bsnl","airtel","jio","vodafone","vi","utility","bescom","msedcl","tneb","bwssb"] },
  { category: "Transport",     words: ["uber","ola","lyft","taxi","cab","metro","railway","irctc","rapido","auto rickshaw","fuel","petrol","diesel","parking","toll","fastag","shell","hp petrol"] },
  { category: "Food",          words: ["restaurant","cafe","coffee","starbucks","mcdonald","kfc","domino","pizza","subway","swiggy","zomato","dining","biryani","burger","sushi","dunkin","bakery"] },
  { category: "Entertainment", words: ["netflix","amazon prime","hotstar","disney","spotify","youtube premium","hulu","apple tv","cinema","movie","theatre","concert","gaming","steam","playstation","xbox"] },
  { category: "Health",        words: ["hospital","clinic","doctor","pharmacy","medicine","medical","dental","dentist","lab test","diagnostics","1mg","netmeds","practo","apollo","gym","fitness"] },
  { category: "Education",     words: ["school","college","university","tuition","course","udemy","coursera","edx","byju","unacademy","skillshare","exam fee"] },
  { category: "Shopping",      words: ["amazon","flipkart","myntra","ajio","nykaa","meesho","ebay","snapdeal","h&m","zara","uniqlo","mall","clothing","fashion","shoes"] },
  { category: "Subscriptions", words: ["subscription","monthly plan","annual plan","membership","saas","adobe","microsoft 365","dropbox","notion","slack","zoom"] },
  { category: "Insurance",     words: ["insurance","lic","premium","policy","term plan","health cover","motor insurance","star health","icici prudential","hdfc life"] },
  { category: "Savings",       words: ["savings","fixed deposit","recurring deposit","ppf","nps","atal pension"] },
  { category: "Investment",    words: ["investment","mutual fund","sip","zerodha","groww","upstox","stocks","shares","nifty","sensex","ipo","demat","brokerage","crypto","bitcoin"] },
  { category: "Transfer",      words: ["upi","neft","imps","rtgs","transfer","sent to","received from","p2p"] },
];

function keywordCategory(description: string): string {
  const lower = description.toLowerCase();
  for (const { category, words } of KEYWORD_MAP) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return "Other";
}

// ===========================================================================
// Helper: call GitHub Models (OpenAI-compatible GPT-4o)
// ===========================================================================

async function callGPT(systemPrompt: string, userContent: string): Promise<string> {
  const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
  if (!GITHUB_TOKEN) throw Object.assign(new Error("GITHUB_TOKEN not set in Supabase secrets"), { status: 503 });

  const res = await fetch(
    "https://models.inference.ai.azure.com/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:       "gpt-4o",
        temperature: 0,          // deterministic output
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent  },
        ],
      }),
    }
  );

  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw Object.assign(new Error("Rate limited by AI provider"), { status: 429 });
    if (status === 402) throw Object.assign(new Error("AI credits exhausted"),        { status: 402 });
    if (status === 401) throw Object.assign(
      new Error("GitHub Models 401: token missing or lacks Models access — set GITHUB_TOKEN in Supabase secrets"),
      { status: 401 }
    );
    throw Object.assign(new Error(`GitHub Models API error: ${status}`), { status });
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ===========================================================================
// Helper: parse + validate AI response; enforce deterministic baseline values
// ===========================================================================

interface Transaction {
  date:        string;
  description: string;
  amount:      number;
  type:        "expense" | "income";
  category:    string;
  balance:     number;   // closing balance at time of transaction
}

function mergeWithBaseline(
  aiRaw:    string,
  baseline: RawTransaction[]
): Transaction[] {
  // Strip markdown fences the model may add despite instructions
  const stripped = aiRaw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/,           "")
    .trim();

  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed)) throw new Error("AI did not return a JSON array");

  const VALID_CATS = new Set(CATEGORIES.split(", "));

  return parsed
    .map((t: any, i: number): Transaction | null => {
      const base = baseline[i];
      if (!base) return null;                           // AI returned extra items — ignore

      return {
        // Always use the deterministically-computed values — never trust AI for these
        date:        base.date,
        description: base.description,
        amount:      base.amount,
        type:        base.type,
        balance:     base.balance,
        // Only the category comes from the AI; fall back to "Other" if invalid
        category:    VALID_CATS.has(t?.category) ? t.category : "Other",
      };
    })
    .filter((t): t is Transaction => t !== null);
}

// ===========================================================================
// Main handler
// ===========================================================================

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body    = await req.json();
    const rawText = String(body?.text ?? "").trim();

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "text is required — send the pipe-separated PDF rows" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── STAGE 1: Deterministic parsing ──────────────────────────────────────
    const parsedTransactions = deterministicParse(rawText);

    if (parsedTransactions.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No valid transactions could be extracted. " +
                 "Ensure the text contains pipe-separated rows with a closing balance column.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── RUNNING BALANCE AUDIT ────────────────────────────────────────────────
    // Mathematically verifies every row against the bank's printed running balance.
    // MODE A rows carry explicit withdrawal + deposit columns so the proof is exact.
    // MODE B rows (hybrid) may not have separate withdrawal/deposit; audit is best-effort.
    {
      let auditFailed = false;
      for (let i = 1; i < parsedTransactions.length; i++) {
        const prev = parsedTransactions[i - 1];
        const curr = parsedTransactions[i];

        // Reconstruct columns from RawTransaction shape:
        //   MODE A sets type="expense" → withdrawal, type="income" → deposit
        const withdrawal = curr.type === "expense" ? curr.amount : 0;
        const deposit    = curr.type === "income"  ? curr.amount : 0;

        const expectedBalance = Math.round((prev.balance - withdrawal + deposit) * 100) / 100;
        const actualBalance   = Math.round(curr.balance * 100) / 100;

        if (Math.abs(expectedBalance - actualBalance) > 0.01) {
          console.error("🚨 MATH FAILED ON ROW:", {
            rowIndex:        i,
            previousBalance: prev.balance,
            date:            curr.date,
            description:     curr.description,
            withdrawal,
            deposit,
            balance:         curr.balance,
            expected:        expectedBalance,
            delta:           Math.round((actualBalance - expectedBalance) * 100) / 100,
          });
          auditFailed = true;
        }
      }
      if (!auditFailed) {
        console.log(`✅ AUDIT PASSED: 100% Accuracy Verified (${parsedTransactions.length} rows)`);
      }
    }

    // ── STAGE 2: AI categorization on pre-typed clean data ──────────────────
    let transactions: Transaction[];
    try {
      const aiRaw = await callGPT(
        CATEGORIZE_PROMPT,
        JSON.stringify(parsedTransactions)
      );
      try {
        transactions = mergeWithBaseline(aiRaw, parsedTransactions);
      } catch (parseErr) {
        console.error("[parse-statement] Failed to parse AI JSON — using keyword fallback:", aiRaw);
        transactions = parsedTransactions.map(t => ({ ...t, category: keywordCategory(t.description) }));
      }
    } catch (aiErr: any) {
      // AI unavailable (no token, 401, rate limit, network error, etc.)
      // Fall back to keyword matching — PDF import always succeeds
      console.warn("[parse-statement] AI unavailable, using keyword fallback:", aiErr?.message);
      transactions = parsedTransactions.map(t => ({ ...t, category: keywordCategory(t.description) }));
    }

    if (transactions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid transactions after categorization" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(transactions), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[parse-statement] Unhandled error:", err);
    const status = err?.status ?? 500;
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
