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
// Internal: low-level GitHub Models (OpenAI-compatible) call
// ---------------------------------------------------------------------------
async function callGPT(messages, temperature = 0.3) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured in server/.env");

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
    throw new Error(`GitHub Models API error: ${status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ---------------------------------------------------------------------------
// categorizeBatch(descriptions: string[]) → string[]
//
// Sends all descriptions to GPT-4o in a SINGLE prompt (numbered list).
// Returns a matching array of category strings in the same order.
// Never throws — individual failures fall back to "Uncategorized".
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

  const content = await callGPT(
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
