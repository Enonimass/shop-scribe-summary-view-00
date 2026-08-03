import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, MessageSquarePlus, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { useAuth } from './AuthProvider';

export const ENTITY_OPTIONS = [
  'Sales transaction',
  'Inventory / stock',
  'Delivery note',
  'Trip',
  'Debt / payment',
  'Customer',
  'Other',
];

type Status = 'pending' | 'approved' | 'rejected';

const statusVariant: Record<Status, 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  approved: 'outline',
  rejected: 'destructive',
};

interface Props {
  /** Admins get review controls; everyone else gets the request form + own history. */
  isAdmin?: boolean;
  /** Limit the list to a shop (sellers). */
  shopId?: string;
}

const emptyForm = { entity: 'Sales transaction', entity_label: '', requested_change: '', reason: '' };

const ChangeRequests: React.FC<Props> = ({ isAdmin = false, shopId }) => {
  const { profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | Status>(isAdmin ? 'pending' : 'all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [reviewTarget, setReviewTarget] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<Status>('approved');
  const [adminNotes, setAdminNotes] = useState('');

  const load = async () => {
    setLoading(true);
    let q = supabase.from('change_requests').select('*').order('created_at', { ascending: false });
    if (!isAdmin && profile?.username) q = q.eq('requester', profile.username);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isAdmin, profile?.username]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const submit = async () => {
    if (!form.requested_change.trim()) return toast({ title: 'Describe the change needed', variant: 'destructive' });
    if (!form.reason.trim()) return toast({ title: 'A reason is required', variant: 'destructive' });
    setSaving(true);
    const payload = {
      requester: profile?.username || 'unknown',
      requester_role: profile?.role || 'unknown',
      shop_id: shopId || profile?.shop_id || null,
      entity: form.entity,
      entity_label: form.entity_label || null,
      requested_change: form.requested_change.trim(),
      reason: form.reason.trim(),
      status: 'pending',
    };
    const { data, error } = await supabase.from('change_requests').insert(payload).select('id').single();
    setSaving(false);
    if (error) return toast({ title: 'Could not send request', description: error.message, variant: 'destructive' });
    logAudit({ action: 'create', entity: 'change_request', entity_id: data?.id, shop_id: payload.shop_id, after: payload });
    toast({ title: 'Request sent to admin' });
    setForm({ ...emptyForm });
    setDialogOpen(false);
    load();
  };

  const openReview = (r: any, decision: Status) => {
    setReviewTarget(r);
    setReviewDecision(decision);
    setAdminNotes(r.admin_notes || '');
  };

  const saveReview = async () => {
    const r = reviewTarget;
    if (!r) return;
    const patch = {
      status: reviewDecision,
      admin_notes: adminNotes || null,
      reviewed_by: profile?.username || 'admin',
      reviewed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('change_requests').update(patch).eq('id', r.id);
    if (error) return toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    logAudit({ action: reviewDecision, entity: 'change_request', entity_id: r.id, shop_id: r.shop_id, before: r, after: patch });
    toast({ title: `Request ${reviewDecision}` });
    setReviewTarget(null);
    load();
  };

  return (
    <Card className="border-green-200">
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">
            {isAdmin ? `Change requests (${pendingCount} pending)` : 'My change requests'}
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {isAdmin
              ? 'Requests from sellers and logistics to correct wrongly entered data.'
              : 'Ask the admin to correct data you entered wrongly. Always give a reason.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          {!isAdmin && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <MessageSquarePlus className="w-4 h-4 mr-1" /> Request a change
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="w-48">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-xs [&_th]:px-2 [&_th]:py-2 [&_td]:px-2 [&_td]:py-1.5 [&_th]:whitespace-nowrap [&_td]:align-top">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[86px]">Date</TableHead>
                {isAdmin && <TableHead className="w-[110px]">Requested by</TableHead>}
                <TableHead className="w-[110px]">Area</TableHead>
                <TableHead className="w-[120px]">Record</TableHead>
                <TableHead>Change needed</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-[86px]">Status</TableHead>
                <TableHead>Admin notes</TableHead>
                {isAdmin && <TableHead className="w-[86px]">Review</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="font-medium">{r.requester}</div>
                      <div className="text-[11px] text-muted-foreground">{r.requester_role}{r.shop_id ? ` · ${r.shop_id}` : ''}</div>
                    </TableCell>
                  )}
                  <TableCell>{r.entity}</TableCell>
                  <TableCell>{r.entity_label || '—'}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{r.requested_change}</TableCell>
                  <TableCell className="whitespace-pre-wrap text-muted-foreground">{r.reason}</TableCell>
                  <TableCell><Badge variant={statusVariant[r.status as Status] || 'secondary'}>{r.status}</Badge></TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {r.admin_notes || '—'}
                    {r.reviewed_by && <div className="text-[11px] text-muted-foreground">by {r.reviewed_by}</div>}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openReview(r, 'approved')}><Check className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => openReview(r, 'rejected')}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && !filtered.length && (
                <TableRow><TableCell colSpan={isAdmin ? 9 : 7} className="text-center text-muted-foreground">No change requests.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request a data change</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Area</Label>
              <Select value={form.entity} onValueChange={(v) => setForm({ ...form, entity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Which record? (customer, date, product…)</Label>
              <Input value={form.entity_label} onChange={(e) => setForm({ ...form, entity_label: e.target.value })} placeholder="e.g. James — 12 Aug — High Yield" />
            </div>
            <div className="space-y-1">
              <Label>What should change?</Label>
              <Textarea value={form.requested_change} onChange={(e) => setForm({ ...form, requested_change: e.target.value })} placeholder="e.g. Quantity should be 3 bags, not 5 bags" />
            </div>
            <div className="space-y-1">
              <Label>Why does it need to change?</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Entered twice by mistake during a rush" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDecision === 'approved' ? 'Approve request' : 'Reject request'}</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">From:</span> {reviewTarget.requester} ({reviewTarget.requester_role})</div>
              <div><span className="text-muted-foreground">Change:</span> {reviewTarget.requested_change}</div>
              <div><span className="text-muted-foreground">Reason:</span> {reviewTarget.reason}</div>
              <div className="space-y-1">
                <Label>Notes for the requester</Label>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="What you did, or why not" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={saveReview} variant={reviewDecision === 'approved' ? 'default' : 'destructive'}>
              {reviewDecision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ChangeRequests;