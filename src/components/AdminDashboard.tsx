import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogOut, Shield, Users, Store, BarChart3, Search, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import UserManagement from './UserManagement';
import AdminTableEditor from './AdminTableEditor';
import { Label } from '@/components/ui/label';

const AdminDashboard = () => {
  const { profile, logout } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [salesSortBy, setSalesSortBy] = useState<'product' | 'customer' | 'date'>('date');
  const [salesSearchTerm, setSalesSearchTerm] = useState('');
  const [filterProduct, setFilterProduct] = useState('all-products');
  const [filterCustomer, setFilterCustomer] = useState('all-customers');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  // Get unique shops from profiles
  const shops = profiles
    .filter(p => p.role === 'seller' && p.shop_id)
    .reduce((acc, p) => {
      if (!acc.find(s => s.shop_id === p.shop_id)) {
        acc.push({ shop_id: p.shop_id, shop_name: p.shop_name || p.shop_id });
      }
      return acc;
    }, []);

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (selectedShop) {
      fetchShopData();
    }
  }, [selectedShop]);

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) {
      console.error('Error fetching profiles:', error);
    } else {
      setProfiles(data || []);
      // Auto-select first shop if available
      if (data && data.length > 0) {
        const firstShop = data.find(p => p.role === 'seller' && p.shop_id);
        if (firstShop && !selectedShop) {
          setSelectedShop(firstShop.shop_id);
        }
      }
    }
  };

  const fetchShopData = async () => {
    if (!selectedShop) return;

    try {
      let inventoryQuery;
      let salesQuery;

      if (selectedShop === 'all') {
        // Fetch all data across all shops
        inventoryQuery = supabase.from('inventory').select('*');
        salesQuery = supabase.from('sales').select('*');
      } else {
        // Fetch data for specific shop
        inventoryQuery = supabase
          .from('inventory')
          .select('*')
          .eq('shop_id', selectedShop);
        
        salesQuery = supabase
          .from('sales')
          .select('*')
          .eq('shop_id', selectedShop);
      }

      const [inventoryResult, salesResult] = await Promise.all([
        inventoryQuery,
        salesQuery
      ]);

      if (inventoryResult.error) {
        console.error('Error fetching inventory:', inventoryResult.error);
      } else {
        setInventory(inventoryResult.data || []);
      }

      if (salesResult.error) {
        console.error('Error fetching sales:', salesResult.error);
      } else {
        setSales(salesResult.data || []);
      }
    } catch (error) {
      console.error('Error fetching shop data:', error);
    }
  };

  // Get unique products and customers for filters
  const uniqueProducts = [...new Set(sales.flatMap(sale => 
    sale.items?.map(item => item.product) || []
  ))];
  
  const uniqueCustomers = [...new Set(sales.map(sale => sale.customer_name).filter(Boolean))];

  // Filter and sort sales data
  const filteredSales = sales.filter(sale => {
    const matchesSearch = !salesSearchTerm || 
      sale.customer_name?.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
      sale.items?.some(item => 
        item.product?.toLowerCase().includes(salesSearchTerm.toLowerCase())
      );

    const matchesProduct = filterProduct === 'all-products' || 
      sale.items?.some(item => item.product === filterProduct);

    const matchesCustomer = filterCustomer === 'all-customers' || 
      sale.customer_name === filterCustomer;

    const saleDate = new Date(sale.sale_date);
    const matchesDateFrom = !dateFrom || saleDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || saleDate <= new Date(dateTo);

    return matchesSearch && matchesProduct && matchesCustomer && matchesDateFrom && matchesDateTo;
  });

  const sortedSales = [...filteredSales].sort((a, b) => {
    switch (salesSortBy) {
      case 'product':
        const aProduct = a.items?.[0]?.product || '';
        const bProduct = b.items?.[0]?.product || '';
        return aProduct.localeCompare(bProduct);
      case 'customer':
        return (a.customer_name || '').localeCompare(b.customer_name || '');
      case 'date':
      default:
        return new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime();
    }
  });

  const filteredAndSortedSales = sortedSales;

  // Calculate total quantities for filtered sales
  const filteredTotalQuantity = filteredAndSortedSales.reduce((total, sale) => {
    return total + (sale.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0);
  }, 0);

  // Group sales by date for timeline view
  const groupedSales = filteredAndSortedSales.reduce((acc, sale) => {
    const date = new Date(sale.sale_date).toDateString();
    const existing = acc.find(g => g.date === date);
    
    if (existing) {
      existing.sales.push(sale);
      existing.totalQuantity += sale.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
      if (!existing.customers.includes(sale.customer_name)) {
        existing.customers.push(sale.customer_name);
      }
    } else {
      acc.push({
        date,
        sales: [sale],
        totalQuantity: sale.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
        customers: [sale.customer_name]
      });
    }
    return acc;
  }, [] as any[]);

  const clearAllFilters = () => {
    setSalesSearchTerm('');
    setFilterProduct('all-products');
    setFilterCustomer('all-customers');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = salesSearchTerm || filterProduct !== 'all-products' || 
    filterCustomer !== 'all-customers' || dateFrom || dateTo;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">You don't have permission to access this page.</p>
            <Button onClick={logout} className="w-full mt-4">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img 
                  src="/src/assets/kimp-feeds-logo.jpeg" 
                  alt="Kimp Feeds" 
                  className="h-8 w-8 rounded"
                />
                <h1 className="text-2xl font-bold text-gray-900">Kimp Feeds Admin</h1>
              </div>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="h-4 w-4" />
                <span>Administrator Dashboard</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Welcome, {profile.display_name}</span>
              <Button 
                onClick={logout} 
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Sales Overview
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Table Management
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Shop Selection</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedShop} onValueChange={setSelectedShop}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a shop to view data" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shops (Aggregated)</SelectItem>
                      {shops.map((shop) => (
                        <SelectItem key={shop.shop_id} value={shop.shop_id}>
                          {shop.shop_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {selectedShop && (
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Sales Data</CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant={viewMode === 'table' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('table')}
                        >
                          Table View
                        </Button>
                        <Button
                          variant={viewMode === 'timeline' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setViewMode('timeline')}
                        >
                          Timeline View
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Search and Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="space-y-2">
                        <Label htmlFor="search">Search</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                          <Input
                            id="search"
                            placeholder="Search sales..."
                            value={salesSearchTerm}
                            onChange={(e) => setSalesSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="product-filter">Product</Label>
                        <Select value={filterProduct} onValueChange={setFilterProduct}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all-products">All Products</SelectItem>
                            {uniqueProducts.map((product) => (
                              <SelectItem key={product} value={product}>
                                {product}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="customer-filter">Customer</Label>
                        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all-customers">All Customers</SelectItem>
                            {uniqueCustomers.map((customer) => (
                              <SelectItem key={customer} value={customer}>
                                {customer}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sort">Sort By</Label>
                        <Select value={salesSortBy} onValueChange={(value) => setSalesSortBy(value as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="product">Product</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date-from">From Date</Label>
                        <Input
                          id="date-from"
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date-to">To Date</Label>
                        <Input
                          id="date-to"
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                        />
                      </div>

                      <div className="flex items-end">
                        <Button 
                          variant="outline" 
                          onClick={clearAllFilters}
                          disabled={!hasActiveFilters}
                          className="w-full"
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </div>

                    {/* Filter Summary */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="text-sm text-green-800">
                        Showing <span className="font-semibold text-gray-900">{filteredAndSortedSales.length}</span> sales
                        {filterProduct !== 'all-products' && (
                          <span> • Product: <span className="font-semibold">{filterProduct}</span></span>
                        )}
                        {filterCustomer !== 'all-customers' && (
                          <span> • Customer: <span className="font-semibold">{filterCustomer}</span></span>
                        )}
                        {(dateFrom || dateTo) && (
                          <span> • Date: {dateFrom || 'any'} to {dateTo || 'any'}</span>
                        )}
                        <span> • Total Quantity: <span className="font-semibold">{filteredTotalQuantity}</span></span>
                      </div>
                    </div>
                  </CardContent>
                  <CardContent>
                    {viewMode === 'table' ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Products</TableHead>
                            <TableHead>Total Quantity</TableHead>
                            {selectedShop === 'all' && <TableHead>Shop</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAndSortedSales.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell>{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                              <TableCell>{sale.customer_name}</TableCell>
                              <TableCell>
                                {sale.items?.map((item: any) => (
                                  <div key={item.id} className="text-sm">
                                    {item.quantity} {item.unit} {item.product}
                                  </div>
                                )) || 'No items'}
                              </TableCell>
                              <TableCell>
                                {sale.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0}
                              </TableCell>
                              {selectedShop === 'all' && (
                                <TableCell>{sale.shop_id}</TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="space-y-4">
                        {groupedSales.map(({ date, sales: dateSales, totalQuantity, customers }) => (
                          <Card key={date} className="border-l-4 border-l-green-500">
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <CardTitle className="text-lg">
                                  {new Date(date).toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })}
                                </CardTitle>
                                <div className="text-right text-sm text-gray-600">
                                  <div>{dateSales.length} sales</div>
                                  <div>{totalQuantity} total items</div>
                                  <div>{customers.filter(c => c).length} customers</div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                {dateSales.map((sale) => (
                                  <div key={sale.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <div>
                                      <div className="font-medium">{sale.customer_name}</div>
                                      <div className="text-sm text-gray-600">
                                        {sale.items?.map((item: any) => `${item.quantity} ${item.unit} ${item.product}`).join(', ') || 'No items'}
                                      </div>
                                      {selectedShop === 'all' && (
                                        <div className="text-xs text-gray-500">Shop: {sale.shop_id}</div>
                                      )}
                                    </div>
                                    <div className="text-sm font-medium">
                                      {sale.items ? sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0) : 0} items
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedShop ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{new Date(item.updated_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Please select a shop to view inventory data.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <UserManagement profiles={profiles} onProfilesUpdate={fetchProfiles} />
          </TabsContent>

          <TabsContent value="manage">
            <AdminTableEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;