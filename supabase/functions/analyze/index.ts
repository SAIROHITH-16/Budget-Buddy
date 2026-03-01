import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Transaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { month, transactions }: { month: string; transactions: Transaction[] } = await req.json();

    if (!month) {
      return new Response(JSON.stringify({ error: "month is required (YYYY-MM)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(transactions)) {
      return new Response(JSON.stringify({ error: "transactions array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Supabase client — only used to cache results in ai_insights table
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existing } = await supabase.from("ai_insights").select("*").eq("month", month).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify(existing), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const monthTxs = transactions.filter((t) => t.date.startsWith(month));
    if (monthTxs.length === 0) {
      return new Response(JSON.stringify({ error: "No transactions found for this month" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalIncome  = monthTxs.filter((t) => t.type === "income") .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = monthTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

    const categories: Record<string, number> = {};
    monthTxs.filter((t) => t.type === "expense").forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + Number(t.amount);
    });

    const [y, m] = month.split("-").map(Number);
    const prevDate  = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevTxs   = transactions.filter((t) => t.date.startsWith(prevMonth));
    const prevTotalExpense = prevTxs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    const prevTotalIncome  = prevTxs.filter((t) => t.type === "income") .reduce((s, t) => s + Number(t.amount), 0);

    // GitHub Models — GPT-4o (free with GitHub Student Pack)
    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured");

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

Return ONLY the JSON. No explanation.`;

    const aiResponse = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a financial analyst AI. Return ONLY valid JSON. No markdown, no code fences, no extra text." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`GitHub Models API error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content?.trim() || "";
    content = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");

    let insights;
    try {
      insights = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI insights:", content);
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

    const { data: saved, error: saveError } = await supabase
      .from("ai_insights")
      .upsert({ month, summary: insights.summary, top_categories: insights.top_categories, saving_suggestions: insights.saving_suggestions, month_comparison: insights.month_comparison }, { onConflict: "month" })
      .select().single();

    if (saveError) console.error("Failed to cache insights:", saveError);

    return new Response(JSON.stringify(saved || insights), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
