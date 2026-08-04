import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Truck, CheckCircle2, Clock, Package, Printer, Send, XCircle, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';
import { CANONICAL_UNITS, canonicalUnitKey, normalizeUnit } from '@/lib/units';
import { logAudit } from '@/lib/audit';

interface Shop { shop_id: string; shop_name: string }
interface LineItem { product: string; quantity: string; unit: string }

interface Props {
  shops: Shop[];
  /** When set, scope view & creation to a single shop (seller usage). */
  scopedShopId?: string;
  /** Hide create button when only viewing (e.g., seller viewing their own pending). */
  canCreate?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-yellow-500 text-white' },
  dispatched: { label: 'Dispatched — awaiting shop', className: 'bg-blue-500 text-white' },
  approved: { label: 'Approved & in inventory', className: 'bg-green-600 text-white' },
  rejected: { label: 'Rejected by shop', className: 'bg-destructive text-destructive-foreground' },
  logistics_confirmed: { label: 'Logistics Confirmed', className: 'bg-blue-500 text-white' },
  seller_confirmed: { label: 'Seller Confirmed', className: 'bg-purple-500 text-white' },
  added_to_inventory: { label: 'Added to Inventory', className: 'bg-green-600 text-white' },
};

const DeliveryNoteManager: React.FC<Props> = ({ shops, scopedShopId, canCreate = false }) => {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [products, setProducts] = useState<string[]>([]);

  // Create form state
  const [formShopId, setFormShopId] = useState(scopedShopId || '');
  const [formNoteNo, setFormNoteNo] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDeliveredBy, setFormDeliveredBy] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ product: '', quantity: '', unit: 'bags' }]);

  // Detail dialog
  const [openNote, setOpenNote] = useState<any | null>(null);
  // Edit dialog (logistics correcting a rejected note)
  const [editNote, setEditNote] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  // Reject dialog (shop rejecting a dispatched note)
  const [rejectNote, setRejectNote] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchNotes(); fetchProducts(); }, [scopedShopId]);

  useEffect(() => {
    const channel = supabase
      .channel('delivery-notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_notes' }, () => fetchNotes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_note_items' }, () => fetchNotes())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scopedShopId]);

  const fetchProducts = async () => {
    const { data } = await supabase.from('product_category_items').select('product_name').order('product_name');
    if (data) setProducts([...new Set(data.map(d => d.product_name))]);
  };

  const fetchNotes = async () => {
    setLoading(true);
    let q = supabase.from('delivery_notes').select('*, delivery_note_items(*)').order('delivery_date', { ascending: false });
    if (scopedShopId) q = q.eq('shop_id', scopedShopId);
    const { data, error } = await q;
    if (error) console.error(error);
    else setNotes(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setFormShopId(scopedShopId || '');
    setFormNoteNo('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormDeliveredBy('');
    setFormNotes('');
    setItems([{ product: '', quantity: '', unit: 'bags' }]);
  };

  const addItem = () => setItems([...items, { product: '', quantity: '', unit: 'bags' }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string) => {
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };

  const handleCreate = async () => {
    if (!formShopId || !formNoteNo || !formDeliveredBy) {
      toast({ title: 'Missing fields', description: 'Shop, delivery note number and delivered-by are required', variant: 'destructive' });
      return;
    }
    const validItems = items.filter(i => i.product && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      toast({ title: 'No items', description: 'Add at least one product', variant: 'destructive' });
      return;
    }

    const { data: noteData, error: noteErr } = await supabase
      .from('delivery_notes')
      .insert({
        shop_id: formShopId,
        delivery_note_no: formNoteNo,
        delivery_date: formDate,
        delivered_by: formDeliveredBy,
        notes: formNotes || null,
        created_by: profile?.username || null,
        status: 'draft',
      })
      .select()
      .single();

    if (noteErr || !noteData) {
      toast({ title: 'Error', description: noteErr?.message || 'Failed to create delivery note', variant: 'destructive' });
      return;
    }

    const { error: itemsErr } = await supabase.from('delivery_note_items').insert(
      validItems.map(it => ({
        delivery_note_id: noteData.id,
        product: it.product,
        quantity: Number(it.quantity),
        unit: normalizeUnit(it.unit),
      }))
    );

    if (itemsErr) {
      toast({ title: 'Error', description: itemsErr.message, variant: 'destructive' });
      return;
    }

    logAudit({ action: 'delivery_note.create', entity: 'delivery_notes', entity_id: noteData.id, shop_id: formShopId, after: { delivery_note_no: formNoteNo, items: validItems } });
    toast({ title: 'Draft created', description: `Note ${formNoteNo} created. Dispatch it when the goods leave the factory.` });
    setShowCreate(false);
    resetForm();
    fetchNotes();
  };

  /** Logistics dispatches: goods leave the factory, no shop inventory change yet. */
  const dispatchNote = async (note: any) => {
    setBusy(true);
    // Deduct from factory stock so goods in transit are not double-counted
    for (const item of (note.delivery_note_items || [])) {
      const key = canonicalUnitKey(item.unit);
      const { data: fRows } = await supabase.from('factory_inventory').select('*').eq('product', item.product);
      const fRow = (fRows || []).find((r: any) => (key ? canonicalUnitKey(r.unit) === key : r.unit === item.unit));
      if (fRow) {
        await supabase.from('factory_inventory')
          .update({ quantity: Number(fRow.quantity) - Number(item.quantity) })
          .eq('id', fRow.id);
      }
    }
    const { error } = await supabase.from('delivery_notes').update({
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      dispatched_by: profile?.username || 'logistics',
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    }).eq('id', note.id);
    setBusy(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({ action: 'delivery_note.dispatch', entity: 'delivery_notes', entity_id: note.id, shop_id: note.shop_id });
    toast({ title: 'Dispatched', description: 'The shop can now accept or reject this delivery' });
    fetchNotes();
  };

  /** Shop approves: items go straight into shop inventory. */
  const approveNote = async (note: any) => {
    if (note.approved_at) return;
    setBusy(true);
    for (const item of (note.delivery_note_items || [])) {
      const unit = normalizeUnit(item.unit);
      const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('shop_id', note.shop_id)
        .eq('product', item.product)
        .eq('unit', unit)
        .maybeSingle();
      if (existing) {
        await supabase.from('inventory').update({ quantity: Number(existing.quantity) + Number(item.quantity) }).eq('id', existing.id);
      } else {
        await supabase.from('inventory').insert({
          shop_id: note.shop_id,
          product: item.product,
          quantity: Number(item.quantity),
          unit,
          threshold: 15,
          desired_quantity: 25,
        });
      }
    }
    const { error } = await supabase.from('delivery_notes').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: profile?.username || 'seller',
      seller_confirmed_at: new Date().toISOString(),
      seller_confirmed_by: profile?.username || 'seller',
      added_to_inventory_at: new Date().toISOString(),
    }).eq('id', note.id);
    setBusy(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({ action: 'delivery_note.approve', entity: 'delivery_notes', entity_id: note.id, shop_id: note.shop_id });
    toast({ title: 'Accepted', description: 'Stock added to your inventory' });
    fetchNotes();
  };

  /** Shop rejects with a reason; logistics must correct and re-dispatch. */
  const submitReject = async () => {
    if (!rejectNote) return;
    if (!rejectReason.trim()) {
      toast({ title: 'Reason required', description: 'Say what is wrong so logistics can correct it', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('delivery_notes').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: profile?.username || 'seller',
      rejection_reason: rejectReason.trim(),
    }).eq('id', rejectNote.id);
    setBusy(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({ action: 'delivery_note.reject', entity: 'delivery_notes', entity_id: rejectNote.id, shop_id: rejectNote.shop_id, notes: rejectReason.trim() });
    toast({ title: 'Rejected', description: 'Logistics has been asked to correct this delivery note' });
    setRejectNote(null);
    setRejectReason('');
    fetchNotes();
  };

  /** Logistics corrects a rejected note's items, then re-dispatches. */
  const openEdit = (note: any) => {
    setEditNote(note);
    setEditItems((note.delivery_note_items || []).map((it: any) => ({
      product: it.product,
      quantity: String(it.quantity),
      unit: normalizeUnit(it.unit),
    })));
  };

  const saveEdit = async (redispatch: boolean) => {
    if (!editNote) return;
    const valid = editItems.filter(i => i.product && Number(i.quantity) > 0);
    if (valid.length === 0) {
      toast({ title: 'No items', description: 'Add at least one product', variant: 'destructive' });
      return;
    }
    setBusy(true);
    await supabase.from('delivery_note_items').delete().eq('delivery_note_id', editNote.id);
    const { error } = await supabase.from('delivery_note_items').insert(
      valid.map(it => ({
        delivery_note_id: editNote.id,
        product: it.product,
        quantity: Number(it.quantity),
        unit: normalizeUnit(it.unit),
      }))
    );
    setBusy(false);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    logAudit({
      action: 'delivery_note.edit',
      entity: 'delivery_notes',
      entity_id: editNote.id,
      shop_id: editNote.shop_id,
      before: { items: editNote.delivery_note_items },
      after: { items: valid },
    });
    const updated = { ...editNote, delivery_note_items: valid.map(v => ({ ...v, quantity: Number(v.quantity) })) };
    setEditNote(null);
    if (redispatch) await dispatchNote(updated);
    else { toast({ title: 'Saved' }); fetchNotes(); }
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this delivery note? This cannot be undone.')) return;
    await supabase.from('delivery_notes').delete().eq('id', id);
    toast({ title: 'Deleted', description: 'Delivery note removed' });
    fetchNotes();
  };

  const totalsByUnit = (note: any): Record<string, number> => {
    const totals: Record<string, number> = {};
    (note?.delivery_note_items || []).forEach((it: any) => {
      const u = it.unit || 'unit';
      totals[u] = (totals[u] || 0) + Number(it.quantity || 0);
    });
    return totals;
  };

  const formatTotals = (note: any) =>
    Object.entries(totalsByUnit(note))
      .map(([u, q]) => `${q} ${u}`)
      .join('  •  ');

  const printNotePDF = (note: any) => {
    const doc = new jsPDF();
    const shopName = shops.find(s => s.shop_id === note.shop_id)?.shop_name || note.shop_id;
    // Logo
    try { doc.addImage(kimpFeedsLogo, 'JPEG', 14, 10, 22, 22); } catch {}
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('KIMP FEEDS', 40, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Delivery Note', 40, 25);

    doc.setFontSize(10);
    const metaY = 40;
    doc.text(`DN No.: ${note.delivery_note_no}`, 14, metaY);
    doc.text(`Date: ${new Date(note.delivery_date).toLocaleDateString()}`, 110, metaY);
    doc.text(`Shop: ${shopName}`, 14, metaY + 6);
    doc.text(`Delivered By: ${note.delivered_by}`, 110, metaY + 6);
    doc.text(`Status: ${STATUS_LABELS[note.status]?.label || note.status}`, 14, metaY + 12);
    if (note.notes) doc.text(`Notes: ${note.notes}`, 14, metaY + 18);

    autoTable(doc, {
      startY: metaY + (note.notes ? 24 : 18),
      head: [['Product', 'Quantity', 'Unit']],
      body: (note.delivery_note_items || []).map((it: any) => [it.product, String(it.quantity), it.unit]),
      headStyles: { fillColor: [22, 101, 52] },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || metaY + 30;
    doc.setFont('helvetica', 'bold');
    doc.text('Totals per unit:', 14, finalY + 10);
    doc.setFont('helvetica', 'normal');
    const totals = totalsByUnit(note);
    let ty = finalY + 16;
    Object.entries(totals).forEach(([u, q]) => {
      doc.text(`• ${q} ${u}`, 18, ty);
      ty += 6;
    });

    const sigY = ty + 16;
    doc.text('Delivered By: ____________________________', 14, sigY);
    doc.text('Received By: ____________________________', 110, sigY);
    doc.setFontSize(8);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 290);

    doc.save(`DeliveryNote-${note.delivery_note_no}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> Delivery Notes</h2>
          <p className="text-sm text-muted-foreground">Logistics dispatches a note, the shop accepts (stock enters inventory) or rejects with a reason for correction.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Delivery Note
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No delivery notes yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DN No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Delivered By</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map(n => {
                  const status = STATUS_LABELS[n.status] || STATUS_LABELS.draft;
                  const itemCount = (n.delivery_note_items || []).length;
                  const shopName = shops.find(s => s.shop_id === n.shop_id)?.shop_name || n.shop_id;
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-sm">{n.delivery_note_no}</TableCell>
                      <TableCell>{new Date(n.delivery_date).toLocaleDateString()}</TableCell>
                      <TableCell>{shopName}</TableCell>
                      <TableCell>{n.delivered_by}</TableCell>
                      <TableCell>{itemCount}</TableCell>
                      <TableCell><Badge className={status.className}>{status.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setOpenNote(n)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => printNotePDF(n)}>
                            <Printer className="h-3 w-3 mr-1" /> PDF
                          </Button>
                          {(profile?.role === 'logistics' || profile?.role === 'admin') && (n.status === 'draft' || n.status === 'rejected') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openEdit(n)}>
                                <Pencil className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              <Button size="sm" variant="default" disabled={busy} onClick={() => dispatchNote(n)}>
                                <Send className="h-3 w-3 mr-1" /> {n.status === 'rejected' ? 'Re-dispatch' : 'Dispatch'}
                              </Button>
                            </>
                          )}
                          {profile?.role === 'seller' && n.status === 'dispatched' && (
                            <>
                              <Button size="sm" variant="default" disabled={busy} onClick={() => approveNote(n)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Accept
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setRejectNote(n); setRejectReason(''); }}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {profile?.role === 'admin' && (
                            <Button size="sm" variant="ghost" onClick={() => deleteNote(n.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> New Delivery Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Delivery Note No.</Label>
                <Input value={formNoteNo} onChange={e => setFormNoteNo(e.target.value)} placeholder="e.g. DN-1024" />
              </div>
              <div className="space-y-1">
                <Label>Delivery Date</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Shop</Label>
                <Select value={formShopId} onValueChange={setFormShopId} disabled={!!scopedShopId}>
                  <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                  <SelectContent>
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Delivery Made By</Label>
                <Input value={formDeliveredBy} onChange={e => setFormDeliveredBy(e.target.value)} placeholder="Driver / staff name" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Notes (optional)</Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Any extra info" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base">Products</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add product
                </Button>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-xs">Product</Label>
                    <Select value={it.product} onValueChange={v => updateItem(i, 'product', v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" min="0" step="0.01" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Select value={it.unit} onValueChange={v => updateItem(i, 'unit', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CANONICAL_UNITS.map(u => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate}>Create Delivery Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!openNote} onOpenChange={o => !o && setOpenNote(null)}>
        <DialogContent className="max-w-2xl">
          {openNote && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" /> Delivery Note {openNote.delivery_note_no}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Date:</span> {new Date(openNote.delivery_date).toLocaleDateString()}</div>
                  <div><span className="text-muted-foreground">Shop:</span> {shops.find(s => s.shop_id === openNote.shop_id)?.shop_name || openNote.shop_id}</div>
                  <div><span className="text-muted-foreground">Delivered by:</span> {openNote.delivered_by}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_LABELS[openNote.status]?.className}>{STATUS_LABELS[openNote.status]?.label}</Badge></div>
                  <div className="col-span-2 flex items-center gap-2 text-xs">
                    <Clock className="h-3 w-3" />
                    Logistics: {openNote.logistics_confirmed_at ? `${openNote.logistics_confirmed_by} · ${new Date(openNote.logistics_confirmed_at).toLocaleString()}` : 'pending'}
                  </div>
                  <div className="col-span-2 flex items-center gap-2 text-xs">
                    <Clock className="h-3 w-3" />
                    Seller: {openNote.seller_confirmed_at ? `${openNote.seller_confirmed_by} · ${new Date(openNote.seller_confirmed_at).toLocaleString()}` : 'pending'}
                  </div>
                  {openNote.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {openNote.notes}</div>}
                  {openNote.rejection_reason && (
                    <div className="col-span-2 p-2 rounded-md border border-destructive/40 bg-destructive/10 text-xs">
                      <span className="font-semibold">Rejected by {openNote.rejected_by}:</span> {openNote.rejection_reason}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 rounded-md bg-muted/50 text-sm">
                  <div><span className="font-semibold">Totals per unit:</span> {formatTotals(openNote) || '—'}</div>
                  <Button size="sm" variant="outline" onClick={() => printNotePDF(openNote)}>
                    <Printer className="h-3 w-3 mr-1" /> Print PDF
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(openNote.delivery_note_items || []).map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product}</TableCell>
                        <TableCell>{it.quantity}</TableCell>
                        <TableCell>{it.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeliveryNoteManager;

