import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action: string = body.action;
    if (!action) {
      return json({ error: "action is required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey);

    // For non-bootstrap actions: require caller is super_admin
    const requireSuperAdmin = async (): Promise<string | null> => {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) return null;
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return null;
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", uid)
        .eq("role", "super_admin")
        .maybeSingle();
      return roleRow ? uid : null;
    };

    if (action === "bootstrap") {
      // Only allowed when there are no super admins yet
      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((count ?? 0) > 0) {
        return json({ error: "Super admin already exists. Use create instead." }, 403);
      }
      return await createSuperAdmin(admin, body);
    }

    if (action === "create") {
      const uid = await requireSuperAdmin();
      if (!uid) return json({ error: "Forbidden" }, 403);
      return await createSuperAdmin(admin, body);
    }

    if (action === "list") {
      const uid = await requireSuperAdmin();
      if (!uid) return json({ error: "Forbidden" }, 403);
      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id, created_at")
        .eq("role", "super_admin");
      const ids = (roles || []).map((r: any) => r.user_id);
      const users: any[] = [];
      for (const id of ids) {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user) {
          users.push({
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at,
          });
        }
      }
      return json({ users });
    }

    if (action === "delete") {
      const uid = await requireSuperAdmin();
      if (!uid) return json({ error: "Forbidden" }, 403);
      const targetId: string = body.user_id;
      if (!targetId) return json({ error: "user_id required" }, 400);
      if (targetId === uid) return json({ error: "You cannot remove yourself" }, 400);
      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((count ?? 0) <= 1) return json({ error: "At least one super admin must remain" }, 400);
      await admin.from("user_roles").delete().eq("user_id", targetId).eq("role", "super_admin");
      await admin.auth.admin.deleteUser(targetId);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("super-admin-manage error", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});

async function createSuperAdmin(admin: any, body: any) {
  const email: string = (body.email || "").trim().toLowerCase();
  const password: string = body.password || "";
  if (!email || !password) return json({ error: "email and password required" }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message || "Failed to create user" }, 400);
  }
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: created.user.id, role: "super_admin" });
  if (roleErr) {
    return json({ error: roleErr.message }, 500);
  }
  return json({ ok: true, user: { id: created.user.id, email: created.user.email } });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}