
import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogOut, Shield, Users, Store, BarChart3 } from 'lucide-react';

const shops = [
  { id: 'kiambu', name: 'Kiambu Shop' },
  { id: 'nakuru', name: 'Nakuru Shop' },
];

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [selectedShop, setSelectedShop] = useState('kiambu');

  const getShopData = (shopId: string, dataType: 'inventory' | 'sales') => {
    const data = localStorage.getItem(`${dataType}_${shopId}`);
    return data ? JSON.parse(data) : [];
  };

  const inventory = getShopData(selectedShop, 'inventory');
  const sales = getShopData(selectedShop, 'sales');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-500">System Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{user?.username}</span>
              </div>
              <Button 
                variant="outline" 
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
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            <Store className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Select Shop:</span>
            <Select value={selectedShop} onValueChange={setSelectedShop}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shops.map(shop => (
                  <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Products</p>
                      <p className="text-2xl font-bold">{inventory.length}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Sales</p>
                      <p className="text-2xl font-bold">{sales.length}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                      <p className="text-2xl font-bold">
                        {inventory.filter((item: any) => item.quantity <= item.threshold).length}
                      </p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Active Shops</p>
                      <p className="text-2xl font-bold">{shops.length}</p>
                    </div>
                    <Store className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle>Inventory - {shops.find(s => s.id === selectedShop)?.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Target Quantity</TableHead>
                      <TableHead>Quantity to Add</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((item: any) => {
                      const targetQuantity = item.threshold * 2;
                      const quantityToAdd = Math.max(0, targetQuantity - item.quantity);
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.threshold}</TableCell>
                          <TableCell>{targetQuantity}</TableCell>
                          <TableCell className={quantityToAdd > 0 ? "text-orange-600 font-medium" : "text-gray-500"}>
                            {quantityToAdd}
                          </TableCell>
                          <TableCell>
                            {item.quantity <= item.threshold ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                In Stock
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card>
              <CardHeader>
                <CardTitle>Sales Records - {shops.find(s => s.id === selectedShop)?.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Total Items</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale: any) => {
                      // Handle both new multi-item sales and legacy single-item sales
                      const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
                      
                      return (
                        <TableRow key={sale.id}>
                          <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{sale.customerName}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {items.map((item: any, index: number) => (
                                <div key={index} className="text-sm">
                                  <span className="font-medium">{item.product}</span>
                                  <span className="text-gray-600 ml-2">
                                    {item.quantity} {item.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{totalQuantity}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>kiambu_seller</TableCell>
                      <TableCell>Seller</TableCell>
                      <TableCell>Kiambu Shop</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>nakuru_seller</TableCell>
                      <TableCell>Seller</TableCell>
                      <TableCell>Nakuru Shop</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>admin</TableCell>
                      <TableCell>Admin</TableCell>
                      <TableCell>All Shops</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Admin
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
