import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, UserPlus, UserMinus, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ExportButtons from './ExportButtons';

const CHART_COLORS = [
  'hsl(142, 76%, 36%)',
  'hsl(79, 81%, 56%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 70%, 55%)',
];

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

  // All sales items with customer info
  const allSalesData = useMemo(() => {
    return sales.map(sale => ({
      customer_name: sale.customer_name || sale.customerName,
      sale_date: sale.sale_date || sale.date,
      shop_id: sale.shop_id,
      items: sale.items || [],
    }));
  }, [sales]);

  // Filter by shop
  const shopFilteredSales = useMemo(() => {
    if (shopFilter === 'all') return allSalesData;
    return allSalesData.filter(s => s.shop_id === shopFilter);
  }, [allSalesData, shopFilter]);

  // Get period date range
  const periodRange = useMemo(() => {
    if (periodType === 'month') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start, end };
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

  // Customers active in period
  const periodSales = useMemo(() => {
    return shopFilteredSales.filter(s => {
      const date = new Date(s.sale_date);
      return date >= periodRange.start && date <= periodRange.end;
    });
  }, [shopFilteredSales, periodRange]);

  // All-time customers (before end of period)
  const allTimeCustomers = useMemo(() => {
    return [...new Set(
      shopFilteredSales
        .filter(s => new Date(s.sale_date) <= periodRange.end)
        .map(s => s.customer_name)
        .filter(Boolean)
    )];
  }, [shopFilteredSales, periodRange]);

  // Customers active in period
  const activeCustomers = useMemo(() => {
    return [...new Set(periodSales.map(s => s.customer_name).filter(Boolean))];
  }, [periodSales]);

  // Previous period customers (for determining "new")
  const previousPeriodCustomers = useMemo(() => {
    return [...new Set(
      shopFilteredSales
        .filter(s => new Date(s.sale_date) < periodRange.start)
        .map(s => s.customer_name)
        .filter(Boolean)
    )];
  }, [shopFilteredSales, periodRange]);

  // New customers = active in period but never bought before
  const newCustomers = useMemo(() => {
    return activeCustomers.filter(c => !previousPeriodCustomers.includes(c));
  }, [activeCustomers, previousPeriodCustomers]);

  // Inactive customers = bought before but not in this period
  const inactiveCustomers = useMemo(() => {
    return previousPeriodCustomers.filter(c => !activeCustomers.includes(c));
  }, [previousPeriodCustomers, activeCustomers]);

  // Returning customers = bought before AND in this period
  const returningCustomers = useMemo(() => {
    return activeCustomers.filter(c => previousPeriodCustomers.includes(c));
  }, [activeCustomers, previousPeriodCustomers]);

  // Top customers by quantity
  const topCustomers = useMemo(() => {
    const map: Record<string, { quantity: number; transactions: number; products: Set<string> }> = {};
    periodSales.forEach(sale => {
      const name = sale.customer_name;
      if (!name) return;
      if (!map[name]) map[name] = { quantity: 0, transactions: 0, products: new Set() };
      map[name].transactions += 1;
      sale.items.forEach((item: any) => {
        map[name].quantity += Number(item.quantity);
        map[name].products.add(item.product);
      });
    });
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        transactions: data.transactions,
        products: data.products.size,
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [periodSales]);

  // Monthly customer trend (for yearly view)
  const customerTrend = useMemo(() => {
    if (periodType !== 'year') return [];
    const months: Record<string, { active: Set<string>; new: Set<string> }> = {};
    const seenBefore = new Set<string>();

    // Sort sales by date
    const sorted = [...shopFilteredSales]
      .filter(s => String(new Date(s.sale_date).getFullYear()) === selectedYear)
      .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());

    // Track all customers before this year
    shopFilteredSales
      .filter(s => new Date(s.sale_date).getFullYear() < Number(selectedYear))
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
    return monthOrder
      .filter(m => months[m])
      .map(month => ({
        month,
        active: months[month].active.size,
        new: months[month].new.size,
      }));
  }, [shopFilteredSales, periodType, selectedYear]);

  // Available years
  const availableYears = useMemo(() => {
    const years = [...new Set(allSalesData.map(s => String(new Date(s.sale_date).getFullYear())))];
    return years.sort().reverse();
  }, [allSalesData]);

  // Customer status distribution for pie chart
  const customerDistribution = [
    { name: 'New', value: newCustomers.length, color: CHART_COLORS[0] },
    { name: 'Returning', value: returningCustomers.length, color: CHART_COLORS[1] },
    { name: 'Inactive', value: inactiveCustomers.length, color: CHART_COLORS[5] },
  ].filter(d => d.value > 0);

  const chartConfig = {
    active: { label: 'Active Customers', color: CHART_COLORS[0] },
    new: { label: 'New Customers', color: CHART_COLORS[1] },
    quantity: { label: 'Quantity', color: CHART_COLORS[0] },
  };

  const pieConfig: Record<string, { label: string; color: string }> = {};
  customerDistribution.forEach(d => {
    pieConfig[d.name] = { label: d.name, color: d.color };
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Analytics Filters
          </CardTitle>
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
                    {availableYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {periodType === 'custom' && (
              <>
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(shop => (
                    <SelectItem key={shop.shop_id} value={shop.shop_id}>{shop.shop_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Customers</p>
                <p className="text-3xl font-bold text-foreground">{activeCustomers.length}</p>
              </div>
              <Users className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-awesome/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">New Customers</p>
                <p className="text-3xl font-bold text-green-awesome">{newCustomers.length}</p>
              </div>
              <UserPlus className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Returning</p>
                <p className="text-3xl font-bold text-foreground">{returningCustomers.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Inactive</p>
                <p className="text-3xl font-bold text-destructive">{inactiveCustomers.length}</p>
                <p className="text-xs text-muted-foreground">bought before, not this period</p>
              </div>
              <UserMinus className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Customer Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {customerDistribution.length > 0 ? (
              <ChartContainer config={pieConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={customerDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                    fontSize={12}
                  >
                    {customerDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Top Customers Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Customers by Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={topCustomers.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="quantity" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Customer Trend (yearly view) */}
        {periodType === 'year' && customerTrend.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Monthly Customer Activity ({selectedYear})</CardTitle>
            </CardHeader>
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

      {/* New Customers List */}
      {newCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-awesome" />
              New Customers This Period ({newCustomers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {newCustomers.map(customer => (
                <Badge key={customer} variant="secondary" className="bg-green-awesome/10 text-green-awesome border-green-awesome/20">
                  {customer}
                </Badge>
              ))}
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
              {inactiveCustomers.map(customer => (
                <Badge key={customer} variant="outline" className="border-destructive/30 text-destructive">
                  {customer}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Quantity</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Products Bought</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map(customer => (
                <TableRow key={customer.name}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    {newCustomers.includes(customer.name) ? (
                      <Badge className="bg-green-awesome text-green-awesome-foreground">New</Badge>
                    ) : (
                      <Badge variant="secondary">Returning</Badge>
                    )}
                  </TableCell>
                  <TableCell>{customer.quantity.toLocaleString()}</TableCell>
                  <TableCell>{customer.transactions}</TableCell>
                  <TableCell>{customer.products}</TableCell>
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
