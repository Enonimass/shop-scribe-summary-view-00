import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Truck, CheckCircle2, Clock, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';

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
  logistics_confirmed: { label: 'Logistics Confirmed', className: 'bg-blue-500 text-white' },
  seller_confirmed: { label: 'Seller Confirmed', className: 'bg-purple-500 text-white' },
  added_to_inventory: { label: 'Added to Inventory', className: 'bg-green-600 text-white' },
};

const DeliveryNoteManager: React.FC<Props> = ({ shops, scopedShopId, canCreate = true }) => {
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
        unit: it.unit,
      }))
    );

    if (itemsErr) {
      toast({ title: 'Error', description: itemsErr.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Created', description: `Delivery note ${formNoteNo} created` });
    setShowCreate(false);
    resetForm();
    fetchNotes();
  };

  const confirmAsLogistics = async (note: any) => {
    await supabase.from('delivery_notes').update({
      status: note.status === 'seller_confirmed' ? 'seller_confirmed' : 'logistics_confirmed',
      logistics_confirmed_at: new Date().toISOString(),
      logistics_confirmed_by: profile?.username || 'logistics',
    }).eq('id', note.id);
    // If both confirmed already (seller already did), proceed to push to inventory
    await maybeAddToInventory(note.id);
    toast({ title: 'Confirmed', description: 'Logistics confirmed delivery' });
    fetchNotes();
  };

  const confirmAsSeller = async (note: any) => {
    await supabase.from('delivery_notes').update({
      status: note.status === 'logistics_confirmed' ? 'logistics_confirmed' : 'seller_confirmed',
      seller_confirmed_at: new Date().toISOString(),
      seller_confirmed_by: profile?.username || 'seller',
    }).eq('id', note.id);
    await maybeAddToInventory(note.id);
    toast({ title: 'Confirmed', description: 'Seller confirmed receipt' });
    fetchNotes();
  };

  /** When both logistics and seller have confirmed, add items to inventory and mark final. */
  const maybeAddToInventory = async (noteId: string) => {
    const { data: note } = await supabase
      .from('delivery_notes')
      .select('*, delivery_note_items(*)')
      .eq('id', noteId)
      .single();
    if (!note) return;
    if (!note.logistics_confirmed_at || !note.seller_confirmed_at) return;
    if (note.added_to_inventory_at) return; // already done

    for (const item of (note.delivery_note_items || [])) {
      // Find existing inventory row for shop+product+unit
      const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('shop_id', note.shop_id)
        .eq('product', item.product)
        .eq('unit', item.unit)
        .maybeSingle();
      if (existing) {
        await supabase.from('inventory').update({ quantity: Number(existing.quantity) + Number(item.quantity) }).eq('id', existing.id);
      } else {
        await supabase.from('inventory').insert({
          shop_id: note.shop_id,
          product: item.product,
          quantity: Number(item.quantity),
          unit: item.unit,
          threshold: 15,
          desired_quantity: 25,
        });
      }
    }
    await supabase.from('delivery_notes').update({
      status: 'added_to_inventory',
      added_to_inventory_at: new Date().toISOString(),
    }).eq('id', noteId);
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this delivery note? This cannot be undone.')) return;
    await supabase.from('delivery_notes').delete().eq('id', id);
    toast({ title: 'Deleted', description: 'Delivery note removed' });
    fetchNotes();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> Delivery Notes</h2>
          <p className="text-sm text-muted-foreground">Manage stock deliveries with dual confirmation</p>
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
                          {profile?.role === 'logistics' && !n.logistics_confirmed_at && (
                            <Button size="sm" variant="default" onClick={() => confirmAsLogistics(n)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm (Logistics)
                            </Button>
                          )}
                          {profile?.role === 'seller' && !n.seller_confirmed_at && (
                            <Button size="sm" variant="default" onClick={() => confirmAsSeller(n)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm Receipt
                            </Button>
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
                        <SelectItem value="bags">Bags</SelectItem>
                        <SelectItem value="50kg">50 kg</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
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
