import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import WeeklyGrid from './WeeklyGrid';
import { toBagEquivalent, formatBags } from '@/lib/units';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { shopFilter: string }

const iso = (d: Date) => d.toISOString().split('T')[0];
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
/** Monday-anchored week start for a given date. */
const weekStart = (d: Date) => {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - day);
  return x;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd   = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmtKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

const fetchAllPages = async <T,>(build: () => any): Promise<T[]> => {
  const PAGE = 1000; let page = 0; let all: T[] = [];
  while (true) {
    const { data } = await build().range(page * PAGE, page * PAGE + PAGE - 1);
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
};

/**
 * Dense one-page analytics view for the accountant:
 *  • Weekly grid (days × products) for both bags-eq and money.
 *  • Monthly report: bags/money per product with MoM deltas + debt snapshot.
 */
const AccountantReports: React.FC<Props> = ({ shopFilter }) => {
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => weekStart(new Date()));
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => monthStart(new Date()));

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(weekAnchor, i))), [weekAnchor]);

  const [weekRows, setWeekRows] = useState<any[]>([]);
  const [monthRows, setMonthRows] = useState<any[]>([]);
  const [prevMonthRows, setPrevMonthRows] = useState<any[]>([]);
  const [monthDebts, setMonthDebts] = useState<{ issued: number; paid: number; outstanding: number; topDebtors: { customer: string; debt: number }[] }>({ issued: 0, paid: 0, outstanding: 0, topDebtors: [] });
  const [loading, setLoading] = useState(false);

  // Load rows for a given date window, returned as items enriched with sale_date.
  const loadItems = async (fromISO: string, toISO: string) => {
    let txQ = () => {
      let q = supabase.from('sales_transactions').select('id, sale_date, shop_id').gte('sale_date', fromISO).lte('sale_date', toISO);
      if (shopFilter !== 'all') q = q.eq('shop_id', shopFilter);
      return q;
    };
    const tx = await fetchAllPages<any>(txQ);
    const dateById = new Map(tx.map(t => [t.id, t.sale_date]));
    const ids = tx.map(t => t.id);
    let allItems: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: it } = await supabase.from('sales_items').select('product, unit, quantity, unit_price, transaction_id').in('transaction_id', ids.slice(i, i + 200));
      allItems = allItems.concat(it || []);
    }
    return allItems.map(it => ({ ...it, sale_date: dateById.get(it.transaction_id) }));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const rows = await loadItems(weekDays[0], weekDays[6]);
      setWeekRows(rows);
      setLoading(false);
    })();
  }, [weekAnchor, shopFilter]);

  useEffect(() => {
    (async () => {
      const mStart = monthStart(monthAnchor); const mEnd = monthEnd(monthAnchor);
      const pStart = monthStart(addDays(mStart, -1)); const pEnd = monthEnd(addDays(mStart, -1));

      const [mRows, pRows] = await Promise.all([
        loadItems(iso(mStart), iso(mEnd)),
        loadItems(iso(pStart), iso(pEnd)),
      ]);
      setMonthRows(mRows); setPrevMonthRows(pRows);

      // Debts snapshot for the selected month
      let txQ = supabase.from('sales_transactions').select('total_amount, amount_paid, is_credit, customer_name, shop_id, sale_date').gte('sale_date', iso(mStart)).lte('sale_date', iso(mEnd));
      let dpQ = supabase.from('debt_payments').select('amount, payment_date, shop_id').gte('payment_date', iso(mStart)).lte('payment_date', iso(mEnd));
      let outQ = supabase.from('sales_transactions').select('total_amount, amount_paid, customer_name, is_credit, shop_id').eq('is_credit', true);
      if (shopFilter !== 'all') { txQ = txQ.eq('shop_id', shopFilter); dpQ = dpQ.eq('shop_id', shopFilter); outQ = outQ.eq('shop_id', shopFilter); }
      const [{ data: mTx }, { data: dp }, { data: outAll }] = await Promise.all([txQ, dpQ, outQ]);
      const issued = (mTx || []).filter(t => t.is_credit).reduce((s, t) => s + (Number(t.total_amount || 0) - Number(t.amount_paid || 0)), 0);
      const paid = (dp || []).reduce((s, d) => s + Number(d.amount || 0), 0);
      // Rough outstanding = sum of credit sales balance overall (ignoring extra debt payments joined to individual tx keeps this cheap).
      const debtByCustomer = new Map<string, number>();
      (outAll || []).forEach(t => {
        const bal = Number(t.total_amount || 0) - Number(t.amount_paid || 0);
        if (bal > 0.01) debtByCustomer.set(t.customer_name || '—', (debtByCustomer.get(t.customer_name || '—') || 0) + bal);
      });
      const outstanding = [...debtByCustomer.values()].reduce((s, v) => s + v, 0);
      const topDebtors = [...debtByCustomer.entries()].map(([customer, debt]) => ({ customer, debt })).sort((a, b) => b.debt - a.debt).slice(0, 10);
      setMonthDebts({ issued, paid, outstanding, topDebtors });
    })();
  }, [monthAnchor, shopFilter]);

  // Aggregate a set of rows into per-product bags + money totals.
  const aggregate = (rows: any[]) => {
    const m = new Map<string, { bags: number; money: number }>();
    rows.forEach(r => {
      const bags = toBagEquivalent(Number(r.quantity || 0), r.unit);
      const money = Number(r.quantity || 0) * Number(r.unit_price || 0);
      const cur = m.get(r.product) || { bags: 0, money: 0 };
      cur.bags += bags; cur.money += money;
      m.set(r.product, cur);
    });
    return m;
  };

  const monthTotals = useMemo(() => aggregate(monthRows), [monthRows]);
  const prevTotals  = useMemo(() => aggregate(prevMonthRows), [prevMonthRows]);

  const productRows = useMemo(() => {
    const products = new Set<string>([...monthTotals.keys(), ...prevTotals.keys()]);
    return [...products].map(product => {
      const cur = monthTotals.get(product) || { bags: 0, money: 0 };
      const prev = prevTotals.get(product) || { bags: 0, money: 0 };
      return {
        product,
        bags: cur.bags, prevBags: prev.bags, bagsDelta: cur.bags - prev.bags,
        money: cur.money, prevMoney: prev.money, moneyDelta: cur.money - prev.money,
      };
    }).sort((a, b) => b.money - a.money);
  }, [monthTotals, prevTotals]);

  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prevMonthLabel = addDays(monthStart(monthAnchor), -1).toLocaleDateString(undefined, { month: 'short' });

  const DeltaCell = ({ delta, mode }: { delta: number; mode: 'bags' | 'money' }) => {
    const up = delta > 0.01, down = delta < -0.01;
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    const text = mode === 'bags' ? formatBags(Math.abs(delta)) : Math.round(Math.abs(delta)).toLocaleString();
    return (
      <span className={cn('inline-flex items-center gap-1 tabular-nums', up ? 'text-green-600' : down ? 'text-destructive' : 'text-muted-foreground')}>
        <Icon className="h-3.5 w-3.5" /> {up ? '+' : down ? '−' : ''}{text}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* WEEKLY */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Weekly performance — {weekDays[0]} → {weekDays[6]}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setWeekAnchor(weekStart(new Date()))}>This week</Button>
            <Button size="sm" variant="outline" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}><ChevronRight className="h-4 w-4" /></Button>
            <div className="flex items-center gap-1">
              <Label className="text-xs">Week of</Label>
              <Input type="date" className="h-8 w-36" value={iso(weekAnchor)} onChange={e => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setWeekAnchor(weekStart(d)); }} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <WeeklyGrid title="Bags sold (70kg equivalent)" days={weekDays} rows={weekRows} mode="bags" />
          <WeeklyGrid title="Money generated (KES)" days={weekDays} rows={weekRows} mode="money" />
          {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        </CardContent>
      </Card>

      {/* MONTHLY */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Monthly report — {monthLabel}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMonthAnchor(monthStart(addDays(monthAnchor, -1)))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setMonthAnchor(monthStart(new Date()))}>This month</Button>
            <Button size="sm" variant="outline" onClick={() => setMonthAnchor(monthStart(addDays(monthEnd(monthAnchor), 1)))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Debt snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded border bg-orange-500/5"><div className="text-xs text-muted-foreground">Credit issued</div><div className="text-xl font-bold text-orange-600">{fmtKes(monthDebts.issued)}</div></div>
            <div className="p-3 rounded border bg-green-500/5"><div className="text-xs text-muted-foreground">Debt paid</div><div className="text-xl font-bold text-green-700">{fmtKes(monthDebts.paid)}</div></div>
            <div className="p-3 rounded border"><div className="text-xs text-muted-foreground">Net debt change</div><div className={cn('text-xl font-bold', monthDebts.issued - monthDebts.paid > 0 ? 'text-destructive' : 'text-green-700')}>{fmtKes(monthDebts.issued - monthDebts.paid)}</div></div>
            <div className="p-3 rounded border bg-destructive/5"><div className="text-xs text-muted-foreground">Outstanding (all time)</div><div className="text-xl font-bold text-destructive">{fmtKes(monthDebts.outstanding)}</div></div>
          </div>

          {/* Per-product bags + money with MoM deltas */}
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Bags ({monthAnchor.toLocaleDateString(undefined,{ month: 'short' })})</TableHead>
                  <TableHead className="text-right">Bags ({prevMonthLabel})</TableHead>
                  <TableHead className="text-right">Δ bags</TableHead>
                  <TableHead className="text-right">Money ({monthAnchor.toLocaleDateString(undefined,{ month: 'short' })})</TableHead>
                  <TableHead className="text-right">Money ({prevMonthLabel})</TableHead>
                  <TableHead className="text-right">Δ money</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productRows.map(r => (
                  <TableRow key={r.product}>
                    <TableCell className="font-medium">{r.product}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatBags(r.bags)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatBags(r.prevBags)}</TableCell>
                    <TableCell className="text-right"><DeltaCell delta={r.bagsDelta} mode="bags" /></TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtKes(r.money)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtKes(r.prevMoney)}</TableCell>
                    <TableCell className="text-right"><DeltaCell delta={r.moneyDelta} mode="money" /></TableCell>
                  </TableRow>
                ))}
                {!productRows.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No sales in this month.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          {/* Top debtors */}
          {monthDebts.topDebtors.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2">Top debtors</div>
              <Table className="text-xs">
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Owing</TableHead></TableRow></TableHeader>
                <TableBody>
                  {monthDebts.topDebtors.map(d => (
                    <TableRow key={d.customer}><TableCell>{d.customer}</TableCell><TableCell className="text-right text-destructive tabular-nums">{fmtKes(d.debt)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountantReports;