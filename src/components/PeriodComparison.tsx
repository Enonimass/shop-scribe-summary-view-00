import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GitCompareArrows, ArrowLeftRight } from 'lucide-react';
import ExportButtons from './ExportButtons';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

const PERIOD_COLORS = [
  'hsl(142, 76%, 36%)', 'hsl(30, 80%, 55%)', 'hsl(200, 70%, 50%)',
  'hsl(280, 60%, 50%)', 'hsl(0, 70%, 55%)', 'hsl(79, 81%, 56%)',
];

const toBagEquivalent = (quantity: number, unit: string): number => {
  if (unit === '50kg' || unit === '50kg Bags') return quantity * (5 / 7);
  if (unit === '35kg') return quantity * 0.5;
  return quantity;
};

interface PeriodRange {
  id: string;
  label: string;
  from: string;
  to: string;
}

interface PeriodComparisonProps {
  sales: any[];
  shops: { shop_id: string; shop_name: string }[];
}

const PeriodComparison: React.FC<PeriodComparisonProps> = ({ sales, shops }) => {
  const [periodMode, setPeriodMode] = useState<'custom' | 'weeks' | 'months' | 'years'>('custom');
  const [periods, setPeriods] = useState<PeriodRange[]>([
    { id: '1', label: 'Period 1', from: '', to: '' },
    { id: '2', label: 'Period 2', from: '', to: '' },
  ]);
  const [shopFilter, setShopFilter] = useState('all');
  const [quickMonth, setQuickMonth] = useState('');
  const [quickYear, setQuickYear] = useState(String(new Date().getFullYear()));
  const [quickWeekCount, setQuickWeekCount] = useState('2');
  const [quickMonthCount, setQuickMonthCount] = useState('3');

  const allSalesData = useMemo(() => {
    return sales.map(sale => ({
      customer_name: sale.customer_name || sale.customerName,
      sale_date: sale.sale_date || sale.date,
      shop_id: sale.shop_id,
      sale_type: sale.sale_type || sale.saleType || 'local',
      items: sale.items || [],
    }));
  }, [sales]);

  const filteredSales = useMemo(() => {
    if (shopFilter === 'all') return allSalesData;
    return allSalesData.filter(s => s.shop_id === shopFilter);
  }, [allSalesData, shopFilter]);

  const addPeriod = () => {
    const id = String(Date.now());
    setPeriods(prev => [...prev, { id, label: `Period ${prev.length + 1}`, from: '', to: '' }]);
  };

  const removePeriod = (id: string) => {
    if (periods.length <= 2) return;
    setPeriods(prev => prev.filter(p => p.id !== id));
  };

  const updatePeriod = (id: string, field: keyof PeriodRange, value: string) => {
    setPeriods(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const generateWeeklyPeriods = () => {
    const count = Number(quickWeekCount) || 2;
    const now = new Date();
    const newPeriods: PeriodRange[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const label = `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}-${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
      newPeriods.push({
        id: String(Date.now() + i),
        label,
        from: start.toISOString().split('T')[0],
        to: end.toISOString().split('T')[0],
      });
    }
    setPeriods(newPeriods);
  };

  const generateMonthlyPeriods = () => {
    const count = Number(quickMonthCount) || 3;
    const now = new Date();
    const newPeriods: PeriodRange[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      const label = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      newPeriods.push({
        id: String(Date.now() + i),
        label,
        from: monthDate.toISOString().split('T')[0],
        to: monthEnd.toISOString().split('T')[0],
      });
    }
    setPeriods(newPeriods);
  };

  const generateYearlyPeriods = () => {
    const currentYear = new Date().getFullYear();
    const newPeriods: PeriodRange[] = [];
    for (let i = 2; i >= 0; i--) {
      const year = currentYear - i;
      newPeriods.push({
        id: String(Date.now() + i),
        label: String(year),
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      });
    }
    setPeriods(newPeriods);
  };

  const validPeriods = periods.filter(p => p.from && p.to);

  // Compute per-period customer data
  const comparisonData = useMemo(() => {
    if (validPeriods.length < 2) return null;

    const periodCustomers: Record<string, Record<string, { bags: number; transactions: number; products: Record<string, number> }>> = {};
    const allCustomerNames = new Set<string>();

    validPeriods.forEach(period => {
      periodCustomers[period.id] = {};
      const periodStart = new Date(period.from);
      const periodEnd = new Date(period.to);
      periodEnd.setHours(23, 59, 59);

      filteredSales.forEach(sale => {
        const date = new Date(sale.sale_date);
        if (date < periodStart || date > periodEnd) return;
        const name = sale.customer_name;
        if (!name) return;
        allCustomerNames.add(name);

        if (!periodCustomers[period.id][name]) {
          periodCustomers[period.id][name] = { bags: 0, transactions: 0, products: {} };
        }
        periodCustomers[period.id][name].transactions += 1;
        sale.items.forEach((item: any) => {
          const bags = toBagEquivalent(Number(item.quantity), item.unit);
          periodCustomers[period.id][name].bags += bags;
          periodCustomers[period.id][name].products[item.product] =
            (periodCustomers[period.id][name].products[item.product] || 0) + bags;
        });
      });
    });

    // Build customer rows
    const customerRows = [...allCustomerNames].map(name => {
      const row: any = { name };
      let totalBags = 0;
      let appearedIn = 0;
      validPeriods.forEach(period => {
        const data = periodCustomers[period.id][name];
        row[`bags_${period.id}`] = data ? Math.round(data.bags * 100) / 100 : 0;
        row[`txn_${period.id}`] = data ? data.transactions : 0;
        if (data) {
          totalBags += data.bags;
          appearedIn++;
        }
      });
      row.totalBags = Math.round(totalBags * 100) / 100;
      row.appearedIn = appearedIn;
      row.isConsistent = appearedIn === validPeriods.length;
      return row;
    }).sort((a, b) => b.totalBags - a.totalBags);

    // Retention: who was in previous period but not latest
    const lastPeriod = validPeriods[validPeriods.length - 1];
    const prevPeriod = validPeriods[validPeriods.length - 2];
    const lastCustomers = new Set(Object.keys(periodCustomers[lastPeriod.id]));
    const prevCustomers = new Set(Object.keys(periodCustomers[prevPeriod.id]));

    const retained = [...prevCustomers].filter(c => lastCustomers.has(c));
    const lost = [...prevCustomers].filter(c => !lastCustomers.has(c));
    const gained = [...lastCustomers].filter(c => !prevCustomers.has(c));

    // Period totals
    const periodTotals = validPeriods.map(period => {
      const customers = Object.keys(periodCustomers[period.id]);
      const totalBags = customers.reduce((sum, c) => sum + periodCustomers[period.id][c].bags, 0);
      return {
        label: period.label,
        customers: customers.length,
        totalBags: Math.round(totalBags * 100) / 100,
        color: PERIOD_COLORS[validPeriods.indexOf(period) % PERIOD_COLORS.length],
      };
    });

    return { customerRows, retained, lost, gained, periodTotals, periodCustomers };
  }, [filteredSales, validPeriods]);

  const chartConfig: Record<string, { label: string; color: string }> = {};
  validPeriods.forEach((p, i) => {
    chartConfig[`bags_${p.id}`] = { label: p.label, color: PERIOD_COLORS[i % PERIOD_COLORS.length] };
  });

  const getExportData = () => {
    if (!comparisonData) return { title: 'Period Comparison', headers: [], rows: [] };
    const headers = ['Customer', ...validPeriods.map(p => `${p.label} (Bags)`), 'Total Bags', 'Periods Active', 'Consistent'];
    const rows = comparisonData.customerRows.map((r: any) => [
      r.name,
      ...validPeriods.map(p => r[`bags_${p.id}`]),
      r.totalBags,
      r.appearedIn,
      r.isConsistent ? 'Yes' : 'No',
    ]);
    const summary: Record<string, string | number> = {};
    comparisonData.periodTotals.forEach(pt => {
      summary[`${pt.label} Customers`] = pt.customers;
      summary[`${pt.label} Total Bags`] = pt.totalBags;
    });
    summary['Retained (last 2)'] = comparisonData.retained.length;
    summary['Lost (last 2)'] = comparisonData.lost.length;
    summary['Gained (last 2)'] = comparisonData.gained.length;
    return { title: 'Period Comparison Report', headers, rows, summary };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5" /> Period Comparison
            </CardTitle>
            <ExportButtons filename={`period-comparison-${new Date().toISOString().split('T')[0]}`} getData={getExportData} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Quick Setup</Label>
              <Select value={periodMode} onValueChange={(v: any) => {
                setPeriodMode(v);
                if (v === 'weeks') generateWeeklyPeriods();
                else if (v === 'months') generateMonthlyPeriods();
                else if (v === 'years') generateYearlyPeriods();
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Ranges</SelectItem>
                  <SelectItem value="weeks">Compare Weeks</SelectItem>
                  <SelectItem value="months">Compare Months</SelectItem>
                  <SelectItem value="years">Compare Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodMode === 'weeks' && (
              <div className="space-y-2">
                <Label>Number of weeks</Label>
                <div className="flex gap-2">
                  <Input type="number" min="2" max="12" value={quickWeekCount} onChange={e => setQuickWeekCount(e.target.value)} />
                  <Button size="sm" onClick={generateWeeklyPeriods}>Apply</Button>
                </div>
              </div>
            )}
            {periodMode === 'months' && (
              <div className="space-y-2">
                <Label>Number of months</Label>
                <div className="flex gap-2">
                  <Input type="number" min="2" max="12" value={quickMonthCount} onChange={e => setQuickMonthCount(e.target.value)} />
                  <Button size="sm" onClick={generateMonthlyPeriods}>Apply</Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(shop => <SelectItem key={shop.shop_id} value={shop.shop_id}>{shop.shop_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Period date inputs */}
          <div className="space-y-2">
            {periods.map((period, idx) => (
              <div key={period.id} className="flex items-end gap-2 flex-wrap" style={{ borderLeft: `3px solid ${PERIOD_COLORS[idx % PERIOD_COLORS.length]}`, paddingLeft: '8px' }}>
                <div className="space-y-1 flex-1 min-w-[100px]">
                  <Label className="text-xs">Label</Label>
                  <Input value={period.label} onChange={e => updatePeriod(period.id, 'label', e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1 flex-1 min-w-[130px]">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={period.from} onChange={e => updatePeriod(period.id, 'from', e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1 flex-1 min-w-[130px]">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={period.to} onChange={e => updatePeriod(period.id, 'to', e.target.value)} className="h-8 text-sm" />
                </div>
                {periods.length > 2 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePeriod(period.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addPeriod} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Add Period
            </Button>
          </div>
        </CardContent>
      </Card>

      {comparisonData && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {comparisonData.periodTotals.map((pt, i) => (
              <Card key={i} style={{ borderTopColor: pt.color, borderTopWidth: '3px' }}>
                <CardContent className="pt-4 pb-3 px-3">
                  <p className="text-xs font-medium text-muted-foreground truncate">{pt.label}</p>
                  <p className="text-xl font-bold">{pt.totalBags} <span className="text-xs font-normal text-muted-foreground">bags</span></p>
                  <p className="text-xs text-muted-foreground">{pt.customers} customers</p>
                </CardContent>
              </Card>
            ))}
            <Card className="border-green-awesome/30">
              <CardContent className="pt-4 pb-3 px-3">
                <p className="text-xs font-medium text-muted-foreground">Retained</p>
                <p className="text-xl font-bold text-green-awesome">{comparisonData.retained.length}</p>
                <p className="text-xs text-muted-foreground">came back</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="pt-4 pb-3 px-3">
                <p className="text-xs font-medium text-muted-foreground">Lost</p>
                <p className="text-xl font-bold text-destructive">{comparisonData.lost.length}</p>
                <p className="text-xs text-muted-foreground">didn't return</p>
              </CardContent>
            </Card>
          </div>

          {/* Bar chart comparing period totals */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Period Totals</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={comparisonData.periodTotals}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="totalBags" name="Total Bags" radius={[4, 4, 0, 0]}>
                    {comparisonData.periodTotals.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Comparison table */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Customer Comparison</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      {validPeriods.map((p, i) => (
                        <TableHead key={p.id} style={{ color: PERIOD_COLORS[i % PERIOD_COLORS.length] }}>{p.label}</TableHead>
                      ))}
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.customerRows.map((row: any) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        {validPeriods.map(p => (
                          <TableCell key={p.id}>
                            {row[`bags_${p.id}`] > 0 ? (
                              <span>{row[`bags_${p.id}`]} <span className="text-xs text-muted-foreground">({row[`txn_${p.id}`]})</span></span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="font-bold">{row.totalBags}</TableCell>
                        <TableCell>
                          {row.isConsistent ? (
                            <Badge className="bg-green-awesome text-green-awesome-foreground">Consistent</Badge>
                          ) : row.appearedIn === 1 ? (
                            <Badge variant="outline">Single period</Badge>
                          ) : (
                            <Badge variant="secondary">{row.appearedIn}/{validPeriods.length} periods</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Retention details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-awesome">Retained Customers ({comparisonData.retained.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {comparisonData.retained.map(c => <p key={c} className="text-sm">{c}</p>)}
                  {comparisonData.retained.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">Lost Customers ({comparisonData.lost.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {comparisonData.lost.map(c => <p key={c} className="text-sm">{c}</p>)}
                  {comparisonData.lost.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-600">New Customers ({comparisonData.gained.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {comparisonData.gained.map(c => <p key={c} className="text-sm">{c}</p>)}
                  {comparisonData.gained.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!comparisonData && validPeriods.length < 2 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ArrowLeftRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Set at least 2 periods with dates to compare</p>
            <p className="text-sm">Use the quick setup options or manually enter date ranges above</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PeriodComparison;
