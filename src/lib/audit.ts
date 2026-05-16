import { supabase } from '@/integrations/supabase/client';

export interface AuditEntry {
  action: string;
  entity: string;
  entity_id?: string | null;
  shop_id?: string | null;
  before?: any;
  after?: any;
  notes?: string;
}

function readActor(): { actor: string; actor_role: string } {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const u = JSON.parse(raw);
      return {
        actor: u.username || u.display_name || u.id || 'unknown',
        actor_role: u.role || 'unknown',
      };
    }
  } catch {}
  // Super admin uses Supabase Auth; fall back to that if available
  return { actor: 'unknown', actor_role: 'unknown' };
}

export async function logAudit(entry: AuditEntry) {
  try {
    const { actor, actor_role } = readActor();
    let resolvedActor = actor;
    let resolvedRole = actor_role;
    if (resolvedActor === 'unknown') {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        resolvedActor = data.user.email || data.user.id;
        resolvedRole = 'super_admin';
      }
    }
    await supabase.from('audit_logs').insert({
      actor: resolvedActor,
      actor_role: resolvedRole,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id ?? null,
      shop_id: entry.shop_id ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      notes: entry.notes ?? null,
    });
  } catch (e) {
    // Never block the user on audit logging failures
    console.warn('audit log failed', e);
  }
}