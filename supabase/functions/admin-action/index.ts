import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySessionToken, extractBearer } from "../_shared/session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = extractBearer(req);
    const claims = await verifySessionToken(token);
    if (!claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    if (!action) return json({ error: "action required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // Resolve canonical caller profile from DB (don't trust claim role alone)
    const { data: caller } = await admin
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", claims.sub)
      .maybeSingle();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const isAdmin = caller.role === "admin";

    // ----- Audit log (any authenticated app user may write their own entry)
    if (action === "log_audit") {
      const e = body.entry || {};
      await admin.from("audit_logs").insert({
        actor: e.actor || caller.id,
        actor_role: caller.role,
        action: e.action,
        entity: e.entity,
        entity_id: e.entity_id ?? null,
        shop_id: e.shop_id ?? caller.shop_id ?? null,
        before: e.before ?? null,
        after: e.after ?? null,
        notes: e.notes ?? null,
      });
      return json({ ok: true });
    }

    // ----- Customer admin (any authenticated app user, scoped to their shop unless admin)
    if (action === "rename_customer") {
      const { p_old, p_new, p_shop_id } = body;
      if (!p_old || !p_new || !p_shop_id) return json({ error: "missing args" }, 400);
      if (!isAdmin && caller.shop_id !== p_shop_id) return json({ error: "Forbidden" }, 403);
      const { data, error } = await admin.rpc("rename_customer", { p_old, p_new, p_shop_id });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }
    if (action === "sync_customers") {
      const p_shop_id = body.p_shop_id ?? null;
      if (!isAdmin && p_shop_id !== caller.shop_id) return json({ error: "Forbidden" }, 403);
      const { data, error } = await admin.rpc("sync_customers_from_sales", { p_shop_id });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    // ----- User management (admin only) -----
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    if (action === "create_user") {
      const { username, password, display_name, role, shop_id, shop_name } = body;
      if (!username || !password || !display_name || !role)
        return json({ error: "missing fields" }, 400);
      if (String(password).length < 6) return json({ error: "password too short" }, 400);
      const { data, error } = await admin
        .from("profiles")
        .insert({
          username, password, display_name, role,
          shop_id: role === "seller" ? shop_id ?? null : null,
          shop_name: role === "seller" ? shop_name ?? null : null,
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, id: data?.id });
    }

    if (action === "update_user") {
      const { id, username, display_name, shop_name } = body;
      if (!id) return json({ error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
      if (username !== undefined) patch.username = username;
      if (display_name !== undefined) patch.display_name = display_name;
      if (shop_name !== undefined) patch.shop_name = shop_name;
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const { id, new_password } = body;
      if (!id || !new_password) return json({ error: "id and new_password required" }, 400);
      if (String(new_password).length < 6) return json({ error: "password too short" }, 400);
      const { error } = await admin.from("profiles").update({ password: new_password }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      if (id === caller.id) return json({ error: "cannot delete yourself" }, 400);
      const { error } = await admin.from("profiles").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin-action error", e);
    return json({ error: "Internal error" }, 500);
  }
});
