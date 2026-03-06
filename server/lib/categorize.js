"use strict";

// server/lib/categorize.js
// Shared AI categorization logic used by:
//   - POST /api/insights/categorize        (single description)
//   - POST /api/insights/categorize-batch  (up to 500 descriptions)
//   - POST /api/transactions/import        (auto-categorize before saving)
//
// Having one module here means a change to the prompt or model affects
// all callers simultaneously — no duplication, no drift.

const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions";

const CATEGORIES = [
  "Salary", "Freelance", "Rent", "Groceries", "Utilities",
  "Transport", "Entertainment", "Health", "Education", "Shopping",
  "Food", "Subscriptions", "Insurance", "Savings", "Investment", "Other",
];

// ---------------------------------------------------------------------------
// Keyword-based local fallback — works with zero API calls.
// Used when GitHub Models is unavailable (bad token, rate limit, network, etc.)
// ---------------------------------------------------------------------------
const KEYWORD_MAP = [
  { category: "Salary",        words: ["salary","payroll","wages","wage","paycheck","direct deposit","neft salary","sal credit"] },
  { category: "Freelance",     words: ["freelance","upwork","fiverr","toptal","contractor","consulting fee","invoice"] },
  { category: "Rent",          words: ["rent","lease","landlord","housing","apartment","flat rent","pg rent"] },
  { category: "Groceries",     words: ["grocery","groceries","supermarket","bigbasket","blinkit","zepto","dmart","walmart","costco","sainsbury","tesco","aldi","reliance fresh","more supermarket","jiomart","nature basket"] },
  { category: "Utilities",     words: ["electricity","electric","water bill","gas bill","internet","broadband","broadband bill","wifi","telephone","landline","municipality","bsnl","airtel","jio","vodafone","vi","utility","pgcil","bescom","msedcl","tneb","bwssb"] },
  { category: "Transport",     words: ["uber","ola","lyft","taxi","cab","metro","bus","train","railway","irctc","rapido","auto rickshaw","fuel","petrol","diesel","parking","toll","fastag","shell","bp","chevron","indane","hp petrol"] },
  { category: "Food",          words: ["restaurant","cafe","coffee","starbucks","mcdonald","kfc","domino","pizza","subway","swiggy","zomato","food","dining","eat","kitchen","biryani","burger","sushi","dunkin","bakery"] },
  { category: "Entertainment", words: ["netflix","amazon prime","hotstar","disney","spotify","youtube premium","hulu","apple tv","cinema","movie","theatre","concert","gaming","steam","playstation","xbox","game","books","kindle"] },
  { category: "Health",        words: ["hospital","clinic","doctor","pharmacy","medicine","medical","health","dental","dentist","optician","lab test","diagnostics","1mg","netmeds","practo","apollo","max healthcare","gym","fitness"] },
  { category: "Education",     words: ["school","college","university","tuition","course","udemy","coursera","edx","byju","unacademy","skillshare","exam fee","books","stationery"] },
  { category: "Shopping",      words: ["amazon","flipkart","myntra","ajio","nykaa","meesho","shopify","ebay","snapdeal","h&m","zara","uniqlo","mall","clothing","fashion","shoes","apparel"] },
  { category: "Subscriptions", words: ["subscription","monthly plan","annual plan","membership","saas","adobe","microsoft 365","dropbox","notion","slack","zoom"] },
  { category: "Insurance",     words: ["insurance","lic","irdai","premium","policy","term plan","health cover","motor insurance","vehicle insurance","star health","icici prudential","hdfc life"] },
  { category: "Savings",       words: ["savings","fd","fixed deposit","recurring deposit","rd","ppf","nps","savings account","atal pension"] },
  { category: "Investment",    words: ["investment","mutual fund","sip","zerodha","groww","upstox","paytm money","stocks","shares","nifty","sensex","ipo","demat","brokerage","crypto","bitcoin","ethereum"] },
];

function keywordCategorize(description) {
  const lower = String(description).toLowerCase();
  for (const { category, words } of KEYWORD_MAP) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  return "Other";
}

// ---------------------------------------------------------------------------
// Internal: low-level GitHub Models (OpenAI-compatible) call
// ---------------------------------------------------------------------------
async function callGPT(messages, temperature = 0.3) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    const err = new Error("GITHUB_TOKEN not configured — add it to server/.env (see .env.example)");
    err.status = 503;
    throw err;
  }

  const res = await fetch(GITHUB_MODELS_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4o", messages, temperature }),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw Object.assign(new Error("Rate limited by GitHub Models"), { status: 429 });
    if (status === 401) {
      const err = new Error(
        "GitHub Models API returned 401 Unauthorized. " +
        "Your GITHUB_TOKEN in server/.env is missing, expired, or does not have " +
        "'models:read' / 'models:inference' access. " +
        "Generate a new token at https://github.com/settings/tokens with the Models permission."
      );
      err.status = 401;
      throw err;
    }
    throw Object.assign(new Error(`GitHub Models API error: ${status}`), { status });
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ---------------------------------------------------------------------------
// categorizeBatch(descriptions: string[]) → string[]
//
// Sends all descriptions to GPT-4o in a SINGLE prompt (numbered list).
// Returns a matching array of category strings in the same order.
// Never throws — any AI failure falls back to "Uncategorized" for every row.
//
// Usage:
//   const cats = await categorizeBatch(["POS WOOLWORTHS", "NETFLIX.COM", ...]);
//   // → ["Groceries", "Subscriptions", ...]
// ---------------------------------------------------------------------------
async function categorizeBatch(descriptions) {
  if (!descriptions || descriptions.length === 0) return [];

  // Build a numbered list so GPT can return a matching numbered list
  const numbered = descriptions
    .map((d, i) => `${i + 1}. ${String(d).trim().slice(0, 120)}`)
    .join("\n");

  let content;
  try {
    content = await callGPT(
    [
      {
        role: "system",
        content:
          `You are a financial transaction categorizer. ` +
          `You will receive a numbered list of transaction descriptions. ` +
          `Reply with ONLY a numbered list in the SAME ORDER where each line is: ` +
          `<number>. <category>\n` +
          `The category MUST be exactly one of: ${CATEGORIES.join(", ")}. ` +
          `No explanations, no extra text, no JSON. Just the numbered list.`,
      },
      {
        role: "user",
        content: `Categorize these transactions:\n${numbered}`,
      },
    ],
    0  // temperature=0 → deterministic, consistent labels
    );
  } catch (aiErr) {
    // AI is unavailable (bad token, rate limit, network error, etc.).
    // Fall back to keyword matching so transactions still get useful categories.
    console.warn("[categorizeBatch] AI unavailable, using keyword fallback:", aiErr.message);
    return descriptions.map(keywordCategorize);
  }

  // Parse numbered response: "1. Groceries", "2. Transport", …
  const lines = content.split("\n").filter((l) => l.trim());

  return descriptions.map((_, i) => {
    const lineForIndex = lines.find((l) => {
      const match = l.match(/^\s*(\d+)[.)\s]+(.+)/);
      return match && parseInt(match[1], 10) === i + 1;
    });
    if (!lineForIndex) return "Uncategorized";
    const match = lineForIndex.match(/^\s*\d+[.)\s]+(.+)/);
    if (!match) return "Uncategorized";
    const raw = match[1].trim();
    const found = CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
    return found ?? "Uncategorized";
  });
}

// ---------------------------------------------------------------------------
// categorizeOne(description: string) → string
// Convenience wrapper for single-description callers.
// ---------------------------------------------------------------------------
async function categorizeOne(description) {
  const [category] = await categorizeBatch([description]);
  return category ?? "Uncategorized";
}

module.exports = { CATEGORIES, callGPT, categorizeBatch, categorizeOne };
