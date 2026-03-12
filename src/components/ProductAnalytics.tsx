import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, Package, BarChart3 } from 'lucide-react';

// Product categories
const PRODUCT_CATEGORIES: Record<string, string[]> = {
  'Dairy': ['Dairy Meal', 'Dairy Pellets'],
  'High Yield': ['Dairy Meal', 'Dairy Pellets'],
  'Supers': ['Broiler Starter', 'Broiler Finisher'],
  'Calf Starter': ['Calf Starter'],
  'Poultry': ['Layers Mash', 'Broiler Starter', 'Broiler Finisher'],
  'Swine / PG Feeds': ['Pig Grower'],
};

const CHART_COLORS = [
  'hsl(142, 76%, 36%)',
  'hsl(79, 81%, 56%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 70%, 55%)',
  'hsl(180, 60%, 45%)',
  'hsl(330, 60%, 50%)',
];

interface ProductAnalyticsProps {
  sales: any[];
  shops: { shop_id: string; shop_name: string }[];
  selectedShop: string;
  onShopChange: (shop: string) => void;
}

const ProductAnalytics: React.FC<ProductAnalyticsProps> = ({ sales, shops, selectedShop, onShopChange }) => {
  const [periodType, setPeriodType] = useState<'month' | 'year' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [shopFilter, setShopFilter] = useState('all-combined');

  // Get all items from sales
  const allItems = useMemo(() => {
    return sales.flatMap(sale => {
      const items = sale.items || [];
      return items.map((item: any) => ({
        ...item,
        sale_date: sale.sale_date || sale.date,
        shop_id: sale.shop_id,
        customer_name: sale.customer_name || sale.customerName,
      }));
    });
  }, [sales]);

  // Filter by shop
  const shopFilteredItems = useMemo(() => {
    if (shopFilter === 'all-combined' || shopFilter === 'all-separate') return allItems;
    return allItems.filter(item => item.shop_id === shopFilter);
  }, [allItems, shopFilter]);

  // Filter by period
  const periodFilteredItems = useMemo(() => {
    return shopFilteredItems.filter(item => {
      const date = new Date(item.sale_date);
      if (periodType === 'month') {
        const itemMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return itemMonth === selectedMonth;
      }
      if (periodType === 'year') {
        return String(date.getFullYear()) === selectedYear;
      }
      if (periodType === 'custom') {
        if (customFrom && date < new Date(customFrom)) return false;
        if (customTo && date > new Date(customTo)) return false;
        return true;
      }
      return true;
    });
  }, [shopFilteredItems, periodType, selectedMonth, selectedYear, customFrom, customTo]);

  // Filter by category/product
  const filteredItems = useMemo(() => {
    let items = periodFilteredItems;
    if (categoryFilter !== 'all') {
      const categoryProducts = PRODUCT_CATEGORIES[categoryFilter] || [];
      items = items.filter(item => categoryProducts.includes(item.product));
    }
    if (productFilter !== 'all') {
      items = items.filter(item => item.product === productFilter);
    }
    return items;
  }, [periodFilteredItems, categoryFilter, productFilter]);

  // Unique products in filtered data
  const uniqueProducts = useMemo(() => {
    return [...new Set(filteredItems.map(item => item.product))].sort();
  }, [filteredItems]);

  // All unique products for filter dropdown
  const allUniqueProducts = useMemo(() => {
    return [...new Set(allItems.map(item => item.product))].sort();
  }, [allItems]);

  // Available years
  const availableYears = useMemo(() => {
    const years = [...new Set(allItems.map(item => String(new Date(item.sale_date).getFullYear())))];
    return years.sort().reverse();
  }, [allItems]);

  // Sales by product (bar chart)
  const salesByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    filteredItems.forEach(item => {
      map[item.product] = (map[item.product] || 0) + Number(item.quantity);
    });
    return Object.entries(map)
      .map(([product, quantity]) => ({ product, quantity }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [filteredItems]);

  // Sales trend over time (line chart)
  const salesTrend = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    filteredItems.forEach(item => {
      const date = new Date(item.sale_date);
      let key: string;
      if (periodType === 'year') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = item.sale_date;
      }
      if (!map[key]) map[key] = {};
      map[key][item.product] = (map[key][item.product] || 0) + Number(item.quantity);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, products]) => ({
        date: periodType === 'year'
          ? new Date(date + '-01').toLocaleDateString('en-US', { month: 'short' })
          : new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...products,
      }));
  }, [filteredItems, periodType]);

  // Per-shop comparison data
  const shopComparisonData = useMemo(() => {
    if (shopFilter !== 'all-separate') return [];
    const map: Record<string, Record<string, number>> = {};
    periodFilteredItems.forEach(item => {
      let items = [item];
      if (categoryFilter !== 'all') {
        const categoryProducts = PRODUCT_CATEGORIES[categoryFilter] || [];
        if (!categoryProducts.includes(item.product)) return;
      }
      if (productFilter !== 'all' && item.product !== productFilter) return;
      const shopName = shops.find(s => s.shop_id === item.shop_id)?.shop_name || item.shop_id;
      if (!map[item.product]) map[item.product] = {};
      map[item.product][shopName] = (map[item.product][shopName] || 0) + Number(item.quantity);
    });
    return Object.entries(map).map(([product, shopData]) => ({
      product,
      ...shopData,
    }));
  }, [periodFilteredItems, shopFilter, shops, categoryFilter, productFilter]);

  // Total quantity
  const totalQuantity = filteredItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalTransactions = new Set(filteredItems.map(item => item.sale_date + item.customer_name)).size;

  // Chart config
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    uniqueProducts.forEach((product, i) => {
      config[product] = { label: product, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return config;
  }, [uniqueProducts]);

  const shopNames = useMemo(() => shops.map(s => s.shop_name || s.shop_id), [shops]);
  const shopChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    shopNames.forEach((name, i) => {
      config[name] = { label: name, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return config;
  }, [shopNames]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product Analytics Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Period Type */}
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

            {/* Period Selector */}
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

            {/* Category Filter */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setProductFilter('all'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.keys(PRODUCT_CATEGORIES).map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Filter */}
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {allUniqueProducts.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Shop Filter */}
            <div className="space-y-2">
              <Label>Shop View</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-combined">All Shops (Combined)</SelectItem>
                  <SelectItem value="all-separate">All Shops (Compared)</SelectItem>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Quantity Sold</p>
                <p className="text-3xl font-bold text-foreground">{totalQuantity.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Products Tracked</p>
                <p className="text-3xl font-bold text-foreground">{uniqueProducts.length}</p>
              </div>
              <Package className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Transactions</p>
                <p className="text-3xl font-bold text-foreground">{totalTransactions}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Product - Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales by Product</CardTitle>
          </CardHeader>
          <CardContent>
            {salesByProduct.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={salesByProduct}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="product" angle={-30} textAnchor="end" height={80} fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="quantity" name="Quantity" radius={[4, 4, 0, 0]}>
                    {salesByProduct.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data for selected period</div>
            )}
          </CardContent>
        </Card>

        {/* Sales Trend - Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales Trend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {salesTrend.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {uniqueProducts.map((product, i) => (
                    <Line
                      key={product}
                      type="monotone"
                      dataKey={product}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data for selected period</div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Product Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {salesByProduct.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                  <Pie
                    data={salesByProduct}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="quantity"
                    nameKey="product"
                    label={({ product, quantity }) => `${product}: ${quantity}`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {salesByProduct.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data for selected period</div>
            )}
          </CardContent>
        </Card>

        {/* Shop Comparison */}
        {shopFilter === 'all-separate' && shopComparisonData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shop Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={shopChartConfig} className="h-[300px] w-full">
                <BarChart data={shopComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="product" angle={-30} textAnchor="end" height={80} fontSize={11} />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {shopNames.map((name, i) => (
                    <Bar key={name} dataKey={name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product Sales Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Total Quantity</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Avg per Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesByProduct.map(({ product, quantity }) => {
                const txCount = new Set(
                  filteredItems.filter(i => i.product === product).map(i => i.sale_date + i.customer_name)
                ).size;
                return (
                  <TableRow key={product}>
                    <TableCell className="font-medium">{product}</TableCell>
                    <TableCell>{quantity.toLocaleString()}</TableCell>
                    <TableCell>{txCount}</TableCell>
                    <TableCell>{txCount > 0 ? (quantity / txCount).toFixed(1) : '0'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductAnalytics;
