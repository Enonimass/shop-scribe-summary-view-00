import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogOut, Calculator, DollarSign, Wallet, AlertTriangle, Package, Factory, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ExportButtons from './ExportButtons';
import DebtorsList from './money/DebtorsList';
import DailyReport from './money/DailyReport';
import AccountantReports from './accountant/AccountantReports';
import { PIVOT_UNITS, canonicalUnitKey, toBagEquivalent, formatBags } from '@/lib/units';
import { FileBarChart } from 'lucide-react';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';
import MobileTabsNav from './MobileTabsNav';

const fmtKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

const AccountantDashboard: React.FC = () => {
  const { profile, logout } = useAuth();
  const [tab, setTab] = useState<string>('sales');
  const [shops, setShops] = useState<{ shop_id: string; shop_name: string }[]>([]);
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [tx, setTx] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [debtPayments, setDebtPayments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [factory, setFactory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('shop_id, shop_name').eq('role', 'seller').not('shop_id', 'is', null);
      const uniq = new Map<string, string>();
      (data || []).forEach((p: any) => { if (p.shop_id) uniq.set(p.shop_id, p.shop_name || p.shop_id); });
      setShops([...uniq.entries()].map(([shop_id, shop_name]) => ({ shop_id, shop_name })));
    })();
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [shopFilter, dateFrom, dateTo]);

  const load = async () => {
    setLoading(true);
    let txQ = supabase.from('sales_transactions').select('*').gte('sale_date', dateFrom).lte('sale_date', dateTo).order('sale_date', { ascending: false });
    if (shopFilter !== 'all') txQ = txQ.eq('shop_id', shopFilter);
    let allTx: any[] = [];
    const PAGE = 1000;
    let page = 0;
    while (true) {
      const { data } = await txQ.range(page * PAGE, page * PAGE + PAGE - 1);
      if (!data || !data.length) break;
      allTx = allTx.concat(data);
      if (data.length < PAGE) break;
      page++;
    }
    const ids = allTx.map(t => t.id);
    let allItems: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: it } = await supabase.from('sales_items').select('*').in('transaction_id', ids.slice(i, i + 200));
      allItems = allItems.concat(it || []);
    }

    let dpQ = supabase.from('debt_payments').select('*').gte('payment_date', dateFrom).lte('payment_date', dateTo).order('payment_date', { ascending: false });
    if (shopFilter !== 'all') dpQ = dpQ.eq('shop_id', shopFilter);
    const { data: dp } = await dpQ;

    let invQ = supabase.from('inventory').select('*');
    if (shopFilter !== 'all') invQ = invQ.eq('shop_id', shopFilter);
    const { data: inv } = await invQ;

    const { data: fac } = await supabase.from('factory_inventory').select('*');

    setTx(allTx); setItems(allItems); setDebtPayments(dp || []); setInventory(inv || []); setFactory(fac || []);
    setLoading(false);
  };

  const kpis = useMemo(() => {
    const revenue = tx.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const collected = tx.reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    const outstanding = tx.filter(t => t.is_credit).reduce((s, t) => s + (Number(t.total_amount) - Number(t.amount_paid)), 0);
    const debtPaid = debtPayments.reduce((s, d) => s + Number(d.amount || 0), 0);
    const moneyIn = collected + debtPaid;
    const cashSales = tx.filter(t => !t.is_credit).reduce((s, t) => s + Number(t.total_amount || 0), 0)
                    + tx.filter(t => t.is_credit).reduce((s, t) => s + Number(t.amount_paid || 0), 0);
    const creditIssued = tx.filter(t => t.is_credit).reduce((s, t) => s + (Number(t.total_amount || 0) - Number(t.amount_paid || 0)), 0);
    return { revenue, collected, outstanding, debtPaid, moneyIn, txCount: tx.length, cashSales, creditIssued };
  }, [tx, debtPayments]);

  // Simplified inventory pivot (rows = product, columns = canonical units)
  const inventoryPivot = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    inventory.forEach(i => {
      const k = canonicalUnitKey(i.unit);
      if (!k) return;
      const row = m.get(i.product) || {};
      row[k] = (row[k] || 0) + Number(i.quantity || 0);
      m.set(i.product, row);
    });
    return [...m.entries()].map(([product, units]) => ({ product, units })).sort((a, b) => a.product.localeCompare(b.product));
  }, [inventory]);
  const productBagEq = (units: Record<string, number>) => {
    let total = 0;
    PIVOT_UNITS.forEach(u => {
      const q = units[u.key] || 0;
      if (!q) return;
      const dbU = u.key === '70kg' ? 'bags' : (u.key === 'kg' ? 'kg' : u.key);
      total += toBagEquivalent(q, dbU);
    });
    return total;
  };

  const moneyByMethod = useMemo(() => {
    const m = new Map<string, number>();
    tx.forEach(t => {
      const k = t.payment_method_name || 'Unspecified';
      m.set(k, (m.get(k) || 0) + Number(t.amount_paid || 0));
    });
    debtPayments.forEach(d => {
      const k = d.payment_method_name || 'Unspecified';
      m.set(k, (m.get(k) || 0) + Number(d.amount || 0));
    });
    return [...m.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  }, [tx, debtPayments]);

  const outstandingByCustomer = useMemo(() => {
    const m = new Map<string, { customer: string; shop_id: string; total: number; paid: number; debt: number; count: number }>();
    tx.filter(t => t.is_credit).forEach(t => {
      const key = `${t.shop_id}|${(t.customer_name || '').toLowerCase()}`;
      const cur = m.get(key) || { customer: t.customer_name, shop_id: t.shop_id, total: 0, paid: 0, debt: 0, count: 0 };
      const extra = debtPayments
        .filter(d => d.sale_transaction_id === t.id)
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      cur.total += Number(t.total_amount || 0);
      cur.paid += Number(t.amount_paid || 0) + extra;
      cur.debt = cur.total - cur.paid;
      cur.count += 1;
      m.set(key, cur);
    });
    return [...m.values()].filter(r => r.debt > 0.01).sort((a, b) => b.debt - a.debt);
  }, [tx, debtPayments]);

  const openCreditSales = useMemo(() => {
    return tx
      .filter(t => t.is_credit)
      .map(t => {
        const extra = debtPayments
          .filter(d => d.sale_transaction_id === t.id)
          .reduce((s, d) => s + Number(d.amount || 0), 0);
        const paid = Number(t.amount_paid || 0) + extra;
        const balance = Number(t.total_amount || 0) - paid;
        const linkedPayments = debtPayments.filter(d => d.sale_transaction_id === t.id);
        return { ...t, _paid: paid, _balance: balance, _payments: linkedPayments };
      })
      .filter(s => s._balance > 0.01)
      .sort((a, b) => b._balance - a._balance);
  }, [tx, debtPayments]);

  const shopName = (id: string) => shops.find(s => s.shop_id === id)?.shop_name || id;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <img src={kimpFeedsLogo} alt="Kimp Feeds" className="h-9 w-9 rounded" />
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2"><Calculator className="h-5 w-5 text-green-awesome" /> Accountant Console</h1>
              <p className="text-xs text-muted-foreground">Read-only access · {profile?.display_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Read-only</Badge>
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <Label>Shop</Label>
                <Select value={shopFilter} onValueChange={setShopFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shops</SelectItem>
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-bold">{fmtKes(kpis.revenue)}</div><div className="text-xs text-muted-foreground">{kpis.txCount} sales</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Money in</div><div className="text-2xl font-bold text-green-awesome">{fmtKes(kpis.moneyIn)}</div><div className="text-xs text-muted-foreground">Collected + debt paid</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding debt</div><div className="text-2xl font-bold text-destructive">{fmtKes(kpis.outstanding)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Debt paid in period</div><div className="text-2xl font-bold">{fmtKes(kpis.debtPaid)}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Revenue vs Money-In breakdown</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="font-semibold">Revenue (invoiced) — {fmtKes(kpis.revenue)}</div>
              <div className="flex justify-between border-b py-1"><span>Cash sales (paid part)</span><span className="tabular-nums">{fmtKes(kpis.cashSales)}</span></div>
              <div className="flex justify-between py-1"><span>+ Credit issued (unpaid part)</span><span className="tabular-nums text-orange-600">{fmtKes(kpis.creditIssued)}</span></div>
            </div>
            <div className="space-y-1">
              <div className="font-semibold">Money in (collected) — {fmtKes(kpis.moneyIn)}</div>
              <div className="flex justify-between border-b py-1"><span>Cash sales (paid part)</span><span className="tabular-nums">{fmtKes(kpis.cashSales)}</span></div>
              <div className="flex justify-between py-1"><span>+ Debt payments received</span><span className="tabular-nums text-green-600">{fmtKes(kpis.debtPaid)}</span></div>
            </div>
            <div className="md:col-span-2 text-xs text-muted-foreground border-t pt-2">
              Gap = Credit issued this period − Debt payments received. Credit becomes Money-In only when the customer pays.
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <MobileTabsNav
            value={tab}
            onChange={setTab}
            items={[
              { value: 'sales', label: 'Sales', icon: <DollarSign className="h-4 w-4" /> },
              { value: 'money', label: 'Money in', icon: <Wallet className="h-4 w-4" /> },
              { value: 'debts', label: 'Debts', icon: <AlertTriangle className="h-4 w-4" /> },
              { value: 'stock', label: 'Shop stock', icon: <Package className="h-4 w-4" /> },
              { value: 'factory', label: 'Factory stock', icon: <Factory className="h-4 w-4" /> },
              { value: 'daily', label: 'Daily', icon: <FileBarChart className="h-4 w-4" /> },
              { value: 'reports', label: 'Reports', icon: <TrendingUp className="h-4 w-4" /> },
            ]}
          />
          <TabsList className="hidden md:flex flex-wrap h-auto">
            <TabsTrigger value="sales"><DollarSign className="h-4 w-4 mr-1" /> Sales</TabsTrigger>
            <TabsTrigger value="money"><Wallet className="h-4 w-4 mr-1" /> Money in</TabsTrigger>
            <TabsTrigger value="debts"><AlertTriangle className="h-4 w-4 mr-1" /> Debts</TabsTrigger>
            <TabsTrigger value="stock"><Package className="h-4 w-4 mr-1" /> Shop stock</TabsTrigger>
            <TabsTrigger value="factory"><Factory className="h-4 w-4 mr-1" /> Factory stock</TabsTrigger>
            <TabsTrigger value="daily"><FileBarChart className="h-4 w-4 mr-1" /> Daily</TabsTrigger>
            <TabsTrigger value="reports"><TrendingUp className="h-4 w-4 mr-1" /> Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Sales transactions</CardTitle>
                <ExportButtons
                  filename={`sales-${dateFrom}_${dateTo}`}
                  getData={() => ({
                    title: 'Sales Transactions',
                    headers: ['Date', 'Shop', 'Customer', 'Type', 'Method', 'Total', 'Paid', 'Credit?'],
                    rows: tx.map(t => [t.sale_date, shopName(t.shop_id), t.customer_name, t.sale_type, t.payment_method_name || '-', Number(t.total_amount || 0), Number(t.amount_paid || 0), t.is_credit ? 'Yes' : 'No']),
                    summary: { Revenue: fmtKes(kpis.revenue), Collected: fmtKes(kpis.collected), Outstanding: fmtKes(kpis.outstanding) },
                  })}
                />
              </CardHeader>
              <CardContent>
                {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Shop</TableHead><TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead><TableHead>Method</TableHead>
                        <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Credit</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {tx.slice(0, 500).map(t => (
                          <TableRow key={t.id}>
                            <TableCell>{t.sale_date}</TableCell>
                            <TableCell>{shopName(t.shop_id)}</TableCell>
                            <TableCell>{t.customer_name}</TableCell>
                            <TableCell><Badge variant={t.sale_type === 'away' ? 'secondary' : 'outline'}>{t.sale_type}</Badge></TableCell>
                            <TableCell>{t.payment_method_name || '-'}</TableCell>
                            <TableCell className="text-right">{fmtKes(Number(t.total_amount || 0))}</TableCell>
                            <TableCell className="text-right">{fmtKes(Number(t.amount_paid || 0))}</TableCell>
                            <TableCell>{t.is_credit ? <Badge variant="destructive">Credit</Badge> : '-'}</TableCell>
                          </TableRow>
                        ))}
                        {!tx.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No transactions in period.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                    {tx.length > 500 && <div className="text-xs text-muted-foreground mt-2">Showing first 500 of {tx.length}. Export for full list.</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="money">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Money in by method</CardTitle>
                <ExportButtons
                  filename={`money-in-${dateFrom}_${dateTo}`}
                  getData={() => ({
                    title: 'Money In by Method',
                    headers: ['Method', 'Amount'],
                    rows: moneyByMethod.map(r => [r.method, Number(r.amount.toFixed(2))]),
                    summary: { 'Total money in': fmtKes(kpis.moneyIn) },
                  })}
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {moneyByMethod.map(r => (
                      <TableRow key={r.method}><TableCell>{r.method}</TableCell><TableCell className="text-right">{fmtKes(r.amount)}</TableCell></TableRow>
                    ))}
                    {!moneyByMethod.length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No payments recorded.</TableCell></TableRow>}
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-bold">{fmtKes(kpis.moneyIn)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debts">
            <DebtorsList shopId={shopFilter === 'all' ? undefined : shopFilter} shops={shops} />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Outstanding debts</CardTitle>
                <ExportButtons
                  filename={`debts-${dateFrom}_${dateTo}`}
                  getData={() => ({
                    title: 'Outstanding debts by sale',
                    headers: ['Date', 'Customer', 'Shop', 'Sale #', 'Billed', 'Paid', 'Owing'],
                    rows: openCreditSales.map(s => [
                      new Date(s.sale_date).toLocaleDateString(),
                      s.customer_name, shopName(s.shop_id), s.id.slice(0, 8),
                      s.total_amount, s._paid, s._balance,
                    ]),
                    summary: { 'Total outstanding': fmtKes(openCreditSales.reduce((sum, s) => sum + s._balance, 0)) },
                  })}
                />
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="text-sm font-semibold mb-2">By customer (totals)</div>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Customer</TableHead><TableHead>Shop</TableHead>
                        <TableHead className="text-right">Credit sales</TableHead>
                        <TableHead className="text-right">Billed</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Owing</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {outstandingByCustomer.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{r.customer}</TableCell>
                            <TableCell>{shopName(r.shop_id)}</TableCell>
                            <TableCell className="text-right">{r.count}</TableCell>
                            <TableCell className="text-right">{fmtKes(r.total)}</TableCell>
                            <TableCell className="text-right">{fmtKes(r.paid)}</TableCell>
                            <TableCell className="text-right text-destructive font-semibold">{fmtKes(r.debt)}</TableCell>
                          </TableRow>
                        ))}
                        {!outstandingByCustomer.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No outstanding debts in period.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">Per credit sale</div>
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Shop</TableHead>
                        <TableHead>Sale #</TableHead>
                        <TableHead className="text-right">Billed</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Owing</TableHead>
                        <TableHead className="text-right">Payments</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {openCreditSales.map(s => (
                          <TableRow key={s.id}>
                            <TableCell>{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{s.customer_name}</TableCell>
                            <TableCell>{shopName(s.shop_id)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-right">{fmtKes(s.total_amount)}</TableCell>
                            <TableCell className="text-right">{fmtKes(s._paid)}</TableCell>
                            <TableCell className="text-right text-destructive font-semibold">{fmtKes(s._balance)}</TableCell>
                            <TableCell className="text-right text-xs">
                              {s._payments.length
                                ? s._payments.map((p: any) => `${new Date(p.payment_date).toLocaleDateString()}: ${Math.round(Number(p.amount)).toLocaleString()}`).join(' · ')
                                : <span className="italic text-muted-foreground">none</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!openCreditSales.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No open credit sales in period.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Shop inventory</CardTitle>
                <ExportButtons
                  filename={`shop-inventory`}
                  getData={() => ({
                    title: 'Shop Inventory',
                    headers: ['Shop', 'Product', 'Unit', 'Quantity', 'Threshold'],
                    rows: inventory.map(i => [shopName(i.shop_id), i.product, i.unit, Number(i.quantity), Number(i.threshold)]),
                  })}
                />
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="text-sm font-semibold mb-2">Stock by Product</div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Product</TableHead>
                      {PIVOT_UNITS.map(u => <TableHead key={u.key} className="text-right">{u.label}</TableHead>)}
                      <TableHead className="text-right">Total (70kg eq.)</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {inventoryPivot.map(({ product, units }) => (
                        <TableRow key={product}>
                          <TableCell className="font-medium">{product}</TableCell>
                          {PIVOT_UNITS.map(u => (
                            <TableCell key={u.key} className="text-right tabular-nums">
                              {units[u.key] ? units[u.key] : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">{formatBags(productBagEq(units))}</TableCell>
                        </TableRow>
                      ))}
                      {inventoryPivot.length === 0 && (
                        <TableRow><TableCell colSpan={PIVOT_UNITS.length + 2} className="text-center text-muted-foreground">No stock.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-sm font-semibold mb-2">Thresholds &amp; Detail</div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Shop</TableHead><TableHead>Product</TableHead><TableHead>Unit</TableHead>
                    <TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Threshold</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {inventory.map(i => {
                      const low = Number(i.quantity) <= Number(i.threshold);
                      return (
                        <TableRow key={i.id}>
                          <TableCell>{shopName(i.shop_id)}</TableCell>
                          <TableCell>{i.product}</TableCell>
                          <TableCell>{i.unit}</TableCell>
                          <TableCell className="text-right">{Number(i.quantity)}</TableCell>
                          <TableCell className="text-right">{Number(i.threshold)}</TableCell>
                          <TableCell>{low ? <Badge variant="destructive">Low</Badge> : <Badge variant="outline">OK</Badge>}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!inventory.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No inventory.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="factory">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Factory inventory</CardTitle>
                <ExportButtons
                  filename={`factory-inventory`}
                  getData={() => ({
                    title: 'Factory Inventory',
                    headers: ['Product', 'Unit', 'Quantity', 'Threshold'],
                    rows: factory.map(f => [f.product, f.unit, Number(f.quantity), Number(f.threshold)]),
                  })}
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead>Unit</TableHead>
                    <TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Threshold</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {factory.map(f => {
                      const low = Number(f.quantity) <= Number(f.threshold);
                      return (
                        <TableRow key={f.id}>
                          <TableCell>{f.product}</TableCell>
                          <TableCell>{f.unit}</TableCell>
                          <TableCell className="text-right">{Number(f.quantity)}</TableCell>
                          <TableCell className="text-right">{Number(f.threshold)}</TableCell>
                          <TableCell>{low ? <Badge variant="destructive">Low</Badge> : <Badge variant="outline">OK</Badge>}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!factory.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No factory stock.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily">
            <DailyReport shops={shops} defaultShop={shopFilter === 'all' ? undefined : shopFilter} allowAll />
          </TabsContent>

          <TabsContent value="reports">
            <AccountantReports shopFilter={shopFilter} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AccountantDashboard;