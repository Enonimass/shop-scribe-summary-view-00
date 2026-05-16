import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdminAuth } from '@/hooks/useSuperAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Shield, LogOut, Loader2, Plus, Trash2, BarChart3, Users, ClipboardList, Store } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';

// 1 bag = 70kg standard
const toBagEq = (qty: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u.includes('50')) return qty * (50 / 70);
  if (u.includes('40')) return qty * (40 / 70);
  if (u === 'kg') return qty / 70;
  return qty; // bags
};
const toKg = (qty: number, unit: string): number => {
  const u = (unit || '').toLowerCase();
  if (u.includes('50')) return qty * 50;
  if (u.includes('40')) return qty * 40;
  if (u === 'kg') return qty;
  return qty * 70;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

type Range = { from: string; to: string };

const COLORS = ['hsl(var(--primary))', '#22c55e', '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];

const SuperAdminDashboard = () => {
  const { session, loading, logout } = useSuperAdminAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>({ from: monthStartStr(), to: todayStr() });
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [superAdmins, setSuperAdmins] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate('/super-admin/login');
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session) {
      fetchAll();
      fetchSuperAdmins();
    }
  }, [session, range.from, range.to]);

  const shops = useMemo(() => {
    const map = new Map<string, string>();
    profiles.filter((p: any) => p.shop_id).forEach((p: any) => map.set(p.shop_id, p.shop_name || p.shop_id));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [profiles]);

  const fetchAll = async () => {
    setLoadingData(true);
    try {
      const [profRes, txRes, debtRes, invRes, custRes, auditRes] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, role, shop_id, shop_name'),
        supabase
          .from('sales_transactions')
          .select('*')
          .gte('sale_date', range.from)
          .lte('sale_date', range.to)
          .order('sale_date', { ascending: false })
          .limit(5000),
        supabase
          .from('debt_payments')
          .select('*')
          .gte('payment_date', range.from)
          .lte('payment_date', range.to)
          .limit(5000),
        supabase.from('inventory').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      setProfiles(profRes.data || []);
      const tx = txRes.data || [];
      setTransactions(tx);
      setDebts(debtRes.data || []);
      setInventory(invRes.data || []);
      setCustomers(custRes.data || []);
      setAudit(auditRes.data || []);

      // Fetch items in chunks of 200 tx ids
      const ids = tx.map((t: any) => t.id);
      const allItems: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data } = await supabase.from('sales_items').select('*').in('transaction_id', chunk);
        if (data) allItems.push(...data);
      }
      setItems(allItems);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchSuperAdmins = async () => {
    const { data } = await supabase.functions.invoke('super-admin-manage', { body: { action: 'list' } });
    if ((data as any)?.users) setSuperAdmins((data as any).users);
  };

  // -------- aggregations --------
  const filteredTx = useMemo(
    () => (shopFilter === 'all' ? transactions : transactions.filter((t: any) => t.shop_id === shopFilter)),
    [transactions, shopFilter]
  );
  const txIds = useMemo(() => new Set(filteredTx.map((t: any) => t.id)), [filteredTx]);
  const filteredItems = useMemo(() => items.filter((it: any) => txIds.has(it.transaction_id)), [items, txIds]);
  const filteredDebts = useMemo(
    () => (shopFilter === 'all' ? debts : debts.filter((d: any) => d.shop_id === shopFilter)),
    [debts, shopFilter]
  );
  const filteredInventory = useMemo(
    () => (shopFilter === 'all' ? inventory : inventory.filter((i: any) => i.shop_id === shopFilter)),
    [inventory, shopFilter]
  );

  const kpis = useMemo(() => {
    let bags = 0;
    let kg = 0;
    for (const it of filteredItems) {
      bags += toBagEq(Number(it.quantity) || 0, it.unit);
      kg += toKg(Number(it.quantity) || 0, it.unit);
    }
    let revenue = 0,
      cash = 0,
      creditIssued = 0,
      debtOutstanding = 0;
    for (const t of filteredTx) {
      const total = Number(t.total_amount) || 0;
      const paid = Number(t.amount_paid) || 0;
      revenue += total;
      cash += paid;
      if (t.is_credit) {
        creditIssued += total - paid;
        debtOutstanding += Math.max(0, total - paid);
      }
    }
    const debtPaid = filteredDebts.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);
    const lowStock = filteredInventory.filter((i: any) => Number(i.quantity) <= Number(i.threshold || 0)).length;

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const custShop = shopFilter === 'all' ? customers : customers.filter((c: any) => c.shop_id === shopFilter);
    const newCustomers = custShop.filter((c: any) => c.first_purchase_date && new Date(c.first_purchase_date) >= thirtyDaysAgo).length;
    const activeCustomers = custShop.filter((c: any) => c.last_purchase_date && new Date(c.last_purchase_date) >= ninetyDaysAgo).length;

    return { bags, kg, revenue, cash, creditIssued, debtOutstanding, debtPaid, lowStock, newCustomers, activeCustomers };
  }, [filteredItems, filteredTx, filteredDebts, filteredInventory, customers, shopFilter]);

  const trendData = useMemo(() => {
    const m = new Map<string, { date: string; bags: number; revenue: number }>();
    for (const t of filteredTx) {
      const d = t.sale_date;
      const row = m.get(d) || { date: d, bags: 0, revenue: 0 };
      row.revenue += Number(t.total_amount) || 0;
      m.set(d, row);
    }
    for (const it of filteredItems) {
      const tx = filteredTx.find((t: any) => t.id === it.transaction_id);
      if (!tx) continue;
      const row = m.get(tx.sale_date)!;
      row.bags += toBagEq(Number(it.quantity) || 0, it.unit);
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredTx, filteredItems]);

  const paymentMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of filteredTx) {
      const name = t.payment_method_name || (t.is_credit ? 'Credit' : 'Cash');
      m.set(name, (m.get(name) || 0) + (Number(t.amount_paid) || 0));
    }
    for (const d of filteredDebts) {
      const name = d.payment_method_name || 'Cash';
      m.set(name, (m.get(name) || 0) + (Number(d.amount) || 0));
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredTx, filteredDebts]);

  const perShop = useMemo(() => {
    const m = new Map<string, { shop: string; bags: number; tonnage: number; revenue: number; cash: number; debt: number }>();
    const shopName = (id: string) => shops.find((s) => s.id === id)?.name || id;
    for (const t of transactions) {
      const row = m.get(t.shop_id) || { shop: shopName(t.shop_id), bags: 0, tonnage: 0, revenue: 0, cash: 0, debt: 0 };
      row.revenue += Number(t.total_amount) || 0;
      row.cash += Number(t.amount_paid) || 0;
      if (t.is_credit) row.debt += Math.max(0, (Number(t.total_amount) || 0) - (Number(t.amount_paid) || 0));
      m.set(t.shop_id, row);
    }
    for (const it of items) {
      const tx = transactions.find((t: any) => t.id === it.transaction_id);
      if (!tx) continue;
      const row = m.get(tx.shop_id)!;
      row.bags += toBagEq(Number(it.quantity) || 0, it.unit);
      row.tonnage += toKg(Number(it.quantity) || 0, it.unit);
    }
    return Array.from(m.values());
  }, [transactions, items, shops]);

  const topDebtors = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of filteredTx) {
      if (!t.is_credit) continue;
      const owed = Math.max(0, (Number(t.total_amount) || 0) - (Number(t.amount_paid) || 0));
      if (owed > 0) m.set(t.customer_name, (m.get(t.customer_name) || 0) + owed);
    }
    return Array.from(m.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filteredTx]);

  const lowStock = useMemo(
    () => filteredInventory.filter((i: any) => Number(i.quantity) <= Number(i.threshold || 0)),
    [filteredInventory]
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={kimpFeedsLogo} alt="Kimp Feeds" className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Kimp Feeds Super Admin</h1>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" /> {session.email}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={async () => { await logout(); navigate('/super-admin/login'); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Shop</Label>
                <Select value={shopFilter} onValueChange={setShopFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shops</SelectItem>
                    {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setRange({ from: todayStr(), to: todayStr() })}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setRange({ from: monthStartStr(), to: todayStr() })}>This month</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-1" /> Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Super Admins</TabsTrigger>
            <TabsTrigger value="audit"><ClipboardList className="h-4 w-4 mr-1" /> Activity Log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {loadingData && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading data...</div>}

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Kpi label="Bags sold (70kg eq.)" value={kpis.bags.toFixed(1)} />
              <Kpi label="Tonnage" value={`${(kpis.kg / 1000).toFixed(2)} t`} sub={`${kpis.kg.toFixed(0)} kg`} />
              <Kpi label="Revenue" value={fmt(kpis.revenue)} />
              <Kpi label="Cash in" value={fmt(kpis.cash)} />
              <Kpi label="Debt paid" value={fmt(kpis.debtPaid)} />
              <Kpi label="Credit issued" value={fmt(kpis.creditIssued)} />
              <Kpi label="Debt outstanding" value={fmt(kpis.debtOutstanding)} />
              <Kpi label="New customers (30d)" value={kpis.newCustomers} />
              <Kpi label="Active customers (90d)" value={kpis.activeCustomers} />
              <Kpi label="Low stock items" value={kpis.lowStock} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Sales trend</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="bags" name="Bags (70kg)" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Money received by method</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentMix} dataKey="value" nameKey="name" outerRadius={80} label>
                        {paymentMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Per-shop breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shop</TableHead>
                      <TableHead className="text-right">Bags</TableHead>
                      <TableHead className="text-right">Tonnage (kg)</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cash in</TableHead>
                      <TableHead className="text-right">Debt outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perShop.map((r) => (
                      <TableRow key={r.shop}>
                        <TableCell className="font-medium">{r.shop}</TableCell>
                        <TableCell className="text-right">{r.bags.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{r.tonnage.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                        <TableCell className="text-right">{fmt(r.cash)}</TableCell>
                        <TableCell className="text-right">{fmt(r.debt)}</TableCell>
                      </TableRow>
                    ))}
                    {perShop.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Top debtors</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Owed</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {topDebtors.map((d) => (
                        <TableRow key={d.name}><TableCell>{d.name}</TableCell><TableCell className="text-right">{fmt(d.amount)}</TableCell></TableRow>
                      ))}
                      {topDebtors.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No outstanding debt</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Low stock</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Shop</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Threshold</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {lowStock.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell>{shops.find((s) => s.id === i.shop_id)?.name || i.shop_id}</TableCell>
                          <TableCell>{i.product} <span className="text-muted-foreground">({i.unit})</span></TableCell>
                          <TableCell className="text-right">{i.quantity}</TableCell>
                          <TableCell className="text-right">{i.threshold}</TableCell>
                        </TableRow>
                      ))}
                      {lowStock.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">All stock above threshold</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <SuperAdminManager admins={superAdmins} onChanged={fetchSuperAdmins} selfId={session.userId} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditTab logs={audit} shops={shops} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);
}

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <Card>
    <CardContent className="pt-4 pb-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </CardContent>
  </Card>
);

const SuperAdminManager: React.FC<{ admins: any[]; onChanged: () => void; selfId: string }> = ({ admins, onChanged, selfId }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('super-admin-manage', { body: { action: 'create', email, password } });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Super admin added' });
    setEmail(''); setPassword('');
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this super admin?')) return;
    const { data, error } = await supabase.functions.invoke('super-admin-manage', { body: { action: 'delete', user_id: id } });
    if (error || (data as any)?.error) {
      toast({ title: 'Failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    onChanged();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Super admin accounts</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add super admin</Button>
        </form>
        <Table>
          <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Created</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {admins.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email} {u.id === selfId && <span className="text-xs text-muted-foreground">(you)</span>}</TableCell>
                <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {u.id !== selfId && (
                    <Button variant="ghost" size="sm" onClick={() => remove(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {admins.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No super admins</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const AuditTab: React.FC<{ logs: any[]; shops: { id: string; name: string }[] }> = ({ logs, shops }) => {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const filtered = logs.filter(
    (l) =>
      (!actionFilter || l.action.toLowerCase().includes(actionFilter.toLowerCase())) &&
      (!entityFilter || l.entity.toLowerCase().includes(entityFilter.toLowerCase()))
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent sensitive activity</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Filter by action" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
          <Input placeholder="Filter by entity" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{l.actor} <span className="text-muted-foreground">({l.actor_role})</span></TableCell>
                <TableCell className="text-xs font-medium">{l.action}</TableCell>
                <TableCell className="text-xs">{l.entity}{l.entity_id ? `:${String(l.entity_id).slice(0,8)}` : ''}</TableCell>
                <TableCell className="text-xs">{shops.find((s) => s.id === l.shop_id)?.name || l.shop_id || '-'}</TableCell>
                <TableCell className="text-xs max-w-md truncate">{l.notes || (l.after ? JSON.stringify(l.after) : '')}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No activity recorded</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default SuperAdminDashboard;