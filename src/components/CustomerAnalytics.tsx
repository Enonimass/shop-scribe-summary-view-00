import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, UserPlus, UserMinus, TrendingUp, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ExportButtons from './ExportButtons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

const CHART_COLORS = [
  'hsl(142, 76%, 36%)', 'hsl(79, 81%, 56%)', 'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)', 'hsl(280, 60%, 50%)', 'hsl(0, 70%, 55%)',
];

const toBagEquivalent = (quantity: number, unit: string): number => {
  if (unit === '50kg' || unit === '50kg Bags') return quantity * (5 / 7);
  if (unit === '35kg') return quantity * 0.5;
  return quantity;
};

interface CustomerAnalyticsProps {
  sales: any[];
  shops: { shop_id: string; shop_name: string }[];
}

const CustomerAnalytics: React.FC<CustomerAnalyticsProps> = ({ sales, shops }) => {
  const [periodType, setPeriodType] = useState<'month' | 'year' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [frequencyOpen, setFrequencyOpen] = useState(false);

  const allSalesData = useMemo(() => {
    return sales.map(sale => ({
      customer_name: sale.customer_name || sale.customerName,
      sale_date: sale.sale_date || sale.date,
      shop_id: sale.shop_id,
      items: sale.items || [],
    }));
  }, [sales]);

  const shopFilteredSales = useMemo(() => {
    if (shopFilter === 'all') return allSalesData;
    return allSalesData.filter(s => s.shop_id === shopFilter);
  }, [allSalesData, shopFilter]);

  const periodRange = useMemo(() => {
    if (periodType === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0) };
    }
    if (periodType === 'year') {
      const year = Number(selectedYear);
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
    }
    return {
      start: customFrom ? new Date(customFrom) : new Date(0),
      end: customTo ? new Date(customTo) : new Date(),
    };
  }, [periodType, selectedMonth, selectedYear, customFrom, customTo]);

  const periodSales = useMemo(() => {
    return shopFilteredSales.filter(s => {
      const date = new Date(s.sale_date);
      return date >= periodRange.start && date <= periodRange.end;
    });
  }, [shopFilteredSales, periodRange]);

  const allTimeCustomers = useMemo(() => {
    return [...new Set(shopFilteredSales.filter(s => new Date(s.sale_date) <= periodRange.end).map(s => s.customer_name).filter(Boolean))];
  }, [shopFilteredSales, periodRange]);

  const activeCustomers = useMemo(() => {
    return [...new Set(periodSales.map(s => s.customer_name).filter(Boolean))];
  }, [periodSales]);

  const previousPeriodCustomers = useMemo(() => {
    return [...new Set(shopFilteredSales.filter(s => new Date(s.sale_date) < periodRange.start).map(s => s.customer_name).filter(Boolean))];
  }, [shopFilteredSales, periodRange]);

  const newCustomers = useMemo(() => activeCustomers.filter(c => !previousPeriodCustomers.includes(c)), [activeCustomers, previousPeriodCustomers]);
  const inactiveCustomers = useMemo(() => previousPeriodCustomers.filter(c => !activeCustomers.includes(c)), [previousPeriodCustomers, activeCustomers]);
  const returningCustomers = useMemo(() => activeCustomers.filter(c => previousPeriodCustomers.includes(c)), [activeCustomers, previousPeriodCustomers]);

  // Top customers by quantity (bags)
  const topCustomers = useMemo(() => {
    const map: Record<string, { bags: number; transactions: number; products: Record<string, number> }> = {};
    periodSales.forEach(sale => {
      const name = sale.customer_name;
      if (!name) return;
      if (!map[name]) map[name] = { bags: 0, transactions: 0, products: {} };
      map[name].transactions += 1;
      sale.items.forEach((item: any) => {
        const bags = toBagEquivalent(Number(item.quantity), item.unit);
        map[name].bags += bags;
        const pKey = item.product;
        map[name].products[pKey] = (map[name].products[pKey] || 0) + bags;
      });
    });
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        bags: Math.round(data.bags * 100) / 100,
        transactions: data.transactions,
        productCount: Object.keys(data.products).length,
        products: data.products,
      }))
      .sort((a, b) => b.bags - a.bags);
  }, [periodSales]);

  // Weekly frequency analysis
  const weeklyFrequency = useMemo(() => {
    const getWeekOfMonth = (date: Date) => Math.ceil(date.getDate() / 7);
    const customerWeeks: Record<string, Record<string, { bags: number; products: Record<string, number> }>> = {};

    periodSales.forEach(sale => {
      const name = sale.customer_name;
      if (!name) return;
      const date = new Date(sale.sale_date);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const weekNum = getWeekOfMonth(date);
      const weekKey = `${monthKey} W${weekNum}`;

      if (!customerWeeks[name]) customerWeeks[name] = {};
      if (!customerWeeks[name][weekKey]) customerWeeks[name][weekKey] = { bags: 0, products: {} };

      sale.items.forEach((item: any) => {
        const bags = toBagEquivalent(Number(item.quantity), item.unit);
        customerWeeks[name][weekKey].bags += bags;
        customerWeeks[name][weekKey].products[item.product] = (customerWeeks[name][weekKey].products[item.product] || 0) + bags;
      });
    });

    // Get all week keys sorted
    const allWeeks = new Set<string>();
    Object.values(customerWeeks).forEach(weeks => Object.keys(weeks).forEach(w => allWeeks.add(w)));
    const sortedWeeks = [...allWeeks].sort((a, b) => {
      const parseWeek = (w: string) => {
        const parts = w.split(' W');
        const d = new Date(parts[0] + ' 1, 20' + parts[0].split("'")[1]);
        return d.getTime() + Number(parts[1]) * 7;
      };
      return parseWeek(a) - parseWeek(b);
    });

    return { customerWeeks, sortedWeeks };
  }, [periodSales]);

  // Monthly customer trend (yearly)
  const customerTrend = useMemo(() => {
    if (periodType !== 'year') return [];
    const months: Record<string, { active: Set<string>; new: Set<string> }> = {};
    const seenBefore = new Set<string>();
    const sorted = [...shopFilteredSales]
      .filter(s => String(new Date(s.sale_date).getFullYear()) === selectedYear)
      .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());
    shopFilteredSales.filter(s => new Date(s.sale_date).getFullYear() < Number(selectedYear))
      .forEach(s => { if (s.customer_name) seenBefore.add(s.customer_name); });
    const yearlySeenSoFar = new Set<string>();
    sorted.forEach(sale => {
      const date = new Date(sale.sale_date);
      const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
      if (!months[monthKey]) months[monthKey] = { active: new Set(), new: new Set() };
      if (sale.customer_name) {
        months[monthKey].active.add(sale.customer_name);
        if (!seenBefore.has(sale.customer_name) && !yearlySeenSoFar.has(sale.customer_name)) {
          months[monthKey].new.add(sale.customer_name);
        }
        yearlySeenSoFar.add(sale.customer_name);
      }
    });
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthOrder.filter(m => months[m]).map(month => ({
      month, active: months[month].active.size, new: months[month].new.size,
    }));
  }, [shopFilteredSales, periodType, selectedYear]);

  const availableYears = useMemo(() => {
    return [...new Set(allSalesData.map(s => String(new Date(s.sale_date).getFullYear())))].sort().reverse();
  }, [allSalesData]);

  const customerDistribution = [
    { name: 'New', value: newCustomers.length, color: CHART_COLORS[0] },
    { name: 'Returning', value: returningCustomers.length, color: CHART_COLORS[1] },
    { name: 'Inactive', value: inactiveCustomers.length, color: CHART_COLORS[5] },
  ].filter(d => d.value > 0);

  const chartConfig = {
    active: { label: 'Active Customers', color: CHART_COLORS[0] },
    new: { label: 'New Customers', color: CHART_COLORS[1] },
    quantity: { label: 'Quantity', color: CHART_COLORS[0] },
    bags: { label: 'Bags', color: CHART_COLORS[0] },
  };

  const pieConfig: Record<string, { label: string; color: string }> = {};
  customerDistribution.forEach(d => { pieConfig[d.name] = { label: d.name, color: d.color }; });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Customer Analytics Filters</CardTitle>
            <ExportButtons
              filename={`customer-analytics-${new Date().toISOString().split('T')[0]}`}
              getData={() => ({
                title: 'Customer Analytics Report',
                headers: ['Customer', 'Total Bags', 'Transactions', 'Products', 'Status'],
                rows: topCustomers.map(c => {
                  const status = newCustomers.includes(c.name) ? 'New' : inactiveCustomers.includes(c.name) ? 'Inactive' : 'Returning';
                  return [c.name, c.bags, c.transactions, c.productCount, status];
                }),
                summary: { 'Total Customers': allTimeCustomers.length, 'Active': activeCustomers.length, 'New': newCustomers.length, 'Returning': returningCustomers.length, 'Inactive': inactiveCustomers.length },
              })}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodType === 'month' && (
              <div className="space-y-2">
                <Label>Select Month</Label>
                <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </div>
            )}
            {periodType === 'year' && (
              <div className="space-y-2">
                <Label>Select Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableYears.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {periodType === 'custom' && (
              <>
                <div className="space-y-2"><Label>From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                <div className="space-y-2"><Label>To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
              </>
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
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-muted-foreground">Active Customers</p><p className="text-3xl font-bold text-foreground">{activeCustomers.length}</p></div><Users className="h-8 w-8 text-green-awesome" /></div></CardContent></Card>
        <Card className="border-green-awesome/30"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-muted-foreground">New Customers</p><p className="text-3xl font-bold text-green-awesome">{newCustomers.length}</p></div><UserPlus className="h-8 w-8 text-green-awesome" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-muted-foreground">Returning</p><p className="text-3xl font-bold text-foreground">{returningCustomers.length}</p></div><TrendingUp className="h-8 w-8 text-green-awesome" /></div></CardContent></Card>
        <Card className="border-destructive/30"><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-muted-foreground">Inactive</p><p className="text-3xl font-bold text-destructive">{inactiveCustomers.length}</p><p className="text-xs text-muted-foreground">bought before, not this period</p></div><UserMinus className="h-8 w-8 text-destructive" /></div></CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Customer Status Distribution</CardTitle></CardHeader>
          <CardContent>
            {customerDistribution.length > 0 ? (
              <ChartContainer config={pieConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie data={customerDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`} fontSize={12}>
                    {customerDistribution.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Top Customers by Bags</CardTitle></CardHeader>
          <CardContent>
            {topCustomers.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={topCustomers.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="bags" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        {periodType === 'year' && customerTrend.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-lg">Monthly Customer Activity ({selectedYear})</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={customerTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="active" stroke={CHART_COLORS[0]} strokeWidth={2} name="Active" />
                  <Line type="monotone" dataKey="new" stroke={CHART_COLORS[1]} strokeWidth={2} name="New" />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Customer Purchase Frequency */}
      <Card>
        <Collapsible open={frequencyOpen} onOpenChange={setFrequencyOpen}>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex justify-between items-center p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Customer Purchase Frequency ({topCustomers.length} customers)
                </CardTitle>
                {frequencyOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {weeklyFrequency.sortedWeeks.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Customer</TableHead>
                        <TableHead>Total Bags</TableHead>
                        <TableHead>Visits</TableHead>
                        {weeklyFrequency.sortedWeeks.map(w => (
                          <TableHead key={w} className="text-center min-w-[80px] text-xs">{w}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topCustomers.map(customer => {
                        const weeks = weeklyFrequency.customerWeeks[customer.name] || {};
                        const isExpanded = expandedCustomer === customer.name;
                        return (
                          <React.Fragment key={customer.name}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedCustomer(isExpanded ? null : customer.name)}
                            >
                              <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                <div className="flex items-center gap-1">
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  {customer.name}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold">{customer.bags}</TableCell>
                              <TableCell>{customer.transactions}</TableCell>
                              {weeklyFrequency.sortedWeeks.map(w => {
                                const weekData = weeks[w];
                                return (
                                  <TableCell key={w} className="text-center">
                                    {weekData ? (
                                      <Badge variant="secondary" className="text-xs">
                                        {(Math.round(weekData.bags * 100) / 100).toString()}
                                      </Badge>
                                    ) : <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={3 + weeklyFrequency.sortedWeeks.length} className="p-3">
                                  <div className="text-sm space-y-2">
                                    <p className="font-medium text-foreground">Products breakdown:</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                      {Object.entries(customer.products)
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([product, bags]) => (
                                          <div key={product} className="flex justify-between items-center bg-background rounded px-2 py-1 border">
                                            <span className="text-xs truncate mr-2">{product}</span>
                                            <Badge variant="outline" className="text-xs shrink-0">{(Math.round(bags * 100) / 100)} bags</Badge>
                                          </div>
                                        ))}
                                    </div>
                                    <p className="font-medium text-foreground mt-3">Weekly product details:</p>
                                    <div className="space-y-1">
                                      {weeklyFrequency.sortedWeeks.filter(w => weeks[w]).map(w => (
                                        <div key={w} className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs font-medium w-20">{w}:</span>
                                          {Object.entries(weeks[w].products).map(([p, b]) => (
                                            <Badge key={p} variant="secondary" className="text-xs">
                                              {p}: {(Math.round(b * 100) / 100)} bags
                                            </Badge>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : <div className="text-center py-8 text-muted-foreground">No data for this period</div>}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* New Customers List */}
      {newCustomers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5 text-green-awesome" />New Customers This Period ({newCustomers.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {newCustomers.map(customer => <Badge key={customer} variant="secondary" className="bg-green-awesome/10 text-green-awesome border-green-awesome/20">{customer}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inactive Customers List */}
      {inactiveCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-destructive" />
              Inactive Customers ({inactiveCustomers.length})
              <span className="text-sm font-normal text-muted-foreground">— bought before but not this period</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {inactiveCustomers.map(customer => <Badge key={customer} variant="outline" className="border-destructive/30 text-destructive">{customer}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Customers Table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Customer Summary</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Bags</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map(customer => (
                <TableRow key={customer.name}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    {newCustomers.includes(customer.name) ? <Badge className="bg-green-awesome text-green-awesome-foreground">New</Badge> : <Badge variant="secondary">Returning</Badge>}
                  </TableCell>
                  <TableCell>{customer.bags}</TableCell>
                  <TableCell>{customer.transactions}</TableCell>
                  <TableCell>{customer.productCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerAnalytics;
