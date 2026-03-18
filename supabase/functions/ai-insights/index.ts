import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get optional shop_id from request body
    let shopId: string | null = null;
    try {
      const body = await req.json();
      shopId = body.shop_id || null;
    } catch {
      // no body is fine
    }

    // Fetch last 30 days of sales transactions + items
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];

    let txQuery = supabase
      .from("sales_transactions")
      .select("id, customer_name, sale_date, shop_id")
      .gte("sale_date", dateStr)
      .order("sale_date", { ascending: false });

    if (shopId) {
      txQuery = txQuery.eq("shop_id", shopId);
    }

    const { data: transactions, error: txError } = await txQuery;
    if (txError) throw new Error(`Failed to fetch transactions: ${txError.message}`);

    // Fetch all sales items for these transactions
    const txIds = (transactions || []).map((t: any) => t.id);
    let items: any[] = [];
    if (txIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from("sales_items")
        .select("transaction_id, product, quantity, unit")
        .in("transaction_id", txIds);
      if (itemsError) throw new Error(`Failed to fetch items: ${itemsError.message}`);
      items = itemsData || [];
    }

    // Fetch inventory for context
    let invQuery = supabase.from("inventory").select("product, quantity, unit, threshold, desired_quantity, shop_id");
    if (shopId) {
      invQuery = invQuery.eq("shop_id", shopId);
    }
    const { data: inventory } = await invQuery;

    // Build data summary for the AI
    const salesSummary = (transactions || []).map((tx: any) => ({
      date: tx.sale_date,
      customer: tx.customer_name,
      shop: tx.shop_id,
      items: items
        .filter((i: any) => i.transaction_id === tx.id)
        .map((i: any) => `${i.quantity} ${i.unit} ${i.product}`)
        .join(", "),
    }));

    const prompt = `You are a Professional Data Analyst for a livestock feed business called "Kimp Feeds".

Analyze the following data from the last 30 days and provide:
1. **Growth Trends**: Identify products with increasing/decreasing sales volume. Compare week-over-week if possible.
2. **Inventory Warnings**: Flag products where current stock is below threshold or where sales velocity suggests stock will run out soon.
3. **Top Customers**: Identify the most active customers and any changes in buying patterns.
4. **Business Improvement Suggestion**: Based on the data, suggest ONE specific, actionable improvement.

Format your response with clear sections using markdown headers and bullet points.

## Sales Data (Last 30 Days)
${salesSummary.length > 0 ? JSON.stringify(salesSummary, null, 2) : "No sales recorded in the last 30 days."}

## Current Inventory
${inventory && inventory.length > 0 ? JSON.stringify(inventory, null, 2) : "No inventory data available."}

Total transactions: ${salesSummary.length}
Date range: ${dateStr} to ${new Date().toISOString().split("T")[0]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional data analyst. Be concise, data-driven, and actionable. Use markdown formatting." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a minute." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "No insights generated.";

    return new Response(
      JSON.stringify({
        insight: content,
        meta: {
          transactions_analyzed: salesSummary.length,
          date_range: `${dateStr} to ${new Date().toISOString().split("T")[0]}`,
          shop_id: shopId || "all",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
