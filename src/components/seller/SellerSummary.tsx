import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent, toKg, formatBags, formatTonnes } from '@/lib/units';
import { Package, DollarSign, Wallet, Users, AlertTriangle, Truck } from 'lucide-react';

interface Props { shopId: string }

const SellerSummary: React.FC<Props> = ({ shopId }) => {
  const [d, setD] = useState<any>({ loading: true });

  useEffect(() => { if (shopId) load(); }, [shopId]);

  const load = async () => {
    setD({ loading: true });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    const fetchKpis = async (startStr: string) => {
      const { data: tx } = await supabase.from('sales_transactions').select('*').eq('shop_id', shopId).gte('sale_date', startStr);
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
      const { data: dp } = await supabase.from('debt_payments').select('amount').eq('shop_id', shopId).gte('payment_date', startStr);
      const debtPaid = (dp || []).reduce((s, x: any) => s + Number(x.amount || 0), 0);
      return { bags, kg, collected, credit, debtPaid, txCount: (tx || []).length };
    };

    const todayK = await fetchKpis(todayStr);
    const monthK = await fetchKpis(monthStart);

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

    setD({ loading: false, today: todayK, month: monthK, lowStock, pendingOutlet, customerToBill });
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
      <h2 className="text-lg font-semibold">Today</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Bags sold" value={formatBags(d.today.bags)} icon={Package} />
        <Kpi title="Tonnage" value={formatTonnes(d.today.kg)} icon={Package} />
        <Kpi title="Cash collected" value={`KES ${Math.round(d.today.collected).toLocaleString()}`} icon={Wallet} />
        <Kpi title="Credit taken" value={`KES ${Math.round(d.today.credit).toLocaleString()}`} icon={DollarSign} />
      </div>
      <h2 className="text-lg font-semibold mt-2">This month</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Bags sold" value={formatBags(d.month.bags)} icon={Package} />
        <Kpi title="Tonnage" value={formatTonnes(d.month.kg)} icon={Package} />
        <Kpi title="Revenue collected" value={`KES ${Math.round(d.month.collected).toLocaleString()}`} icon={Wallet} />
        <Kpi title="Debt paid" value={`KES ${Math.round(d.month.debtPaid).toLocaleString()}`} icon={Wallet} />
      </div>
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
    </div>
  );
};

export default SellerSummary;