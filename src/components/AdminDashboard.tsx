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
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setProfiles(data);
      // Set "all" as default selected
      if (!selectedShop) {
        setSelectedShop('all');
      }
    }
  };

  const fetchShopData = async () => {
    if (selectedShop === 'all') {
      // Fetch all inventory data
      const { data: inventoryData } = await supabase
        .from('inventory')
        .select('*');
      
      if (inventoryData) setInventory(inventoryData);

      // Fetch all sales transactions
      const { data: transactions, error: transError } = await supabase
        .from('sales_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (transError) {
        console.error('Error fetching all sales transactions:', transError);
        return;
      }

      // Fetch all sales items for the transactions
      if (transactions && transactions.length > 0) {
        const transactionIds = transactions.map(t => t.id);
        const { data: salesData } = await supabase
          .from('sales_items')
          .select('*')
          .in('transaction_id', transactionIds);
        
        // Combine transactions with their items
        const salesWithItems = (transactions || []).map(transaction => ({
          ...transaction,
          items: (salesData || []).filter(item => item.transaction_id === transaction.id)
        }));

        setSales(salesWithItems);
      }
    } else {
      // Fetch inventory for selected shop
      const { data: inventoryData } = await supabase
        .from('inventory')
        .select('*')
        .eq('shop_id', selectedShop);
      
      if (inventoryData) setInventory(inventoryData);

      // Fetch sales transactions for selected shop
      const { data: transactions, error: transError } = await supabase
        .from('sales_transactions')
        .select('*')
        .eq('shop_id', selectedShop)
        .order('created_at', { ascending: false });

      if (transError) {
        console.error('Error fetching transactions:', transError);
        return;
      }

      // Fetch all sales items
      const { data: allItems, error: itemsError } = await supabase
        .from('sales_items')
        .select('*');

      if (itemsError) {
        console.error('Error fetching sales items:', itemsError);
        return;
      }

      // Combine transactions with their items
      const salesWithItems = (transactions || []).map(transaction => ({
        ...transaction,
        items: (allItems || []).filter(item => item.transaction_id === transaction.id)
      }));

      setSales(salesWithItems);
    }
  };

  // Get unique customers from existing sales
  const getUniqueCustomers = () => {
    const customers = sales.map(sale => sale.customer_name);
    return [...new Set(customers)].filter(Boolean).sort();
  };

  // Get unique products from inventory for filtering
  const getUniqueProducts = () => {
    return [...new Set(inventory.map(item => item.product))].sort();
  };

  const filteredAndSortedSales = [...sales]
    .filter(sale => {
      // Filter by search term
      if (salesSearchTerm) {
        const searchLower = salesSearchTerm.toLowerCase();
        const matchesCustomer = sale.customer_name && sale.customer_name.toLowerCase().includes(searchLower);
        const matchesProduct = sale.items && sale.items.some((item: any) => 
          item.product && item.product.toLowerCase().includes(searchLower)
        );
        if (!matchesCustomer && !matchesProduct) return false;
      }

      // Filter by customer
      if (filterCustomer !== 'all-customers' && sale.customer_name !== filterCustomer) {
        return false;
      }

      // Filter by product
      if (filterProduct !== 'all-products') {
        const hasProduct = sale.items && sale.items.some((item: any) => item.product === filterProduct);
        if (!hasProduct) return false;
      }

      // Filter by date range
      if (dateFrom && sale.sale_date < dateFrom) return false;
      if (dateTo && sale.sale_date > dateTo) return false;

      return true;
    })
    .sort((a, b) => {
      switch (salesSortBy) {
        case 'customer':
          return (a.customer_name || '').localeCompare(b.customer_name || '');
        case 'product':
          const aProduct = a.items?.[0]?.product || '';
          const bProduct = b.items?.[0]?.product || '';
          return aProduct.localeCompare(bProduct);
        case 'date':
        default:
          return new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime();
      }
    });

  const filteredTotalQuantity = filteredAndSortedSales.reduce((total, sale) => {
    if (sale.items) {
      return total + sale.items.reduce((itemSum: number, item: any) => {
        if (!filterProduct || filterProduct === 'all-products' || item.product === filterProduct) {
          return itemSum + item.quantity;
        }
        return itemSum;
      }, 0);
    }
    return total;
  }, 0);

  // Group sales by date for timeline view
  const groupedSales = (() => {
    const grouped: { [key: string]: any[] } = {};
    
    filteredAndSortedSales.forEach(sale => {
      const date = sale.sale_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(sale);
    });
    
    return Object.entries(grouped)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, sales]) => ({
        date,
        sales,
        totalQuantity: sales.reduce((sum, sale) => {
          if (sale.items) {
            return sum + sale.items.reduce((itemSum: number, item: any) => {
              if (!filterProduct || filterProduct === 'all-products' || item.product === filterProduct) {
                return itemSum + item.quantity;
              }
              return itemSum;
            }, 0);
          }
          return sum;
        }, 0),
        customers: [...new Set(sales.map(sale => sale.customer_name))]
      }));
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-lg border-b border-green-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-awesome rounded-lg flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-green-awesome-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Kimp Feeds Admin</h1>
                <p className="text-sm text-gray-500">System Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{profile?.username}</span>
              </div>
              <Button 
                variant="yellow-green" 
                size="sm" 
                onClick={logout}
                className="flex items-center space-x-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Shop Selector */}
        {shops.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center space-x-4">
              <Store className="w-5 h-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Select Shop:</span>
              <Select value={selectedShop} onValueChange={setSelectedShop}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select a shop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-semibold">All Shops (Aggregated)</SelectItem>
                  {shops.map(shop => (
                    <SelectItem key={shop.shop_id} value={shop.shop_id}>{shop.shop_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="manage">Manage Tables</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{inventory.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {selectedShop === 'all' ? 'Across all shops' : 'In selected shop'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{sales.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {selectedShop === 'all' ? 'Across all shops' : 'This shop'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                  <Store className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {inventory.filter(item => item.quantity <= item.threshold).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Need restocking
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Shops</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{shops.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Total registered
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Management</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Desired Qty</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                      {inventory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.threshold}</TableCell>
                          <TableCell>{item.desired_quantity}</TableCell>
                          <TableCell>
                            {selectedShop === 'all' ? 
                              (shops.find(s => s.shop_id === item.shop_id)?.shop_name || item.shop_id)
                              : 'Current Shop'
                            }
                          </TableCell>
                          <TableCell>
                            <span className={item.quantity <= item.threshold ? 'px-2 py-1 rounded-full text-xs bg-red-100 text-red-800' : 'px-2 py-1 rounded-full text-xs bg-green-100 text-green-800'}>
                              {item.quantity <= item.threshold ? 'Low Stock' : 'In Stock'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <CardTitle>Sales Reports</CardTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <div>
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search customer or product..."
                        value={salesSearchTerm}
                        onChange={(e) => setSalesSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Filter by Product</Label>
                    <Select value={filterProduct} onValueChange={setFilterProduct}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-products">All Products</SelectItem>
                        {getUniqueProducts().map(product => (
                          <SelectItem key={product} value={product}>{product}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Filter by Customer</Label>
                    <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-customers">All Customers</SelectItem>
                        {getUniqueCustomers().map(customer => (
                          <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>View Mode</Label>
                    <Select value={viewMode} onValueChange={(value: 'table' | 'timeline') => setViewMode(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Table View</SelectItem>
                        <SelectItem value="timeline">Timeline View</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Filter Summary */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">
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
              </CardHeader>
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
                      )))}
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
                            <div className="text-sm text-gray-600">
                              {dateSales.length} sales • {totalQuantity} total items • {customers.length} customers
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="grid gap-2">
                            {dateSales.map((sale: any) => (
                              <div key={sale.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                <div>
                                  <span className="font-medium">{sale.customer_name}</span>
                                  <div className="text-sm text-gray-600">
                                    {sale.items ? 
                                      sale.items.map((item: any) => `${item.quantity} ${item.unit} ${item.product}`).join(', ')
                                      : 'No items'
                                    }
                                  </div>
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
