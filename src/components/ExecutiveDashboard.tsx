import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, BrainCircuit, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { toBagEquivalent, formatBags } from '@/lib/units';
import DebtorsList from './money/DebtorsList';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';

const fmtKes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const fmtInt = (n: number) => Math.round(Number(n || 0)).toLocaleString();

interface Shop { shop_id: string; shop_name: string }
interface Period { start: Date; end: Date; label: string }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const dateStr = (d: Date) => d.toISOString().split('T')[0];

/** Default: 1st of this month → today, prior = 1st of last month → same day of last month (clamped). */
const defaultCurrent = (): Period => {
  const now = new Date();
  return { start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), end: endOfDay(now), label: 'This month to date' };
};
const priorFor = (cur: Period): Period => {
  const s = cur.start; const e = cur.end;
  // If cur starts on the 1st, use prior calendar month clamped to end-day.
  if (s.getDate() === 1) {
    const priorStart = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    const daysInPrior = new Date(s.getFullYear(), s.getMonth(), 0).getDate();
    const dayCap = Math.min(e.getDate(), daysInPrior);
    const priorEnd = endOfDay(new Date(priorStart.getFullYear(), priorStart.getMonth(), dayCap));
    return { start: priorStart, end: priorEnd, label: 'Same window last month' };
  }
  // Fallback: shift by same-length window immediately before.
  const lenMs = e.getTime() - s.getTime();
  const priorEnd = endOfDay(new Date(s.getTime() - 1));
  const priorStart = startOfDay(new Date(priorEnd.getTime() - lenMs));
  return { start: priorStart, end: priorEnd, label: 'Previous window' };
};

const pct = (cur: number, prior: number): number | null => {
  if (!prior) return cur > 0 ? 100 : null;
  return ((cur - prior) / Math.abs(prior)) * 100;
};

const DeltaChip: React.FC<{ cur: number; prior: number; invert?: boolean }> = ({ cur, prior, invert }) => {
  const p = pct(cur, prior);
  if (p === null) return <span className="text-xs text-muted-foreground">—</span>;
  const rounded = Math.round(p);
  const rawGood = rounded >= 0;
  const good = invert ? !rawGood : rawGood;
  const Icon = rounded === 0 ? Minus : (rawGood ? TrendingUp : TrendingDown);
  const color = rounded === 0 ? 'text-muted-foreground' : (good ? 'text-green-600' : 'text-destructive');
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />{rounded > 0 ? '+' : ''}{rounded}%
    </span>
  );
};

const KpiCard: React.FC<{ title: string; cur: number; prior: number; format: (n: number) => string; invert?: boolean }> = ({ title, cur, prior, format, invert }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold tabular-nums">{format(cur)}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted-foreground">Prior: {format(prior)}</span>
        <DeltaChip cur={cur} prior={prior} invert={invert} />
      </div>
    </CardContent>
  </Card>
);

// --- Data aggregation helpers ---

async function fetchTxAndItems(startStr: string, endStr: string) {
  const { data: tx } = await supabase.from('sales_transactions').select('*').gte('sale_date', startStr).lte('sale_date', endStr);
  const ids = (tx || []).map((t: any) => t.id);
  let items: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('sales_items').select('*').in('transaction_id', ids.slice(i, i + 200));
    items = items.concat(data || []);
  }
  return { tx: tx || [], items };
}

async function fetchDebtPayments(startStr: string, endStr: string) {
  const { data } = await supabase.from('debt_payments').select('*').gte('payment_date', startStr).lte('payment_date', endStr);
  return data || [];
}

const summarize = (tx: any[], items: any[], dp: any[]) => {
  const txById = new Map(tx.map((t: any) => [t.id, t]));
  const revenue = tx.reduce((s, t) => s + Number(t.total_amount || 0), 0);
  const cash = tx.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
  const credit = tx.filter((t) => t.is_credit).reduce((s, t) => s + (Number(t.total_amount) - Number(t.amount_paid)), 0);
  const debtPaid = dp.reduce((s, d) => s + Number(d.amount || 0), 0);
  const bags = items.reduce((s, it) => s + toBagEquivalent(Number(it.quantity), it.unit), 0);
  return { revenue, cash, credit, debtPaid, moneyIn: cash + debtPaid, bags, txById };
};

// --- Component ---

const ExecutiveDashboard: React.FC = () => {
  const { profile, logout } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [productCat, setProductCat] = useState<Record<string, string>>({}); // product -> categoryId
  const [current, setCurrent] = useState<Period>(defaultCurrent());
  const [chartShop, setChartShop] = useState<string>('all');
  const [chartCat, setChartCat] = useState<string>('all');
  const [customStart, setCustomStart] = useState<string>(dateStr(current.start));
  const [customEnd, setCustomEnd] = useState<string>(dateStr(current.end));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [showDebtors, setShowDebtors] = useState(false);

  const prior = useMemo(() => priorFor(current), [current]);

  // Load shops + categories once
  useEffect(() => {
    (async () => {
      const { data: sp } = await supabase.from('profiles').select('shop_id, shop_name').eq('role', 'seller').not('shop_id', 'is', null);
      const uniq = new Map<string, string>();
      (sp || []).forEach((p: any) => { if (p.shop_id) uniq.set(p.shop_id, p.shop_name || p.shop_id); });
      setShops([...uniq.entries()].map(([shop_id, shop_name]) => ({ shop_id, shop_name })));

      const { data: cats } = await supabase.from('product_categories').select('id, name').order('name');
      setCategories(cats || []);
      const { data: pcis } = await supabase.from('product_category_items').select('product_name, category_id');
      const map: Record<string, string> = {};
      (pcis || []).forEach((r: any) => { map[r.product_name] = r.category_id; });
      setProductCat(map);
    })();
  }, []);

  // Load current + prior summaries in parallel
  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, [current]);

  const loadAll = async () => {
    setLoading(true);
    const cs = dateStr(current.start), ce = dateStr(current.end);
    const ps = dateStr(prior.start), pe = dateStr(prior.end);
    const [curTxIt, priorTxIt, curDp, priorDp, allCredit, cust] = await Promise.all([
      fetchTxAndItems(cs, ce),
      fetchTxAndItems(ps, pe),
      fetchDebtPayments(cs, ce),
      fetchDebtPayments(ps, pe),
      supabase.from('sales_transactions').select('id, customer_name, total_amount, amount_paid, sale_date, due_date, shop_id').eq('is_credit', true),
      supabase.from('customers').select('*'),
    ]);
    // Outstanding debt (as of today)
    const creditRows = (allCredit.data || []) as any[];
    const creditIds = creditRows.map((c) => c.id);
    let payRows: any[] = [];
    for (let i = 0; i < creditIds.length; i += 200) {
      const { data } = await supabase.from('debt_payments').select('sale_transaction_id, amount').in('sale_transaction_id', creditIds.slice(i, i + 200));
      payRows = payRows.concat(data || []);
    }
    const payByTx: Record<string, number> = {};
    payRows.forEach((p: any) => { payByTx[p.sale_transaction_id] = (payByTx[p.sale_transaction_id] || 0) + Number(p.amount || 0); });
    let outstanding = 0;
    const debtorSet = new Set<string>();
    const aging = { d30: 0, d60: 0, d90: 0, d90p: 0 };
    const debtorTotals: Record<string, number> = {};
    creditRows.forEach((c) => {
      const bal = Number(c.total_amount || 0) - Number(c.amount_paid || 0) - (payByTx[c.id] || 0);
      if (bal > 0.01) {
        outstanding += bal;
        const name = (c.customer_name || '').trim();
        debtorSet.add(name.toLowerCase());
        debtorTotals[name] = (debtorTotals[name] || 0) + bal;
        const ref = c.due_date ? new Date(c.due_date) : new Date(c.sale_date);
        const days = Math.floor((Date.now() - ref.getTime()) / 86400000);
        if (days <= 30) aging.d30 += bal;
        else if (days <= 60) aging.d60 += bal;
        else if (days <= 90) aging.d90 += bal;
        else aging.d90p += bal;
      }
    });
    const topDebtors = Object.entries(debtorTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Customers
    const custRows = (cust.data || []) as any[];
    const now = new Date();
    const thirty = new Date(now); thirty.setDate(thirty.getDate() - 30);
    const ninety = new Date(now); ninety.setDate(ninety.getDate() - 90);
    const thirtyPrior = new Date(prior.end); thirtyPrior.setDate(thirtyPrior.getDate() - 30);
    const ninetyPrior = new Date(prior.end); ninetyPrior.setDate(ninetyPrior.getDate() - 90);
    const newCustCur = custRows.filter((c) => c.first_purchase_date && new Date(c.first_purchase_date) >= thirty).length;
    const newCustPrior = custRows.filter((c) => c.first_purchase_date && new Date(c.first_purchase_date) >= thirtyPrior && new Date(c.first_purchase_date) <= prior.end).length;
    const activeCur = custRows.filter((c) => c.last_purchase_date && new Date(c.last_purchase_date) >= ninety).length;
    const activePrior = custRows.filter((c) => c.last_purchase_date && new Date(c.last_purchase_date) >= ninetyPrior && new Date(c.last_purchase_date) <= prior.end).length;

    // Summaries
    const cur = summarize(curTxIt.tx, curTxIt.items, curDp);
    const pri = summarize(priorTxIt.tx, priorTxIt.items, priorDp);

    // Outlet pivot
    const shopMap = new Map<string, { bags: number; revenue: number; moneyIn: number; credit: number }>();
    const shopMapPrior = new Map<string, { bags: number; revenue: number; moneyIn: number; credit: number }>();
    const emptyRow = () => ({ bags: 0, revenue: 0, moneyIn: 0, credit: 0 });
    curTxIt.tx.forEach((t: any) => {
      const r = shopMap.get(t.shop_id) || emptyRow();
      r.revenue += Number(t.total_amount || 0);
      r.moneyIn += Number(t.amount_paid || 0);
      if (t.is_credit) r.credit += Number(t.total_amount || 0) - Number(t.amount_paid || 0);
      shopMap.set(t.shop_id, r);
    });
    curTxIt.items.forEach((it: any) => {
      const t = cur.txById.get(it.transaction_id);
      if (!t) return;
      const r = shopMap.get(t.shop_id) || emptyRow();
      r.bags += toBagEquivalent(Number(it.quantity), it.unit);
      shopMap.set(t.shop_id, r);
    });
    curDp.forEach((d: any) => {
      const r = shopMap.get(d.shop_id) || emptyRow();
      r.moneyIn += Number(d.amount || 0);
      shopMap.set(d.shop_id, r);
    });
    priorTxIt.tx.forEach((t: any) => {
      const r = shopMapPrior.get(t.shop_id) || emptyRow();
      r.revenue += Number(t.total_amount || 0);
      r.moneyIn += Number(t.amount_paid || 0);
      if (t.is_credit) r.credit += Number(t.total_amount || 0) - Number(t.amount_paid || 0);
      shopMapPrior.set(t.shop_id, r);
    });
    priorTxIt.items.forEach((it: any) => {
      const t = pri.txById.get(it.transaction_id);
      if (!t) return;
      const r = shopMapPrior.get(t.shop_id) || emptyRow();
      r.bags += toBagEquivalent(Number(it.quantity), it.unit);
      shopMapPrior.set(t.shop_id, r);
    });
    priorDp.forEach((d: any) => {
      const r = shopMapPrior.get(d.shop_id) || emptyRow();
      r.moneyIn += Number(d.amount || 0);
      shopMapPrior.set(d.shop_id, r);
    });

    // Product pivot
    const prodMap = new Map<string, { bags: number; revenue: number }>();
    const prodMapPrior = new Map<string, { bags: number; revenue: number }>();
    curTxIt.items.forEach((it: any) => {
      const r = prodMap.get(it.product) || { bags: 0, revenue: 0 };
      r.bags += toBagEquivalent(Number(it.quantity), it.unit);
      r.revenue += Number(it.line_total || 0);
      prodMap.set(it.product, r);
    });
    priorTxIt.items.forEach((it: any) => {
      const r = prodMapPrior.get(it.product) || { bags: 0, revenue: 0 };
      r.bags += toBagEquivalent(Number(it.quantity), it.unit);
      r.revenue += Number(it.line_total || 0);
      prodMapPrior.set(it.product, r);
    });

    // Top customers this period
    const custMap: Record<string, number> = {};
    const custMapPrior: Record<string, number> = {};
    curTxIt.tx.forEach((t: any) => { const n = (t.customer_name || '').trim() || 'Unknown'; custMap[n] = (custMap[n] || 0) + Number(t.total_amount || 0); });
    priorTxIt.tx.forEach((t: any) => { const n = (t.customer_name || '').trim() || 'Unknown'; custMapPrior[n] = (custMapPrior[n] || 0) + Number(t.total_amount || 0); });
    const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, revenue]) => ({ name, revenue, priorRevenue: custMapPrior[name] || 0 }));

    setData({
      cur, pri, outstanding, debtorCount: debtorSet.size, aging, topDebtors,
      newCustCur, newCustPrior, activeCur, activePrior,
      shopMap, shopMapPrior, prodMap, prodMapPrior, topCustomers,
    });
    setLoading(false);
  };

  // Monthly chart data (last 12 months)
  useEffect(() => { void loadMonthly(); /* eslint-disable-next-line */ }, []);

  const loadMonthly = async () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const { tx, items } = await fetchTxAndItems(dateStr(start), dateStr(end));
    const txById = new Map(tx.map((t: any) => [t.id, t]));
    const months: string[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 12; i++) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    (window as any).__execMonthlyItems = { items, txById, months };
    rebuildMonthly({ items, txById, months });
  };

  const rebuildMonthly = (src?: { items: any[]; txById: Map<string, any>; months: string[] }) => {
    const cache = src || (window as any).__execMonthlyItems;
    if (!cache) return;
    const { items, txById, months } = cache;
    const buckets: Record<string, number> = {};
    months.forEach((m: string) => { buckets[m] = 0; });
    items.forEach((it: any) => {
      const t = txById.get(it.transaction_id);
      if (!t) return;
      if (chartShop !== 'all' && t.shop_id !== chartShop) return;
      if (chartCat !== 'all') {
        const cat = productCat[it.product];
        if (cat !== chartCat) return;
      }
      const d = new Date(t.sale_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[key] === undefined) return;
      buckets[key] += toBagEquivalent(Number(it.quantity), it.unit);
    });
    const rows = months.map((m: string) => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString('en', { month: 'short', year: '2-digit' });
      return { month: label, bags: Math.round(buckets[m] * 100) / 100 };
    });
    setMonthly(rows);
  };

  useEffect(() => { rebuildMonthly(); /* eslint-disable-next-line */ }, [chartShop, chartCat, productCat]);

  const applyCustom = () => {
    const s = new Date(customStart), e = new Date(customEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
    setCurrent({ start: startOfDay(s), end: endOfDay(e), label: 'Custom' });
  };
  const applyDefault = () => {
    const d = defaultCurrent();
    setCurrent(d);
    setCustomStart(dateStr(d.start));
    setCustomEnd(dateStr(d.end));
  };

  const shopName = (id: string) => shops.find((s) => s.shop_id === id)?.shop_name || id;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={kimpFeedsLogo} alt="Kimp Feeds" className="h-9 w-9 rounded" />
            <div>
              <div className="font-semibold">Executive Dashboard</div>
              <div className="text-xs text-muted-foreground">Welcome, {profile?.display_name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/ai-insights"><Button variant="outline" size="sm"><BrainCircuit className="h-4 w-4 mr-1" />AI Insights</Button></Link>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Period selector */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Current period</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
                <span className="text-muted-foreground">→</span>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
                <Button size="sm" onClick={applyCustom}>Apply</Button>
                <Button size="sm" variant="outline" onClick={applyDefault}>Reset (MTD vs last month)</Button>
              </div>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              Comparing <span className="font-medium text-foreground">{dateStr(current.start)} → {dateStr(current.end)}</span> vs <span className="font-medium text-foreground">{dateStr(prior.start)} → {dateStr(prior.end)}</span>
            </div>
          </CardContent>
        </Card>

        {loading || !data ? (
          <Card><CardContent className="p-6 text-muted-foreground">Loading…</CardContent></Card>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard title="Revenue" cur={data.cur.revenue} prior={data.pri.revenue} format={fmtKes} />
              <KpiCard title="Money In" cur={data.cur.moneyIn} prior={data.pri.moneyIn} format={fmtKes} />
              <KpiCard title="Credit issued" cur={data.cur.credit} prior={data.pri.credit} format={fmtKes} invert />
              <KpiCard title="Bags sold (70kg eq)" cur={data.cur.bags} prior={data.pri.bags} format={(n) => formatBags(n)} />
              <KpiCard title="Debt payments in" cur={data.cur.debtPaid} prior={data.pri.debtPaid} format={fmtKes} />
              <KpiCard title="New customers (30d)" cur={data.newCustCur} prior={data.newCustPrior} format={fmtInt} />
              <KpiCard title="Active customers (90d)" cur={data.activeCur} prior={data.activePrior} format={fmtInt} />
              <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setShowDebtors(true)}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Outstanding debt (today)</div>
                  <div className="text-2xl font-bold text-destructive tabular-nums">{fmtKes(data.outstanding)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{data.debtorCount} debtors — tap for list</div>
                </CardContent>
              </Card>
            </div>

            {/* Sales by outlet */}
            <Card>
              <CardHeader><CardTitle className="text-base">Sales by outlet — current vs prior</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead className="text-right">Bags</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Money In</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Δ Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(() => {
                      const ids = new Set<string>([...data.shopMap.keys(), ...data.shopMapPrior.keys()]);
                      const rows = [...ids].map((id) => {
                        const c = data.shopMap.get(id) || { bags: 0, revenue: 0, moneyIn: 0, credit: 0 };
                        const p = data.shopMapPrior.get(id) || { bags: 0, revenue: 0, moneyIn: 0, credit: 0 };
                        return { id, c, p };
                      }).sort((a, b) => b.c.revenue - a.c.revenue);
                      const totals = rows.reduce((acc, r) => ({
                        bags: acc.bags + r.c.bags, revenue: acc.revenue + r.c.revenue, moneyIn: acc.moneyIn + r.c.moneyIn, credit: acc.credit + r.c.credit,
                        pRev: acc.pRev + r.p.revenue,
                      }), { bags: 0, revenue: 0, moneyIn: 0, credit: 0, pRev: 0 });
                      return (<>
                        {rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{shopName(r.id)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatBags(r.c.bags)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKes(r.c.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKes(r.c.moneyIn)}</TableCell>
                            <TableCell className="text-right tabular-nums text-orange-600">{fmtKes(r.c.credit)}</TableCell>
                            <TableCell className="text-right"><DeltaChip cur={r.c.revenue} prior={r.p.revenue} /></TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold bg-muted/40">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBags(totals.bags)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtKes(totals.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtKes(totals.moneyIn)}</TableCell>
                          <TableCell className="text-right tabular-nums text-orange-600">{fmtKes(totals.credit)}</TableCell>
                          <TableCell className="text-right"><DeltaChip cur={totals.revenue} prior={totals.pRev} /></TableCell>
                        </TableRow>
                      </>);
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Product sales */}
            <Card>
              <CardHeader><CardTitle className="text-base">Product sales — current vs prior</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Bags</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Prior Revenue</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(() => {
                      const names = new Set<string>([...data.prodMap.keys(), ...data.prodMapPrior.keys()]);
                      const rows = [...names].map((n) => ({
                        name: n,
                        c: data.prodMap.get(n) || { bags: 0, revenue: 0 },
                        p: data.prodMapPrior.get(n) || { bags: 0, revenue: 0 },
                      })).sort((a, b) => b.c.revenue - a.c.revenue);
                      return rows.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBags(r.c.bags)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtKes(r.c.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmtKes(r.p.revenue)}</TableCell>
                          <TableCell className="text-right"><DeltaChip cur={r.c.revenue} prior={r.p.revenue} /></TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Debt aging + top debtors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader><CardTitle className="text-base">Debt aging</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Bucket</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      <TableRow><TableCell>0–30 days</TableCell><TableCell className="text-right tabular-nums">{fmtKes(data.aging.d30)}</TableCell></TableRow>
                      <TableRow><TableCell>31–60 days</TableCell><TableCell className="text-right tabular-nums">{fmtKes(data.aging.d60)}</TableCell></TableRow>
                      <TableRow><TableCell>61–90 days</TableCell><TableCell className="text-right tabular-nums text-orange-600">{fmtKes(data.aging.d90)}</TableCell></TableRow>
                      <TableRow><TableCell>90+ days</TableCell><TableCell className="text-right tabular-nums text-destructive">{fmtKes(data.aging.d90p)}</TableCell></TableRow>
                      <TableRow className="font-semibold bg-muted/40"><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{fmtKes(data.outstanding)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Top debtors</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Owes</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.topDebtors.length === 0 ? (
                        <TableRow><TableCell colSpan={2} className="text-muted-foreground text-center">No outstanding debt.</TableCell></TableRow>
                      ) : data.topDebtors.map(([name, amt]: [string, number]) => (
                        <TableRow key={name}><TableCell className="font-medium">{name || 'Unknown'}</TableCell><TableCell className="text-right tabular-nums text-destructive">{fmtKes(amt)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {data.debtorCount > 10 && (
                    <div className="mt-2 text-right"><Button size="sm" variant="outline" onClick={() => setShowDebtors(true)}>View all {data.debtorCount}</Button></div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top customers */}
            <Card>
              <CardHeader><CardTitle className="text-base">Top customers — current vs prior</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Prior</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.topCustomers.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-muted-foreground text-center">No sales this period.</TableCell></TableRow>
                    ) : data.topCustomers.map((r: any) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKes(r.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtKes(r.priorRevenue)}</TableCell>
                        <TableCell className="text-right"><DeltaChip cur={r.revenue} prior={r.priorRevenue} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Monthly bar chart */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Monthly bags sold — last 12 months</CardTitle>
              <div className="flex gap-2">
                <Select value={chartShop} onValueChange={setChartShop}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shops</SelectItem>
                    {shops.map((s) => (<SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={chartCat} onValueChange={setChartCat}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: any) => [`${v} bags`, 'Bags (70kg eq)']} />
                  <Legend />
                  <Bar dataKey="bags" name="Bags (70kg eq)" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={showDebtors} onOpenChange={setShowDebtors}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Debtors</DialogTitle></DialogHeader>
          <DebtorsList shops={shops} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExecutiveDashboard;