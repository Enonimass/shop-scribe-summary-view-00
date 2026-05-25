import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Truck, CheckCircle2, Send, RotateCcw, FileText, Printer, FileSignature } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { logAudit } from '@/lib/audit';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';

interface Shop { shop_id: string; shop_name: string }
interface Props { shops: Shop[] }

const UNITS = ['bags', '50kg Bags', 'kg'];
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-yellow-500 text-white' },
  dispatched: { label: 'Dispatched', cls: 'bg-blue-500 text-white' },
  completed: { label: 'Completed', cls: 'bg-green-600 text-white' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-500 text-white' },
};

type StopForm = {
  stop_type: 'outlet' | 'customer';
  shop_id: string;
  shop_name: string;
  customer_name: string;
  place: string;
  items: { product: string; unit: string; dispatched_qty: string }[];
};

const TripManager: React.FC<Props> = ({ shops }) => {
  const { profile } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [openTrip, setOpenTrip] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [tripNo, setTripNo] = useState('');
  const [tripDate, setTripDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState<StopForm[]>([]);

  const fetchAll = async () => {
    const { data } = await supabase
      .from('trips')
      .select('*, trip_stops(*, trip_stop_items(*)), trip_returns(*)')
      .order('trip_date', { ascending: false });
    const trips = data || [];
    // Fetch delivery notes linked to these trips & attach per stop
    const tripIds = trips.map((t: any) => t.id);
    let dns: any[] = [];
    if (tripIds.length) {
      const { data: dnData } = await supabase
        .from('delivery_notes')
        .select('*, delivery_note_items(*)')
        .in('trip_id', tripIds);
      dns = dnData || [];
    }
    trips.forEach((t: any) => {
      const tripDns = dns.filter(d => d.trip_id === t.id);
      t.delivery_notes = tripDns;
      (t.trip_stops || []).forEach((s: any) => {
        s.delivery_notes = tripDns.filter(d => d.trip_stop_id === s.id);
      });
    });
    setTrips(trips);
    if (openTrip) {
      const fresh = trips.find((t: any) => t.id === openTrip.id);
      if (fresh) setOpenTrip(fresh);
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('product_category_items').select('product_name').order('product_name');
    if (data) setProducts([...new Set(data.map((d: any) => d.product_name))]);
  };

  useEffect(() => { fetchAll(); fetchProducts(); }, []);
  useEffect(() => {
    const ch = supabase
      .channel('trips-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stops' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stop_items' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_returns' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_notes' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_note_items' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const resetCreate = () => {
    setTripNo(`TRIP-${Date.now().toString().slice(-6)}`);
    setTripDate(new Date().toISOString().split('T')[0]);
    setVehicle(''); setDriver(''); setNotes('');
    setStops([]);
  };

  const addStop = (stop_type: 'outlet' | 'customer') => {
    setStops([...stops, { stop_type, shop_id: '', shop_name: '', customer_name: '', place: '', items: [{ product: '', unit: 'bags', dispatched_qty: '' }] }]);
  };
  const updateStop = (i: number, patch: Partial<StopForm>) => {
    setStops(stops.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const removeStop = (i: number) => setStops(stops.filter((_, idx) => idx !== i));
  const addStopItem = (i: number) => updateStop(i, { items: [...stops[i].items, { product: '', unit: 'bags', dispatched_qty: '' }] });
  const updateStopItem = (i: number, j: number, patch: any) => {
    const it = stops[i].items.map((x, idx) => idx === j ? { ...x, ...patch } : x);
    updateStop(i, { items: it });
  };
  const removeStopItem = (i: number, j: number) => updateStop(i, { items: stops[i].items.filter((_, idx) => idx !== j) });

  const createTrip = async () => {
    if (!tripNo.trim()) return toast({ title: 'Trip no required', variant: 'destructive' });
    if (stops.length === 0) return toast({ title: 'Add at least one stop', variant: 'destructive' });
    for (const s of stops) {
      if (s.stop_type === 'outlet' && !s.shop_id) return toast({ title: 'Pick a shop for outlet stop', variant: 'destructive' });
      if (s.stop_type === 'customer' && !s.customer_name.trim()) return toast({ title: 'Customer name required', variant: 'destructive' });
      if (s.items.some(it => !it.product || !it.dispatched_qty)) return toast({ title: 'Fill all stop items', variant: 'destructive' });
    }
    const { data: trip, error } = await supabase.from('trips').insert({
      trip_no: tripNo.trim(), trip_date: tripDate, vehicle, driver, notes, status: 'draft',
      created_by: profile?.username || profile?.display_name || null,
    }).select().single();
    if (error || !trip) return toast({ title: 'Error', description: error?.message, variant: 'destructive' });

    for (const s of stops) {
      const shopName = s.stop_type === 'outlet' ? (shops.find(sh => sh.shop_id === s.shop_id)?.shop_name || s.shop_id) : (s.shop_id ? shops.find(sh => sh.shop_id === s.shop_id)?.shop_name : null);
      const { data: stop } = await supabase.from('trip_stops').insert({
        trip_id: trip.id,
        stop_type: s.stop_type,
        shop_id: s.stop_type === 'outlet' ? s.shop_id : (s.shop_id || null),
        shop_name: shopName,
        customer_name: s.stop_type === 'customer' ? s.customer_name : null,
        place: s.place,
        status: 'pending',
      }).select().single();
      if (stop) {
        const rows = s.items.map(it => ({
          stop_id: stop.id,
          product: it.product,
          unit: it.unit,
          dispatched_qty: Number(it.dispatched_qty) || 0,
        }));
        await supabase.from('trip_stop_items').insert(rows);
      }
    }
    logAudit({ action: 'trip.create', entity: 'trips', entity_id: trip.id, after: { trip_no: trip.trip_no, stops: stops.length } });
    toast({ title: 'Trip created' });
    setShowCreate(false);
    resetCreate();
    fetchAll();
  };

  // Aggregate dispatched items across all stops
  const aggregateDispatched = (trip: any): { product: string; unit: string; qty: number }[] => {
    const map = new Map<string, { product: string; unit: string; qty: number }>();
    (trip.trip_stops || []).forEach((s: any) => {
      (s.trip_stop_items || []).forEach((it: any) => {
        const k = `${it.product}|${it.unit}`;
        const cur = map.get(k) || { product: it.product, unit: it.unit, qty: 0 };
        cur.qty += Number(it.dispatched_qty) || 0;
        map.set(k, cur);
      });
    });
    return [...map.values()];
  };

  const dispatchTrip = async (trip: any) => {
    if (trip.status !== 'draft') return;
    const missing = (trip.trip_stops || []).filter((s: any) => !(s.delivery_notes || []).length);
    if (missing.length) {
      toast({
        title: 'Add delivery notes',
        description: `Every stop needs at least one delivery note before dispatch (${missing.length} missing).`,
        variant: 'destructive',
      });
      return;
    }
    const agg = aggregateDispatched(trip);
    // Deduct factory inventory
    for (const a of agg) {
      const { data: fi } = await supabase.from('factory_inventory').select('*').eq('product', a.product).eq('unit', a.unit).maybeSingle();
      if (!fi) {
        if (!confirm(`No factory stock for ${a.product} (${a.unit}). Continue and dispatch anyway?`)) return;
        continue;
      }
      const newQty = Number((fi as any).quantity) - a.qty;
      await supabase.from('factory_inventory').update({ quantity: newQty }).eq('id', (fi as any).id);
    }
    await supabase.from('trips').update({ status: 'dispatched', dispatched_at: new Date().toISOString() }).eq('id', trip.id);
    logAudit({ action: 'trip.dispatch', entity: 'trips', entity_id: trip.id, notes: `${agg.length} skus dispatched` });
    toast({ title: 'Dispatched' });
    fetchAll();
  };

  // Confirm stop: store received_qty per item, update shop inventory for outlets
  const [confirmStop, setConfirmStop] = useState<any | null>(null);
  const [receiveValues, setReceiveValues] = useState<Record<string, string>>({});

  const openConfirmStop = (stop: any) => {
    setConfirmStop(stop);
    const v: Record<string, string> = {};
    (stop.trip_stop_items || []).forEach((it: any) => { v[it.id] = String(it.received_qty ?? it.dispatched_qty); });
    setReceiveValues(v);
  };

  const saveConfirmStop = async () => {
    if (!confirmStop) return;
    const items = confirmStop.trip_stop_items || [];
    for (const it of items) {
      const recv = Number(receiveValues[it.id]) || 0;
      const disc = recv - Number(it.dispatched_qty);
      await supabase.from('trip_stop_items').update({ received_qty: recv, discrepancy_qty: disc }).eq('id', it.id);
      // Update shop inventory for outlet
      if (confirmStop.stop_type === 'outlet' && confirmStop.shop_id && recv > 0) {
        const { data: existing } = await supabase.from('inventory').select('*')
          .eq('shop_id', confirmStop.shop_id).ilike('product', it.product).eq('unit', it.unit).maybeSingle();
        if (existing) {
          await supabase.from('inventory').update({ quantity: Number((existing as any).quantity) + recv }).eq('id', (existing as any).id);
        } else {
          await supabase.from('inventory').insert({ shop_id: confirmStop.shop_id, product: it.product, unit: it.unit, quantity: recv, threshold: 0, desired_quantity: 0 });
        }
      }
    }
    await supabase.from('trip_stops').update({
      status: 'confirmed', confirmed_at: new Date().toISOString(),
      confirmed_by: profile?.username || profile?.display_name || null,
    }).eq('id', confirmStop.id);
    const hasDisc = items.some((it: any) => (Number(receiveValues[it.id]) || 0) !== Number(it.dispatched_qty));
    logAudit({ action: 'trip_stop.confirm', entity: 'trip_stops', entity_id: confirmStop.id, shop_id: confirmStop.shop_id, notes: hasDisc ? 'with discrepancy' : 'matched' });
    toast({ title: 'Stop confirmed' });
    setConfirmStop(null);
    fetchAll();
  };

  // Returns
  const [retForm, setRetForm] = useState({ product: '', unit: 'bags', quantity: '', reason: '' });
  const addReturn = async (tripId: string) => {
    if (!retForm.product || !retForm.quantity) return toast({ title: 'Product & qty required', variant: 'destructive' });
    const { error } = await supabase.from('trip_returns').insert({
      trip_id: tripId, product: retForm.product, unit: retForm.unit, quantity: Number(retForm.quantity), reason: retForm.reason, status: 'pending',
    });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setRetForm({ product: '', unit: 'bags', quantity: '', reason: '' });
    fetchAll();
  };
  const confirmReturn = async (r: any) => {
    const { data: fi } = await supabase.from('factory_inventory').select('*').eq('product', r.product).eq('unit', r.unit).maybeSingle();
    if (fi) {
      await supabase.from('factory_inventory').update({ quantity: Number((fi as any).quantity) + Number(r.quantity) }).eq('id', (fi as any).id);
    } else {
      await supabase.from('factory_inventory').insert({ product: r.product, unit: r.unit, quantity: Number(r.quantity), threshold: 0 });
    }
    await supabase.from('trip_returns').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: profile?.username || null }).eq('id', r.id);
    logAudit({ action: 'trip_return.confirm', entity: 'trip_returns', entity_id: r.id, after: { product: r.product, unit: r.unit, quantity: r.quantity } });
    toast({ title: 'Return added back to factory stock' });
    fetchAll();
  };

  const completeTrip = async (trip: any) => {
    const allStopsOk = (trip.trip_stops || []).every((s: any) => s.status === 'confirmed');
    const allReturnsOk = (trip.trip_returns || []).every((r: any) => r.status === 'confirmed');
    if (!allStopsOk || !allReturnsOk) {
      if (!confirm('Some stops or returns are still pending. Force complete?')) return;
    }
    await supabase.from('trips').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', trip.id);
    logAudit({ action: 'trip.complete', entity: 'trips', entity_id: trip.id });
    fetchAll();
  };

  const cancelTrip = async (trip: any) => {
    if (!confirm('Cancel this trip? (Factory stock will NOT be auto-restored.)')) return;
    await supabase.from('trips').update({ status: 'cancelled' }).eq('id', trip.id);
    logAudit({ action: 'trip.cancel', entity: 'trips', entity_id: trip.id });
    fetchAll();
  };

  // PDF: trip summary + per-stop notes
  const printTrip = (trip: any) => {
    const doc = new jsPDF();
    const addHeader = (title: string) => {
      try { doc.addImage(kimpFeedsLogo as any, 'JPEG', 14, 10, 20, 20); } catch {}
      doc.setFontSize(16); doc.text('KIMP FEEDS', 40, 18);
      doc.setFontSize(11); doc.text(title, 40, 25);
      doc.setFontSize(9); doc.text(`Trip ${trip.trip_no}  •  ${trip.trip_date}`, 40, 31);
      if (trip.vehicle || trip.driver) doc.text(`Vehicle: ${trip.vehicle || '-'}    Driver: ${trip.driver || '-'}`, 40, 36);
    };

    // Summary page
    addHeader('Trip Summary');
    const stopRows = (trip.trip_stops || []).map((s: any, i: number) => {
      const totals: Record<string, number> = {};
      (s.trip_stop_items || []).forEach((it: any) => { totals[it.unit] = (totals[it.unit] || 0) + Number(it.dispatched_qty); });
      const totalsStr = Object.entries(totals).map(([u, q]) => `${q} ${u}`).join(', ');
      return [i + 1, s.stop_type, s.stop_type === 'outlet' ? (s.shop_name || s.shop_id) : s.customer_name, s.place || '-', totalsStr, s.status];
    });
    autoTable(doc, { startY: 44, head: [['#', 'Type', 'Recipient', 'Place', 'Items', 'Status']], body: stopRows });

    (trip.trip_returns || []).length && (() => {
      const y = (doc as any).lastAutoTable.finalY + 8;
      doc.text('Returns', 14, y);
      autoTable(doc, { startY: y + 2, head: [['Product', 'Unit', 'Qty', 'Reason', 'Status']], body: (trip.trip_returns || []).map((r: any) => [r.product, r.unit, r.quantity, r.reason || '-', r.status]) });
    })();

    // Per-stop pages
    (trip.trip_stops || []).forEach((s: any) => {
      doc.addPage();
      addHeader(`Delivery Note — ${s.stop_type === 'outlet' ? 'Outlet' : 'Customer'}`);
      doc.setFontSize(10);
      const who = s.stop_type === 'outlet' ? (s.shop_name || s.shop_id) : s.customer_name;
      doc.text(`Recipient: ${who}`, 14, 46);
      if (s.place) doc.text(`Place: ${s.place}`, 14, 52);
      autoTable(doc, {
        startY: 58,
        head: [['Product', 'Unit', 'Dispatched', 'Received']],
        body: (s.trip_stop_items || []).map((it: any) => [it.product, it.unit, it.dispatched_qty, it.received_qty ?? '']),
      });
      const totals: Record<string, number> = {};
      (s.trip_stop_items || []).forEach((it: any) => { totals[it.unit] = (totals[it.unit] || 0) + Number(it.dispatched_qty); });
      const summaryY = (doc as any).lastAutoTable.finalY + 6;
      doc.text('Total: ' + Object.entries(totals).map(([u, q]) => `${q} ${u}`).join(', '), 14, summaryY);
    });

    doc.save(`trip-${trip.trip_no}.pdf`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Trips (Big Deliveries)</CardTitle>
        <Button size="sm" onClick={() => { resetCreate(); setShowCreate(true); }}><Plus className="h-4 w-4 mr-1" /> New Trip</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>Returns</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trips.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.trip_no}</TableCell>
                <TableCell>{t.trip_date}</TableCell>
                <TableCell>{t.vehicle || '-'}</TableCell>
                <TableCell>{(t.trip_stops || []).length}</TableCell>
                <TableCell>{(t.trip_returns || []).length}</TableCell>
                <TableCell><Badge className={STATUS[t.status]?.cls}>{STATUS[t.status]?.label || t.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => printTrip(t)} title="Print Trip + Delivery Notes"><Printer className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setOpenTrip(t)} title="View"><FileText className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {trips.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No trips yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Create trip */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Trip</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Trip #</Label><Input value={tripNo} onChange={e => setTripNo(e.target.value)} /></div>
              <div><Label>Date</Label><Input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} /></div>
              <div><Label>Vehicle</Label><Input value={vehicle} onChange={e => setVehicle(e.target.value)} /></div>
              <div><Label>Driver</Label><Input value={driver} onChange={e => setDriver(e.target.value)} /></div>
            </div>
            <div><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => addStop('outlet')}><Plus className="h-3 w-3 mr-1" /> Outlet Stop</Button>
              <Button size="sm" variant="outline" onClick={() => addStop('customer')}><Plus className="h-3 w-3 mr-1" /> Customer Stop</Button>
            </div>

            {stops.map((s, i) => (
              <Card key={i} className="p-3">
                <div className="flex justify-between items-center mb-2">
                  <Badge>{s.stop_type === 'outlet' ? 'Outlet' : 'Customer'} stop #{i + 1}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => removeStop(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                  {s.stop_type === 'outlet' ? (
                    <div>
                      <Label>Shop</Label>
                      <Select value={s.shop_id} onValueChange={v => updateStop(i, { shop_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {shops.map(sh => <SelectItem key={sh.shop_id} value={sh.shop_id}>{sh.shop_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <>
                      <div><Label>Customer name</Label><Input value={s.customer_name} onChange={e => updateStop(i, { customer_name: e.target.value })} /></div>
                      <div>
                        <Label>Bill to shop (optional)</Label>
                        <Select value={s.shop_id || 'none'} onValueChange={v => updateStop(i, { shop_id: v === 'none' ? '' : v })}>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {shops.map(sh => <SelectItem key={sh.shop_id} value={sh.shop_id}>{sh.shop_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <div><Label>Place</Label><Input value={s.place} onChange={e => updateStop(i, { place: e.target.value })} /></div>
                </div>
                {s.items.map((it, j) => (
                  <div key={j} className="flex gap-2 items-end mb-1">
                    <div className="flex-1"><Label>Product</Label><Input list={`prod-${i}-${j}`} value={it.product} onChange={e => updateStopItem(i, j, { product: e.target.value })} /><datalist id={`prod-${i}-${j}`}>{products.map(p => <option key={p} value={p} />)}</datalist></div>
                    <div className="w-28"><Label>Unit</Label>
                      <Select value={it.unit} onValueChange={v => updateStopItem(i, j, { unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="w-24"><Label>Qty</Label><Input type="number" value={it.dispatched_qty} onChange={e => updateStopItem(i, j, { dispatched_qty: e.target.value })} /></div>
                    <Button variant="ghost" size="icon" onClick={() => removeStopItem(i, j)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => addStopItem(i)}><Plus className="h-3 w-3 mr-1" /> Item</Button>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createTrip}>Create as Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip detail */}
      <Dialog open={!!openTrip} onOpenChange={(o) => !o && setOpenTrip(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {openTrip && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>Trip {openTrip.trip_no} <Badge className={`ml-2 ${STATUS[openTrip.status]?.cls}`}>{STATUS[openTrip.status]?.label}</Badge></span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => printTrip(openTrip)}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                    {openTrip.status === 'draft' && <Button size="sm" onClick={() => dispatchTrip(openTrip)}><Send className="h-4 w-4 mr-1" /> Dispatch</Button>}
                    {openTrip.status === 'dispatched' && <Button size="sm" onClick={() => completeTrip(openTrip)}><CheckCircle2 className="h-4 w-4 mr-1" /> Complete</Button>}
                    {openTrip.status !== 'completed' && openTrip.status !== 'cancelled' && <Button variant="destructive" size="sm" onClick={() => cancelTrip(openTrip)}>Cancel</Button>}
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {openTrip.trip_date} • Vehicle: {openTrip.vehicle || '-'} • Driver: {openTrip.driver || '-'}
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Stops</h3>
                  {(openTrip.trip_stops || []).map((s: any) => (
                    <Card key={s.id} className="p-3 mb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{s.stop_type === 'outlet' ? `🏪 ${s.shop_name || s.shop_id}` : `👤 ${s.customer_name}`} <Badge variant="outline" className="ml-2">{s.status}</Badge></div>
                          {s.place && <div className="text-xs text-muted-foreground">{s.place}</div>}
                        </div>
                        {s.status === 'pending' && openTrip.status === 'dispatched' && (
                          <Button size="sm" onClick={() => openConfirmStop(s)}><CheckCircle2 className="h-4 w-4 mr-1" /> Confirm</Button>
                        )}
                      </div>
                      <Table>
                        <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Dispatched</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Δ</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(s.trip_stop_items || []).map((it: any) => (
                            <TableRow key={it.id}>
                              <TableCell>{it.product}</TableCell>
                              <TableCell>{it.unit}</TableCell>
                              <TableCell className="text-right">{it.dispatched_qty}</TableCell>
                              <TableCell className="text-right">{it.received_qty ?? '-'}</TableCell>
                              <TableCell className={`text-right ${(it.discrepancy_qty || 0) < 0 ? 'text-destructive' : ''}`}>{it.discrepancy_qty ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  ))}
                </div>

                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Returns to factory</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Unit</TableHead><TableHead>Qty</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(openTrip.trip_returns || []).map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.product}</TableCell>
                          <TableCell>{r.unit}</TableCell>
                          <TableCell>{r.quantity}</TableCell>
                          <TableCell>{r.reason || '-'}</TableCell>
                          <TableCell><Badge variant={r.status === 'confirmed' ? 'default' : 'secondary'}>{r.status}</Badge></TableCell>
                          <TableCell>{r.status === 'pending' && <Button size="sm" onClick={() => confirmReturn(r)}>Confirm</Button>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {openTrip.status !== 'completed' && openTrip.status !== 'cancelled' && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2 items-end">
                      <div><Label>Product</Label><Input list="ret-prod" value={retForm.product} onChange={e => setRetForm({ ...retForm, product: e.target.value })} /><datalist id="ret-prod">{products.map(p => <option key={p} value={p} />)}</datalist></div>
                      <div><Label>Unit</Label>
                        <Select value={retForm.unit} onValueChange={v => setRetForm({ ...retForm, unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Qty</Label><Input type="number" value={retForm.quantity} onChange={e => setRetForm({ ...retForm, quantity: e.target.value })} /></div>
                      <div><Label>Reason</Label><Input value={retForm.reason} onChange={e => setRetForm({ ...retForm, reason: e.target.value })} /></div>
                      <Button onClick={() => addReturn(openTrip.id)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm stop dialog */}
      <Dialog open={!!confirmStop} onOpenChange={(o) => !o && setConfirmStop(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm received quantities</DialogTitle></DialogHeader>
          {confirmStop && (
            <div className="space-y-2">
              {(confirmStop.trip_stop_items || []).map((it: any) => (
                <div key={it.id} className="grid grid-cols-3 gap-2 items-center">
                  <div className="text-sm"><div className="font-medium">{it.product}</div><div className="text-xs text-muted-foreground">{it.unit}</div></div>
                  <div className="text-sm text-muted-foreground">Dispatched: {it.dispatched_qty}</div>
                  <Input type="number" value={receiveValues[it.id] ?? ''} onChange={e => setReceiveValues({ ...receiveValues, [it.id]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStop(null)}>Cancel</Button>
            <Button onClick={saveConfirmStop}>Save & Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TripManager;