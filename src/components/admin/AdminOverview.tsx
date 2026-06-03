import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent, toKg, formatBags, formatTonnes } from '@/lib/units';
import { Package, DollarSign, Wallet, TrendingUp, Users, AlertTriangle, Truck } from 'lucide-react';
import PurchasingPower from '@/components/analytics/PurchasingPower';
import WeeklyPurchasing from '@/components/analytics/WeeklyPurchasing';
import PeriodPicker, { buildPreset, type Period } from '@/components/PeriodPicker';

interface Props {
  selectedShop: string; // 'all' or shop_id
}
interface PropsExt extends Props { shops?: { shop_id: string; shop_name: string }[] }

const AdminOverview: React.FC<PropsExt> = ({ selectedShop, shops = [] }) => {
  const [period, setPeriod] = useState<Period>(() => buildPreset('month'));
  const [data, setData] = useState<any>({ loading: true });

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedShop, period]);

  const load = async () => {
    setData({ loading: true });
    const startStr = period.start.toISOString().split('T')[0];
    const endStr = period.end.toISOString().split('T')[0];

    // Transactions
    let txQ = supabase.from('sales_transactions').select('*').gte('sale_date', startStr).lte('sale_date', endStr);
    if (selectedShop !== 'all') txQ = txQ.eq('shop_id', selectedShop);
    const { data: tx } = await txQ;
    const txIds = (tx || []).map((t: any) => t.id);

    let items: any[] = [];
    const chunk = 200;
    for (let i = 0; i < txIds.length; i += chunk) {
      const { data: it } = await supabase.from('sales_items').select('*').in('transaction_id', txIds.slice(i, i + chunk));
      items = items.concat(it || []);
    }

    const totalBags = items.reduce((s, it) => s + toBagEquivalent(Number(it.quantity), it.unit), 0);
    const totalKg = items.reduce((s, it) => s + toKg(Number(it.quantity), it.unit), 0);
    const revenue = (tx || []).reduce((s, t: any) => s + Number(t.total_amount || 0), 0);
    const collected = (tx || []).reduce((s, t: any) => s + Number(t.amount_paid || 0), 0);
    const credit = (tx || []).filter((t: any) => t.is_credit).reduce((s, t: any) => s + (Number(t.total_amount) - Number(t.amount_paid)), 0);

    let dpQ = supabase.from('debt_payments').select('*').gte('payment_date', startStr).lte('payment_date', endStr);
    if (selectedShop !== 'all') dpQ = dpQ.eq('shop_id', selectedShop);
    const { data: dp } = await dpQ;
    const debtPaid = (dp || []).reduce((s, d: any) => s + Number(d.amount || 0), 0);

    // Customers
    let custQ = supabase.from('customers').select('*');
    if (selectedShop !== 'all') custQ = custQ.eq('shop_id', selectedShop);
    const { data: customers } = await custQ;
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const newCust = (customers || []).filter((c: any) => c.first_purchase_date && new Date(c.first_purchase_date) >= thirtyAgo).length;
    const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
    const activeCust = (customers || []).filter((c: any) => c.last_purchase_date && new Date(c.last_purchase_date) >= ninetyAgo).length;

    // Low stock
    let invQ = supabase.from('inventory').select('*');
    if (selectedShop !== 'all') invQ = invQ.eq('shop_id', selectedShop);
    const { data: inv } = await invQ;
    const lowStock = (inv || []).filter((i: any) => Number(i.quantity) <= Number(i.threshold)).length;

    // Trip metrics: pending outlet stops for this shop
    let stopsPending = 0, returnsPending = 0;
    const { data: trips } = await supabase.from('trips').select('id, status').eq('status', 'dispatched');
    const tripIds = (trips || []).map((t: any) => t.id);
    if (tripIds.length) {
      let stopsQ = supabase.from('trip_stops').select('id, status, shop_id, stop_type').in('trip_id', tripIds).eq('status', 'pending');
      if (selectedShop !== 'all') stopsQ = stopsQ.eq('shop_id', selectedShop);
      const { data: pendStops } = await stopsQ;
      stopsPending = (pendStops || []).length;
      const { data: pendRets } = await supabase.from('trip_returns').select('id').in('trip_id', tripIds).eq('status', 'pending');
      returnsPending = (pendRets || []).length;
    }

    setData({
      loading: false, totalBags, totalKg, revenue, collected, credit, debtPaid,
      newCust, activeCust, lowStock, stopsPending, returnsPending,
      txCount: (tx || []).length,
    });
  };

  const Kpi: React.FC<{ title: string; value: string; icon: any; sub?: string; tone?: string }> = ({ title, value, icon: Icon, sub, tone }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className={`text-2xl font-bold ${tone || ''}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );

  if (data.loading) return <Card><CardContent className="p-6 text-muted-foreground">Loading…</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-3"><PeriodPicker value={period} onChange={setPeriod} /></CardContent></Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Bags (70kg eq)" value={formatBags(data.totalBags)} icon={Package} sub={`${data.txCount} sales`} />
        <Kpi title="Tonnage" value={formatTonnes(data.totalKg)} icon={Package} />
        <Kpi title="Revenue" value={`KES ${Math.round(data.revenue).toLocaleString()}`} icon={DollarSign} />
        <Kpi title="Cash collected" value={`KES ${Math.round(data.collected).toLocaleString()}`} icon={Wallet} />
        <Kpi title="Credit issued" value={`KES ${Math.round(data.credit).toLocaleString()}`} icon={TrendingUp} tone="text-orange-600" />
        <Kpi title="Debt paid" value={`KES ${Math.round(data.debtPaid).toLocaleString()}`} icon={Wallet} tone="text-green-600" />
        <Kpi title="New customers (30d)" value={String(data.newCust)} icon={Users} />
        <Kpi title="Active customers (90d)" value={String(data.activeCust)} icon={Users} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><div className="text-xs text-muted-foreground">Low stock items</div><div className="text-2xl font-bold">{data.lowStock}</div></div>
          <AlertTriangle className={`h-5 w-5 ${data.lowStock > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><div className="text-xs text-muted-foreground">Pending outlet deliveries</div><div className="text-2xl font-bold">{data.stopsPending}</div></div>
          <Truck className="h-5 w-5 text-muted-foreground" />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><div className="text-xs text-muted-foreground">Pending returns</div><div className="text-2xl font-bold">{data.returnsPending}</div></div>
          <Truck className="h-5 w-5 text-muted-foreground" />
        </CardContent></Card>
      </div>
      <PurchasingPower shops={shops} shopFilter={selectedShop} hideShopSelect />
      <WeeklyPurchasing shops={shops} shopFilter={selectedShop} hideShopSelect />
    </div>
  );
};

export default AdminOverview;