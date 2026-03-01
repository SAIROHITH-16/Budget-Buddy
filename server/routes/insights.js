"use strict";

// server/routes/insights.js
// AI-powered insights using GitHub Models (GPT-4o).
// Free with GitHub Student Pack — no Supabase edge functions needed.
//
// Routes:
//   POST /api/insights/analyze     → monthly financial summary via GPT-4o
//   POST /api/insights/categorize  → auto-categorize a transaction description

const express = require("express");
const verifyToken = require("../middleware/verifyToken");
// Shared AI helpers — single source of truth for prompt logic and GPT call
const { CATEGORIES, callGPT, categorizeBatch, categorizeOne } = require("../lib/categorize");

const router = express.Router();
router.use(verifyToken);

// ── POST /api/insights/analyze ────────────────────────────────────────────────
// Body: { month: "YYYY-MM", transactions: Transaction[] }
// Returns: InsightsData object
router.post("/analyze", async (req, res) => {
  try {
    const { month, transactions } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month is required (YYYY-MM)" });
    }
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "transactions array is required" });
    }

    // Filter to requested month
    const monthTxs = transactions.filter((t) => String(t.date).startsWith(month));
    if (monthTxs.length === 0) {
      // Return a 200 with a noData flag so the client can show an empty state
      // instead of crashing on a 404.
      return res.status(200).json({ noData: true, message: "No transactions found for this month" });
    }

    // Summary numbers
    const totalIncome  = monthTxs.filter((t) => t.type === "income") .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = monthTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

    const categories = {};
    monthTxs.filter((t) => t.type === "expense").forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + Number(t.amount);
    });

    // Previous month comparison
    const [y, m] = month.split("-").map(Number);
    const prevDate  = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevTxs   = transactions.filter((t) => String(t.date).startsWith(prevMonth));
    const prevTotalExpense = prevTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const prevTotalIncome  = prevTxs.filter((t) => t.type === "income") .reduce((s, t) => s + Number(t.amount), 0);

    const prompt = `Analyze this financial data for ${month} and return ONLY a valid JSON object with these exact fields:
- "summary": A 2-3 sentence spending summary
- "top_categories": Array of top 3 spending categories as objects with "name" and "amount" fields
- "saving_suggestions": Array of exactly 3 practical saving suggestions as strings
- "month_comparison": Object with "current_expense", "previous_expense", "change_percent", "direction" ("up"/"down"/"same")

Data:
- Total Income: $${totalIncome}
- Total Expense: $${totalExpense}
- Categories: ${JSON.stringify(categories)}
- Previous month expense: $${prevTotalExpense}
- Previous month income: $${prevTotalIncome}

Return ONLY the JSON. No explanation, no markdown.`;

    let content = await callGPT([
      { role: "system", content: "You are a financial analyst AI. Return ONLY valid JSON. No markdown, no code fences, no extra text." },
      { role: "user", content: prompt },
    ], 0.3);

    // Strip code fences if the model wraps the response
    content = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");

    let insights;
    try {
      insights = JSON.parse(content);
    } catch {
      console.error("[insights] Failed to parse AI response, using fallback:", content);
      const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
      insights = {
        summary: `In ${month}, you spent $${totalExpense.toFixed(2)} and earned $${totalIncome.toFixed(2)}.`,
        top_categories: sortedCats.map(([name, amount]) => ({ name, amount })),
        saving_suggestions: [
          "Review your largest spending category for potential cuts.",
          "Set a monthly budget limit for discretionary spending.",
          "Consider automating savings transfers.",
        ],
        month_comparison: {
          current_expense: totalExpense,
          previous_expense: prevTotalExpense,
          change_percent: prevTotalExpense > 0 ? Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100) : 0,
          direction: totalExpense > prevTotalExpense ? "up" : totalExpense < prevTotalExpense ? "down" : "same",
        },
      };
    }

    return res.json(insights);
  } catch (err) {
    console.error("[insights/analyze]", err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Unknown error" });
  }
});

// ── POST /api/insights/categorize ────────────────────────────────────────────
// Body: { description: string }
// Returns: { category: string }
router.post("/categorize", async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description is required" });
    }
    const category = await categorizeOne(description);
    return res.json({ category });
  } catch (err) {
    console.error("[insights/categorize]", err);
    return res.status(200).json({ category: "Other", error: err.message });
  }
});

// ── POST /api/insights/categorize-batch ─────────────────────────────────────
// Body: { descriptions: string[] }
// Returns: { categories: string[] }  — same order as input
//
// Sends ALL descriptions to GPT-4o in a single prompt instead of one API call
// per row. A 100-row CSV import costs 1 API call, not 100.
//
// Strategy:
//   • Build a numbered list prompt so the model returns a matching numbered list.
//   • Parse with a regex that tolerates markdown bullets, dots, and extra text.
//   • Any row that fails to parse or returns an unknown value falls back to
//     "Uncategorized" — the batch never fails because of one bad row.
router.post("/categorize-batch", async (req, res) => {
  try {
    const { descriptions } = req.body;
    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return res.status(400).json({ error: "descriptions must be a non-empty array" });
    }
    if (descriptions.length > 500) {
      return res.status(400).json({ error: "Batch too large — maximum 500 descriptions per call" });
    }
    const categories = await categorizeBatch(descriptions);
    return res.json({ categories });
  } catch (err) {
    console.error("[insights/categorize-batch]", err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "Unknown error" });
  }
});

module.exports = router;
