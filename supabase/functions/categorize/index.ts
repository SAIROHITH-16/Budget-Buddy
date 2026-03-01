import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  "Salary", "Freelance", "Rent", "Groceries", "Utilities",
  "Transport", "Entertainment", "Health", "Education", "Shopping",
  "Food", "Subscriptions", "Insurance", "Savings", "Investment", "Other"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { description } = await req.json();
    if (!description || typeof description !== "string") {
      return new Response(JSON.stringify({ error: "description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured");

    const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a financial transaction categorizer. Given a transaction description, return ONLY a valid JSON object with a single "category" field. The category MUST be one of: ${CATEGORIES.join(", ")}. No explanation, no extra text, ONLY the JSON object. Example: {"category": "Food"}`
          },
          { role: "user", content: description },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    // Parse and validate JSON response
    let category = "Other";
    try {
      const parsed = JSON.parse(content);
      if (parsed.category && CATEGORIES.includes(parsed.category)) {
        category = parsed.category;
      }
    } catch {
      console.error("Failed to parse AI response:", content);
      // Try to extract category from raw text
      const found = CATEGORIES.find(c => content?.toLowerCase().includes(c.toLowerCase()));
      if (found) category = found;
    }

    return new Response(JSON.stringify({ category }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize error:", e);
    return new Response(JSON.stringify({ category: "Other", error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200, // Return fallback category, don't crash
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
