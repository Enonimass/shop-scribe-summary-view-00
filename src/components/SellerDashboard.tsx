
import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InventoryTab from './InventoryTab';
import SalesTab from './SalesTab';
import { LogOut, Store, User } from 'lucide-react';

const SellerDashboard = () => {
  const { profile, logout } = useAuth();

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
          <TabsList className="grid w-full grid-cols-2 max-w-md bg-white/80 backdrop-blur-sm">
            <TabsTrigger value="inventory" className="flex items-center space-x-2">
              <span>Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center space-x-2">
              <span>Sales</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <InventoryTab shopId={profile?.shop_id || ''} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesTab shopId={profile?.shop_id || ''} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SellerDashboard;
