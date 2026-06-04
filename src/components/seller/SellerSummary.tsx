import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent, toKg, formatBags, formatTonnes } from '@/lib/units';
import { Package, DollarSign, Wallet, Users, AlertTriangle, Truck } from 'lucide-react';
import PeriodPicker, { buildPreset, type Period } from '@/components/PeriodPicker';
import DebtorsList from '@/components/money/DebtorsList';

interface Props { shopId: string }

const SellerSummary: React.FC<Props> = ({ shopId }) => {
  const [d, setD] = useState<any>({ loading: true });
  const [period, setPeriod] = useState<Period>(() => buildPreset('month'));
  const [showDebtors, setShowDebtors] = useState(false);

  useEffect(() => { if (shopId) load(); /* eslint-disable-next-line */ }, [shopId, period]);

  const load = async () => {
    setD({ loading: true });
    const startStr = period.start.toISOString().split('T')[0];
    const endStr = period.end.toISOString().split('T')[0];

    const fetchKpis = async () => {
      const { data: tx } = await supabase.from('sales_transactions').select('*').eq('shop_id', shopId).gte('sale_date', startStr).lte('sale_date', endStr);
      const ids = (tx || []).map((t: any) => t.id);
      let items: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: it } = await supabase.from('sales_items').select('*').in('transaction_id', ids.slice(i, i + 200));
        items = items.concat(it || []);
      }
      const bags = items.reduce((s, it) => s + toBagEquivalent(Number(it.quantity), it.unit), 0);
      const kg = items.reduce((s, it) => s + toKg(Number(it.quantity), it.unit), 0);
      const collected = (tx || []).reduce((s, t: any) => s + Number(t.amount_paid || 0), 0);
      const credit = (tx || []).filter((t: any) => t.is_credit).reduce((s, t: any) => s + (Number(t.total_amount) - Number(t.amount_paid)), 0);
      const { data: dp } = await supabase.from('debt_payments').select('amount').eq('shop_id', shopId).gte('payment_date', startStr).lte('payment_date', endStr);
      const debtPaid = (dp || []).reduce((s, x: any) => s + Number(x.amount || 0), 0);
      // bags per product
      const m = new Map<string, number>();
      items.forEach((it: any) => {
        m.set(it.product, (m.get(it.product) || 0) + toBagEquivalent(Number(it.quantity), it.unit));
      });
      const bagsByProduct = Array.from(m.entries()).map(([product, bags]) => ({ product, bags })).sort((a, b) => b.bags - a.bags);
      return { bags, kg, collected, credit, debtPaid, txCount: (tx || []).length, bagsByProduct };
    };

    const kpis = await fetchKpis();

    // Outstanding debt as of today (period-independent)
    const { data: allCredit } = await supabase
      .from('sales_transactions').select('id, customer_name, total_amount, amount_paid')
      .eq('shop_id', shopId).eq('is_credit', true);
    const creditIds = (allCredit || []).map((c: any) => c.id);
    let extraPays: any[] = [];
    for (let i = 0; i < creditIds.length; i += 200) {
      const { data: p } = await supabase.from('debt_payments').select('sale_transaction_id, amount').in('sale_transaction_id', creditIds.slice(i, i + 200));
      extraPays = extraPays.concat(p || []);
    }
    const payByTx: Record<string, number> = {};
    extraPays.forEach((p: any) => { payByTx[p.sale_transaction_id] = (payByTx[p.sale_transaction_id] || 0) + Number(p.amount || 0); });
    let outstandingTotal = 0;
    const debtorSet = new Set<string>();
    (allCredit || []).forEach((c: any) => {
      const bal = Number(c.total_amount || 0) - Number(c.amount_paid || 0) - (payByTx[c.id] || 0);
      if (bal > 0.01) { outstandingTotal += bal; debtorSet.add(((c.customer_name || '') as string).toLowerCase()); }
    });

    const { data: inv } = await supabase.from('inventory').select('*').eq('shop_id', shopId);
    const lowStock = (inv || []).filter((i: any) => Number(i.quantity) <= Number(i.threshold));

    // Pending outlet stops for this shop
    const { data: trips } = await supabase.from('trips').select('id').eq('status', 'dispatched');
    const tripIds = (trips || []).map((t: any) => t.id);
    let pendingOutlet: any[] = [];
    let customerToBill: any[] = [];
    if (tripIds.length) {
      const { data: stops } = await supabase
        .from('trip_stops')
        .select('*, trip_stop_items(*), trips(trip_no, trip_date)')
        .in('trip_id', tripIds)
        .eq('shop_id', shopId);
      pendingOutlet = (stops || []).filter((s: any) => s.stop_type === 'outlet' && s.status === 'pending');
      customerToBill = (stops || []).filter((s: any) => s.stop_type === 'customer' && !s.billed_sale_id);
    }

    setD({ loading: false, kpis, lowStock, pendingOutlet, customerToBill, outstandingTotal, debtorCount: debtorSet.size });
  };

  if (d.loading) return <Card><CardContent className="p-6 text-muted-foreground">Loading…</CardContent></Card>;

  const Kpi: React.FC<{ title: string; value: string; icon: any }> = ({ title, value, icon: Icon }) => (
    <Card><CardContent className="p-4 flex justify-between items-start">
      <div><div className="text-xs text-muted-foreground">{title}</div><div className="text-2xl font-bold">{value}</div></div>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-3"><PeriodPicker value={period} onChange={setPeriod} /></CardContent></Card>
      <h2 className="text-lg font-semibold">{period.label}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Bags sold" value={formatBags(d.kpis.bags)} icon={Package} />
        <Kpi title="Tonnage" value={formatTonnes(d.kpis.kg)} icon={Package} />
        <Kpi title="Cash collected" value={`KES ${Math.round(d.kpis.collected).toLocaleString()}`} icon={Wallet} />
        <Kpi title="Credit taken" value={`KES ${Math.round(d.kpis.credit).toLocaleString()}`} icon={DollarSign} />
        <Kpi title="Debt paid" value={`KES ${Math.round(d.kpis.debtPaid).toLocaleString()}`} icon={Wallet} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setShowDebtors(true)}>
          <CardContent className="p-4 flex justify-between items-start">
            <div>
              <div className="text-xs text-muted-foreground">Outstanding debt (today)</div>
              <div className="text-2xl font-bold text-destructive">KES {Math.round(d.outstandingTotal || 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Tap to view debtors</div>
            </div>
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setShowDebtors(true)}>
          <CardContent className="p-4 flex justify-between items-start">
            <div>
              <div className="text-xs text-muted-foreground">Debtors</div>
              <div className="text-2xl font-bold">{d.debtorCount || 0}</div>
              <div className="text-xs text-muted-foreground">Customers owing now</div>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Bags sold per product — {period.label}</CardTitle></CardHeader>
        <CardContent>
          {(!d.kpis.bagsByProduct || d.kpis.bagsByProduct.length === 0) ? (
            <p className="text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Bags (70kg eq)</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.kpis.bagsByProduct.map((r: any) => (
                  <TableRow key={r.product}><TableCell className="font-medium">{r.product}</TableCell><TableCell className="text-right">{formatBags(r.bags)}</TableCell></TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold"><TableCell>Total</TableCell><TableCell className="text-right">{formatBags(d.kpis.bags)}</TableCell></TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Deliveries to confirm</CardTitle></CardHeader>
          <CardContent>
            {d.pendingOutlet.length === 0 ? <p className="text-sm text-muted-foreground">None pending.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Trip</TableHead><TableHead>Date</TableHead><TableHead>Items</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.pendingOutlet.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.trips?.trip_no}</TableCell>
                      <TableCell>{s.trips?.trip_date}</TableCell>
                      <TableCell>{(s.trip_stop_items || []).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Customer deliveries to bill</CardTitle></CardHeader>
          <CardContent>
            {d.customerToBill.length === 0 ? <p className="text-sm text-muted-foreground">None waiting.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Place</TableHead><TableHead>Trip</TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.customerToBill.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.customer_name}</TableCell>
                      <TableCell>{s.place || '-'}</TableCell>
                      <TableCell>{s.trips?.trip_no}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {d.lowStock.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base text-destructive"><AlertTriangle className="h-4 w-4" /> Low stock ({d.lowStock.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {d.lowStock.map((i: any) => <Badge key={i.id} variant="destructive">{i.product} • {i.quantity} {i.unit}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={showDebtors} onOpenChange={setShowDebtors}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Debtors</DialogTitle></DialogHeader>
          <DebtorsList shopId={shopId} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerSummary;