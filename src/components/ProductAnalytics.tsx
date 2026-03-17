import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Package, BarChart3, GitCompareArrows, Filter, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import ExportButtons from './ExportButtons';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const CHART_COLORS = [
  'hsl(142, 76%, 36%)',
  'hsl(79, 81%, 56%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 50%)',
  'hsl(0, 70%, 55%)',
  'hsl(180, 60%, 45%)',
  'hsl(330, 60%, 50%)',
  'hsl(50, 80%, 50%)',
  'hsl(310, 70%, 45%)',
  'hsl(160, 60%, 40%)',
  'hsl(220, 70%, 60%)',
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
  const [dbCategories, setDbCategories] = useState<Record<string, string[]>>({});
  const [useLogScale, setUseLogScale] = useState(false);

  // Comparison chart state
  const [compareProducts, setCompareProducts] = useState<string[]>([]);
  const [compareShops, setCompareShops] = useState<string[]>([]);
  const [compareCategoryFilter, setCompareCategoryFilter] = useState('all');
  const [compareUseLog, setCompareUseLog] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      const { data: cats } = await supabase.from('product_categories').select('*') as any;
      const { data: items } = await supabase.from('product_category_items').select('*') as any;
      const map: Record<string, string[]> = {};
      (cats || []).forEach((cat: any) => {
        map[cat.name] = (items || []).filter((i: any) => i.category_id === cat.id).map((i: any) => i.product_name);
      });
      setDbCategories(map);
    };
    loadCategories();
  }, []);

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
      const categoryProducts = dbCategories[categoryFilter] || [];
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

  // Sales trend over time (line chart) - with combined total
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
      .map(([date, products]) => {
        const total = Object.values(products).reduce((s, v) => s + v, 0);
        return {
          date: periodType === 'year'
            ? new Date(date + '-01').toLocaleDateString('en-US', { month: 'short' })
            : new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          ...products,
          Total: total,
        };
      });
  }, [filteredItems, periodType]);

  // Per-shop comparison data
  const shopComparisonData = useMemo(() => {
    if (shopFilter !== 'all-separate') return [];
    const map: Record<string, Record<string, number>> = {};
    periodFilteredItems.forEach(item => {
      if (categoryFilter !== 'all') {
        const categoryProducts = dbCategories[categoryFilter] || [];
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

  // === COMPARISON CHART DATA ===
  // Products available for comparison (filtered by compare category)
  const compareAvailableProducts = useMemo(() => {
    if (compareCategoryFilter === 'all') return allUniqueProducts;
    const catProducts = dbCategories[compareCategoryFilter] || [];
    return allUniqueProducts.filter(p => catProducts.includes(p));
  }, [compareCategoryFilter, allUniqueProducts, dbCategories]);

  // Period-filtered items for comparison (uses same period filters)
  const comparePeriodItems = useMemo(() => {
    return allItems.filter(item => {
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
  }, [allItems, periodType, selectedMonth, selectedYear, customFrom, customTo]);

  // Build comparison trend data: each line = "Product - Shop" combo
  const comparisonTrendData = useMemo(() => {
    if (compareProducts.length === 0 && compareShops.length === 0) return { data: [], lines: [], config: {} };

    const activeProducts = compareProducts.length > 0 ? compareProducts : compareAvailableProducts;
    const activeShops = compareShops.length > 0 ? compareShops : shops.map(s => s.shop_id);

    // Filter items
    const items = comparePeriodItems.filter(item => {
      if (!activeProducts.includes(item.product)) return false;
      if (!activeShops.includes(item.shop_id)) return false;
      if (compareCategoryFilter !== 'all') {
        const catProducts = dbCategories[compareCategoryFilter] || [];
        if (!catProducts.includes(item.product)) return false;
      }
      return true;
    });

    // Build line keys
    const lineKeys: string[] = [];
    const multiProduct = activeProducts.length > 1;
    const multiShop = activeShops.length > 1;

    // Group by date, then by line key
    const map: Record<string, Record<string, number>> = {};
    items.forEach(item => {
      const date = new Date(item.sale_date);
      let dateKey: string;
      if (periodType === 'year') {
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        dateKey = item.sale_date;
      }

      const shopName = shops.find(s => s.shop_id === item.shop_id)?.shop_name || item.shop_id;
      let lineKey: string;
      if (multiProduct && multiShop) {
        lineKey = `${item.product} — ${shopName}`;
      } else if (multiShop) {
        lineKey = shopName;
      } else if (multiProduct) {
        lineKey = item.product;
      } else {
        lineKey = `${item.product} — ${shopName}`;
      }

      if (!lineKeys.includes(lineKey)) lineKeys.push(lineKey);
      if (!map[dateKey]) map[dateKey] = {};
      map[dateKey][lineKey] = (map[dateKey][lineKey] || 0) + Number(item.quantity);
    });

    const data = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date: periodType === 'year'
          ? new Date(date + '-01').toLocaleDateString('en-US', { month: 'short' })
          : new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...values,
      }));

    const config: Record<string, { label: string; color: string }> = {};
    lineKeys.forEach((key, i) => {
      config[key] = { label: key, color: CHART_COLORS[i % CHART_COLORS.length] };
    });

    return { data, lines: lineKeys, config };
  }, [comparePeriodItems, compareProducts, compareShops, compareCategoryFilter, shops, periodType, compareAvailableProducts, dbCategories]);

  // Total quantity
  const totalQuantity = filteredItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const totalTransactions = new Set(filteredItems.map(item => item.sale_date + item.customer_name)).size;

  // Chart config
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    uniqueProducts.forEach((product, i) => {
      config[product] = { label: product, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    config['Total'] = { label: 'Combined Total', color: 'hsl(0, 0%, 20%)' };
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

  const toggleCompareProduct = (product: string) => {
    setCompareProducts(prev => prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]);
  };
  const toggleCompareShop = (shopId: string) => {
    setCompareShops(prev => prev.includes(shopId) ? prev.filter(s => s !== shopId) : [...prev, shopId]);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Product Analytics Filters
              {(categoryFilter !== 'all' || productFilter !== 'all' || shopFilter !== 'all-combined') && (
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">Active</span>
              )}
            </span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Filters
                </CardTitle>
                <ExportButtons
              filename={`product-analytics-${new Date().toISOString().split('T')[0]}`}
              getData={() => ({
                title: 'Product Analytics Report',
                headers: ['Product', 'Total Quantity', 'Transactions', 'Avg per Transaction'],
                rows: salesByProduct.map(({ product, quantity }) => {
                  const txCount = new Set(
                    filteredItems.filter(i => i.product === product).map(i => i.sale_date + i.customer_name)
                  ).size;
                  return [product, quantity, txCount, txCount > 0 ? Number((quantity / txCount).toFixed(1)) : 0];
                }),
                summary: {
                  'Total Quantity Sold': totalQuantity.toLocaleString(),
                  'Products Tracked': uniqueProducts.length,
                  'Total Transactions': totalTransactions,
                  'Period': periodType === 'month' ? selectedMonth : periodType === 'year' ? selectedYear : `${customFrom} to ${customTo}`,
                },
              })}
            />
          </div>
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
                  {Object.keys(dbCategories).map(cat => (
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

        {/* Sales Trend - Line Chart with log scale toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Sales Trend Over Time</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="log-scale" className="text-xs text-muted-foreground">Log Scale</Label>
                <Switch id="log-scale" checked={useLogScale} onCheckedChange={setUseLogScale} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {salesTrend.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis
                    scale={useLogScale ? 'log' : 'auto'}
                    domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                    allowDataOverflow={useLogScale}
                    tickFormatter={(v) => typeof v === 'number' ? v.toLocaleString() : v}
                  />
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
                  <Line
                    key="Total"
                    type="monotone"
                    dataKey="Total"
                    stroke="hsl(0, 0%, 20%)"
                    strokeWidth={3}
                    strokeDasharray="6 3"
                    dot={{ r: 4 }}
                    connectNulls
                  />
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
                    label={({ product, quantity }) => {
                      const pct = ((quantity / totalQuantity) * 100).toFixed(1);
                      return `${product}: ${pct}%`;
                    }}
                    labelLine={true}
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

      {/* === COMPARISON CHART === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5" />
            Comparison Chart — Products & Shops
          </CardTitle>
          <p className="text-sm text-muted-foreground">Select products and shops below to compare them side by side on the same graph.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comparison filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category filter for comparison */}
            <div className="space-y-2">
              <Label>Filter by Category</Label>
              <Select value={compareCategoryFilter} onValueChange={(v) => { setCompareCategoryFilter(v); setCompareProducts([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.keys(dbCategories).map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Log scale for comparison */}
            <div className="flex items-center gap-2 pt-6">
              <Label htmlFor="compare-log" className="text-sm">Log Scale</Label>
              <Switch id="compare-log" checked={compareUseLog} onCheckedChange={setCompareUseLog} />
            </div>

            {/* Clear selections */}
            <div className="flex items-center gap-2 pt-6">
              <Button variant="outline" size="sm" onClick={() => { setCompareProducts([]); setCompareShops([]); }}>
                Clear Selections
              </Button>
            </div>
          </div>

          {/* Multi-select products */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Select Products ({compareProducts.length} selected)</Label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md bg-muted/30">
              {compareAvailableProducts.map(product => (
                <label
                  key={product}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                    compareProducts.includes(product) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  <Checkbox
                    checked={compareProducts.includes(product)}
                    onCheckedChange={() => toggleCompareProduct(product)}
                    className="h-3 w-3"
                  />
                  {product}
                </label>
              ))}
            </div>
          </div>

          {/* Multi-select shops */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Select Shops ({compareShops.length} selected)</Label>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
              {shops.map(shop => (
                <label
                  key={shop.shop_id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                    compareShops.includes(shop.shop_id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  <Checkbox
                    checked={compareShops.includes(shop.shop_id)}
                    onCheckedChange={() => toggleCompareShop(shop.shop_id)}
                    className="h-3 w-3"
                  />
                  {shop.shop_name}
                </label>
              ))}
            </div>
          </div>

          {/* Comparison line chart */}
          {comparisonTrendData.lines.length > 0 && comparisonTrendData.data.length > 0 ? (
            <ChartContainer config={comparisonTrendData.config} className="h-[400px] w-full">
              <LineChart data={comparisonTrendData.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis
                  scale={compareUseLog ? 'log' : 'auto'}
                  domain={compareUseLog ? ['auto', 'auto'] : [0, 'auto']}
                  allowDataOverflow={compareUseLog}
                  tickFormatter={(v) => typeof v === 'number' ? v.toLocaleString() : v}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {comparisonTrendData.lines.map((lineKey, i) => (
                  <Line
                    key={lineKey}
                    type="monotone"
                    dataKey={lineKey}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border rounded-md">
              Select products and/or shops above to see comparison lines
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="bg-card border-2 border-border">
        <CardHeader className="bg-muted/60">
          <CardTitle className="text-lg">Product Sales Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
                <TableHead className="font-bold">Product</TableHead>
                <TableHead className="font-bold">Total Quantity</TableHead>
                <TableHead className="font-bold">Transactions</TableHead>
                <TableHead className="font-bold">Avg per Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesByProduct.map(({ product, quantity }, idx) => {
                const txCount = new Set(
                  filteredItems.filter(i => i.product === product).map(i => i.sale_date + i.customer_name)
                ).size;
                return (
                  <TableRow key={product} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                    <TableCell className="font-semibold">{product}</TableCell>
                    <TableCell className="font-medium">{quantity.toLocaleString()}</TableCell>
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
