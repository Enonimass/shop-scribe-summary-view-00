import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarRange, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toBagEquivalent } from '@/lib/units';

interface Shop { shop_id: string; shop_name: string }
interface Props {
  shops: Shop[];
  shopFilter?: string;
  hideShopSelect?: boolean;
  title?: string;
}

type TierKey = 'gt10' | '5to10' | '1to5' | 'lt1';
const TIERS: { key: TierKey; label: string; test: (v: number) => boolean }[] = [
  { key: 'gt10',  label: '>10',  test: v => v > 10 },
  { key: '5to10', label: '5-10', test: v => v >= 5 && v <= 10 },
  { key: '1to5',  label: '1-5',  test: v => v >= 1 && v < 5 },
  { key: 'lt1',   label: '<1',   test: v => v > 0 && v < 1 },
];

const fmt = (n: number) => n === 0 ? '-' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

// Mon–Sat week key. Sunday rolls into the previous week.
const weekKey = (d: Date): string => {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = dt.getDay(); // 0 Sun ... 6 Sat
  const offsetToMon = dow === 0 ? 6 : dow - 1;
  dt.setDate(dt.getDate() - offsetToMon);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const WeeklyPurchasing: React.FC<Props> = ({ shops, shopFilter: externalShop, hideShopSelect, title = 'Weekly Purchasing Power' }) => {
  const [mode, setMode] = useState<'month' | 'all' | 'custom'>('month');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [internalShop, setInternalShop] = useState<string>('all');
  const shopFilter = externalShop ?? internalShop;

  const [tx, setTx] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    if (mode === 'all') return { start: '', end: '' };
    if (mode === 'month') {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }
    return { start: from, end: to };
  }, [mode, month, from, to]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode, month, from, to, shopFilter]);

  const load = async () => {
    setLoading(true);
    let txQ = supabase.from('sales_transactions').select('id, shop_id, customer_name, sale_date');
    if (range.start) txQ = txQ.gte('sale_date', range.start);
    if (range.end) txQ = txQ.lte('sale_date', range.end);
    if (shopFilter && shopFilter !== 'all') txQ = txQ.eq('shop_id', shopFilter);

    let allTx: any[] = [];
    const PAGE = 1000;
    let page = 0;
    while (true) {
      const { data } = await txQ.range(page * PAGE, page * PAGE + PAGE - 1);
      if (!data || data.length === 0) break;
      allTx = allTx.concat(data);
      if (data.length < PAGE) break;
      page++;
    }
    const ids = allTx.map(t => t.id);
    let allItems: any[] = [];
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: it } = await supabase.from('sales_items').select('transaction_id, quantity, unit').in('transaction_id', ids.slice(i, i + CHUNK));
      allItems = allItems.concat(it || []);
    }
    setTx(allTx); setItems(allItems); setLoading(false);
  };

  const computed = useMemo(() => {
    const txById = new Map<string, any>();
    tx.forEach(t => txById.set(t.id, t));
    // shop -> customer -> weekKey -> bags
    const perCustomerWeek = new Map<string, Map<string, Map<string, number>>>();
    items.forEach(it => {
      const t = txById.get(it.transaction_id);
      if (!t) return;
      const customer = (t.customer_name || '').trim();
      if (!customer) return;
      const wk = weekKey(new Date(t.sale_date));
      const bags = toBagEquivalent(Number(it.quantity) || 0, it.unit);
      if (!perCustomerWeek.has(t.shop_id)) perCustomerWeek.set(t.shop_id, new Map());
      const byCust = perCustomerWeek.get(t.shop_id)!;
      const ckey = customer.toLowerCase();
      if (!byCust.has(ckey)) byCust.set(ckey, new Map());
      const byWk = byCust.get(ckey)!;
      byWk.set(wk, (byWk.get(wk) || 0) + bags);
    });

    const visibleShops = (shopFilter && shopFilter !== 'all')
      ? shops.filter(s => s.shop_id === shopFilter)
      : shops;

    type Row = { shop_id: string; name: string; weeks: Record<TierKey, number>; customers: Record<TierKey, Set<string>> };
    const rows: Row[] = visibleShops.map(s => ({
      shop_id: s.shop_id, name: s.shop_name,
      weeks: { gt10: 0, '5to10': 0, '1to5': 0, lt1: 0 },
      customers: { gt10: new Set(), '5to10': new Set(), '1to5': new Set(), lt1: new Set() },
    }));
    const rowByShop = new Map(rows.map(r => [r.shop_id, r]));

    perCustomerWeek.forEach((byCust, shopId) => {
      const row = rowByShop.get(shopId);
      if (!row) return;
      byCust.forEach((byWk, ckey) => {
        byWk.forEach(bags => {
          const tier = TIERS.find(t => t.test(bags));
          if (!tier) return;
          row.weeks[tier.key] += 1;
          row.customers[tier.key].add(ckey);
        });
      });
    });

    const colWeeks: Record<TierKey, number> = { gt10: 0, '5to10': 0, '1to5': 0, lt1: 0 };
    const colCustomers: Record<TierKey, Set<string>> = { gt10: new Set(), '5to10': new Set(), '1to5': new Set(), lt1: new Set() };
    rows.forEach(r => TIERS.forEach(t => {
      colWeeks[t.key] += r.weeks[t.key];
      r.customers[t.key].forEach(c => colCustomers[t.key].add(`${r.shop_id}|${c}`));
    }));
    const grandWeeks = Object.values(colWeeks).reduce((a, b) => a + b, 0);
    const grandCustomers = new Set<string>();
    Object.values(colCustomers).forEach(s => s.forEach(v => grandCustomers.add(v)));

    return { rows, colWeeks, colCustomers, grandWeeks, grandCustomers: grandCustomers.size };
  }, [tx, items, shops, shopFilter]);

  const exportCsv = () => {
    const lines: string[] = [];
    lines.push('Customer-weeks per tier (Mon-Sat weeks, 70kg bag-equivalents)');
    lines.push(['Outlet', ...TIERS.map(t => t.label), 'Total weeks'].join(','));
    computed.rows.forEach(r => {
      const tot = TIERS.reduce((s, t) => s + r.weeks[t.key], 0);
      lines.push([r.name, ...TIERS.map(t => r.weeks[t.key]), tot].join(','));
    });
    lines.push(['T.Weeks', ...TIERS.map(t => computed.colWeeks[t.key]), computed.grandWeeks].join(','));
    lines.push('');
    lines.push('Distinct customers reaching each tier at least once');
    lines.push(['Outlet', ...TIERS.map(t => t.label), 'Active customers'].join(','));
    computed.rows.forEach(r => {
      const active = new Set<string>();
      TIERS.forEach(t => r.customers[t.key].forEach(c => active.add(c)));
      lines.push([r.name, ...TIERS.map(t => r.customers[t.key].size), active.size].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-purchasing-${Date.now()}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" /> {title}</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Scope</Label>
            <Select value={mode} onValueChange={v => setMode(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Selected Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'month' && (
            <div><Label>Month</Label><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
          )}
          {mode === 'custom' && (
            <>
              <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </>
          )}
          {!hideShopSelect && externalShop === undefined && (
            <div>
              <Label>Shop</Label>
              <Select value={internalShop} onValueChange={setInternalShop}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          One "week" = Mon→Sat. A customer who buys in 3 different weeks contributes 3 weekly entries. Bag-equivalents use 70 kg per bag.
        </p>

        {loading ? <div className="text-muted-foreground text-sm">Loading…</div> : (
          <div className="space-y-6">
            <div>
              <div className="text-sm font-semibold mb-1">Customer-weeks per tier</div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Outlet</TableHead>
                  {TIERS.map(t => <TableHead key={t.key} className="text-right">{t.label}</TableHead>)}
                  <TableHead className="text-right">Total weeks</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {computed.rows.map(r => {
                    const rt = TIERS.reduce((s, t) => s + r.weeks[t.key], 0);
                    return (
                      <TableRow key={r.shop_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        {TIERS.map(t => <TableCell key={t.key} className="text-right">{fmt(r.weeks[t.key])}</TableCell>)}
                        <TableCell className="text-right font-semibold">{fmt(rt)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">T.Weeks</TableCell>
                    {TIERS.map(t => <TableCell key={t.key} className="text-right font-semibold">{fmt(computed.colWeeks[t.key])}</TableCell>)}
                    <TableCell className="text-right font-bold">{computed.grandWeeks}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <div className="text-sm font-semibold mb-1">Distinct customers reaching each tier (at least one week)</div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Outlet</TableHead>
                  {TIERS.map(t => <TableHead key={t.key} className="text-right">{t.label}</TableHead>)}
                  <TableHead className="text-right">Active customers</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {computed.rows.map(r => {
                    const active = new Set<string>();
                    TIERS.forEach(t => r.customers[t.key].forEach(c => active.add(c)));
                    return (
                      <TableRow key={r.shop_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        {TIERS.map(t => <TableCell key={t.key} className="text-right">{fmt(r.customers[t.key].size)}</TableCell>)}
                        <TableCell className="text-right font-semibold">{fmt(active.size)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold">T.Customers</TableCell>
                    {TIERS.map(t => <TableCell key={t.key} className="text-right font-semibold">{fmt(computed.colCustomers[t.key].size)}</TableCell>)}
                    <TableCell className="text-right font-bold">{computed.grandCustomers}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeeklyPurchasing;