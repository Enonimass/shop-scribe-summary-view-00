import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LogOut, Truck, Shield, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import DeliveryNoteManager from './logistics/DeliveryNoteManager';
import MovementReport from './logistics/MovementReport';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';

const LogisticsDashboard = () => {
  const { profile, logout } = useAuth();
  const [shops, setShops] = useState<{ shop_id: string; shop_name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('shop_id, shop_name').eq('role', 'seller');
      const unique: { shop_id: string; shop_name: string }[] = [];
      (data || []).forEach((p: any) => {
        if (p.shop_id && !unique.find(u => u.shop_id === p.shop_id)) {
          unique.push({ shop_id: p.shop_id, shop_name: p.shop_name || p.shop_id });
        }
      });
      setShops(unique);
    })();
  }, []);

  if (!profile || profile.role !== 'logistics') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-5 w-5" /> Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
            <Button onClick={logout} className="w-full mt-4">
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <img src={kimpFeedsLogo} alt="Kimp Feeds" className="h-10 w-10 rounded-lg object-cover" />
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Kimp Feeds Logistics</h1>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3" /> Logistics Dashboard
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-muted-foreground">Welcome, {profile.display_name}</span>
              <Button onClick={logout} variant="outline" size="sm" className="flex items-center gap-2">
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="deliveries" className="space-y-6">
          <TabsList>
            <TabsTrigger value="deliveries" className="flex items-center gap-1">
              <Truck className="h-4 w-4" /> Delivery Notes
            </TabsTrigger>
            <TabsTrigger value="movement" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" /> Movement Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deliveries">
            <DeliveryNoteManager shops={shops} canCreate={true} />
          </TabsContent>

          <TabsContent value="movement">
            <MovementReport shops={shops} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LogisticsDashboard;
