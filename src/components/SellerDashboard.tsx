
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InventoryTab from './InventoryTab';
import SalesTab from './SalesTab';
import ProductAnalytics from './ProductAnalytics';
import CustomerAnalytics from './CustomerAnalytics';
import { LogOut, Store, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SellerDashboard = () => {
  const { profile, logout } = useAuth();
  const [allSales, setAllSales] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  const shopId = profile?.shop_id || '';

  useEffect(() => {
    if (shopId) {
      fetchShopSales();
      // Create a minimal profiles entry for this shop
      if (profile) {
        setProfiles([profile]);
      }
    }
  }, [shopId, profile]);

  const fetchShopSales = async () => {
    if (!shopId) return;
    
    const { data: transactions } = await supabase
      .from('sales_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .order('sale_date', { ascending: false });

    const { data: allItems } = await supabase
      .from('sales_items')
      .select('*');

    const salesWithItems = (transactions || []).map(transaction => ({
      id: transaction.id,
      items: (allItems || []).filter(item => item.transaction_id === transaction.id),
      customerName: transaction.customer_name,
      date: transaction.sale_date,
      shop_id: transaction.shop_id
    }));

    setAllSales(salesWithItems);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-lg border-b border-green-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-awesome rounded-lg flex items-center justify-center shadow-lg">
                <Store className="w-6 h-6 text-green-awesome-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{profile?.shop_name}</h1>
                <p className="text-sm text-gray-500">Shop Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-gray-500" />
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
        <Tabs defaultValue="inventory" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl bg-white/80 backdrop-blur-sm">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="product-analytics">Product Analytics</TabsTrigger>
            <TabsTrigger value="customer-analytics">Customer Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <InventoryTab shopId={shopId} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesTab shopId={shopId} />
          </TabsContent>

          <TabsContent value="product-analytics">
            <ProductAnalytics 
              sales={allSales} 
              profiles={profiles} 
              selectedShop={shopId}
            />
          </TabsContent>

          <TabsContent value="customer-analytics">
            <CustomerAnalytics 
              sales={allSales} 
              profiles={profiles} 
              selectedShop={shopId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SellerDashboard;
