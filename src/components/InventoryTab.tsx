import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Package, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UnitConverter from './UnitConverter';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
  desired_quantity: number;
  shop_id: string;
}

const availableProducts = [
  'High yield',
  'Super dairy',
  'Calf starter',
  'Young stock',
  'Sow weaner',
  'Pig finisher',
  'Pig grower',
  'Pig starter',
  'Chick mash',
  'Kienyeji mash',
  'Layer mash',
  'Layers mix',
  'Dog meal',
  'Rabbit',
  'Maize germ',
  'Poland wheatbran'
];

const InventoryTab = ({ shopId }: { shopId: string }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('bags');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (shopId) {
      fetchInventory();
    }
  }, [shopId]);

  useEffect(() => {
    // Set up real-time subscription
    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          fetchInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  const fetchInventory = async () => {
    if (!shopId) return;
    
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory",
        variant: "destructive",
      });
    } else {
      setInventory(data || []);
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct || !newQuantity || !shopId) return;

    setLoading(true);

    const existingItem = inventory.find(item => item.product === newProduct);
    
    if (existingItem) {
      // Update existing item
      const { error } = await supabase
        .from('inventory')
        .update({ 
          quantity: existingItem.quantity + parseInt(newQuantity),
          unit: newUnit
        })
        .eq('id', existingItem.id);

      if (error) {
        console.error('Error updating inventory:', error);
        toast({
          title: "Error",
          description: "Failed to update stock",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Stock Updated",
          description: `Added ${newQuantity} ${newUnit} of ${newProduct}`,
        });
      }
    } else {
      // Add new item
      const { error } = await supabase
        .from('inventory')
        .insert({
          shop_id: shopId,
          product: newProduct,
          quantity: parseInt(newQuantity),
          unit: newUnit,
          threshold: 15,
          desired_quantity: 25
        });

      if (error) {
        console.error('Error adding inventory:', error);
        toast({
          title: "Error",
          description: "Failed to add product",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Product Added",
          description: `${newProduct} added to inventory`,
        });
      }
    }

    setNewProduct('');
    setNewQuantity('');
    setShowAddForm(false);
    setLoading(false);
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.threshold);

  const calculateQuantityToAdd = (currentQuantity: number, desiredQuantity: number) => {
    const quantityToAdd = desiredQuantity - currentQuantity;
    return quantityToAdd > 0 ? quantityToAdd : 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory Management</h2>
          <p className="text-gray-600">Track your products and stock levels</p>
        </div>
        <div className="flex space-x-2">
          <UnitConverter 
            inventory={inventory} 
            onConvert={fetchInventory}
            shopId={shopId}
          />
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Stock</span>
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-orange-800">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Low Stock Alert</span>
            </div>
            <p className="text-orange-700 mt-1">
              {lowStockItems.map(item => item.product).join(', ')} {lowStockItems.length === 1 ? 'is' : 'are'} running low
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Stock Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Package className="w-5 h-5" />
              <span>Add Stock</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddStock} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product">Product</Label>
                <Select value={newProduct} onValueChange={setNewProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map(product => (
                      <SelectItem key={product} value={product}>{product}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bags">Bags</SelectItem>
                    <SelectItem value="50kg">50 kg</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end space-x-2">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Adding...' : 'Add'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Desired Quantity</TableHead>
                <TableHead>Quantity to Add</TableHead>
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
                    {calculateQuantityToAdd(item.quantity, item.desired_quantity) > 0 ? (
                      <span className="text-orange-600 font-medium">
                        {calculateQuantityToAdd(item.quantity, item.desired_quantity)}
                      </span>
                    ) : (
                      <span className="text-green-600">-</span>
                    )}
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryTab;