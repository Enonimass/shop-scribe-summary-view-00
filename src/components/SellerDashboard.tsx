
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InventoryTab from './InventoryTab';
import SalesTab from './SalesTab';
import ProductAnalytics from './ProductAnalytics';
import CustomerAnalytics from './CustomerAnalytics';
import CustomerManagement from './CustomerManagement';
import { LogOut, Store, User, UserCheck, BrainCircuit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SellerDashboard = () => {
  const { profile, logout } = useAuth();
  const [allSales, setAllSales] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState(profile?.shop_id || '');

  const shopId = profile?.shop_id || '';

  useEffect(() => {
    if (shopId) {
      fetchShopSales();
    }
  }, [shopId]);

  const fetchShopSales = async () => {
    if (!shopId) return;
    
    const { data: transactions } = await supabase
      .from('sales_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .order('sale_date', { ascending: false });

    const txIds = (transactions || []).map(t => t.id);
    let allItems: any[] = [];
    const chunkSize = 200;
    for (let i = 0; i < txIds.length; i += chunkSize) {
      const chunk = txIds.slice(i, i + chunkSize);
      const { data: itemsChunk } = await supabase
        .from('sales_items')
        .select('*')
        .in('transaction_id', chunk);
      allItems = allItems.concat(itemsChunk || []);
    }

    const salesWithItems = (transactions || []).map(transaction => ({
      id: transaction.id,
      items: allItems.filter(item => item.transaction_id === transaction.id),
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 py-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-awesome rounded-lg flex items-center justify-center shadow-lg">
                <Store className="w-6 h-6 text-green-awesome-foreground" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">{profile?.shop_name}</h1>
                <p className="text-xs sm:text-sm text-gray-500">Shop Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2">
                <User className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{profile?.username}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = '/ai-insights'}
                className="flex items-center space-x-2"
              >
                <BrainCircuit className="w-4 h-4" />
                <span className="hidden sm:inline">AI Insights</span>
              </Button>
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
          <TabsList className="flex flex-wrap w-full gap-1 h-auto p-1 bg-white/80 backdrop-blur-sm">
            <TabsTrigger value="inventory" className="text-xs sm:text-sm">Inventory</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs sm:text-sm">Sales</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs sm:text-sm">Customers</TabsTrigger>
            <TabsTrigger value="product-analytics" className="text-xs sm:text-sm">Product Analytics</TabsTrigger>
            <TabsTrigger value="customer-analytics" className="text-xs sm:text-sm">Customer Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <InventoryTab shopId={shopId} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesTab shopId={shopId} />
          </TabsContent>

          <TabsContent value="customers">
            <CustomerManagement shopId={shopId} />
          </TabsContent>

          <TabsContent value="product-analytics">
            <ProductAnalytics 
              sales={allSales} 
              shops={[{ shop_id: shopId, shop_name: profile?.shop_name || '' }]}
              selectedShop={selectedShop}
              onShopChange={setSelectedShop}
            />
          </TabsContent>

          <TabsContent value="customer-analytics">
            <CustomerAnalytics 
              sales={allSales} 
              shops={[{ shop_id: shopId, shop_name: profile?.shop_name || '' }]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SellerDashboard;
