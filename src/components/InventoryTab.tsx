
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Package, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
}

const availableProducts = [
  'Dairy Meal',
  'Layers Mash',
  'Broiler Starter',
  'Broiler Finisher',
  'Pig Grower',
  'Calf Starter',
  'Dairy Pellets'
];

const InventoryTab = ({ shopId }: { shopId: string }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('bags');

  useEffect(() => {
    // Load inventory from localStorage
    const savedInventory = localStorage.getItem(`inventory_${shopId}`);
    if (savedInventory) {
      setInventory(JSON.parse(savedInventory));
    } else {
      // Initialize with demo data
      const demoInventory = [
        { id: '1', product: 'Dairy Meal', quantity: 50, unit: 'bags', threshold: 10 },
        { id: '2', product: 'Layers Mash', quantity: 8, unit: 'bags', threshold: 15 },
        { id: '3', product: 'Broiler Starter', quantity: 25, unit: 'kgs', threshold: 20 },
      ];
      setInventory(demoInventory);
      localStorage.setItem(`inventory_${shopId}`, JSON.stringify(demoInventory));
    }
  }, [shopId]);

  const saveInventory = (newInventory: InventoryItem[]) => {
    localStorage.setItem(`inventory_${shopId}`, JSON.stringify(newInventory));
    setInventory(newInventory);
  };

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct || !newQuantity) return;

    const existingItem = inventory.find(item => item.product === newProduct);
    
    if (existingItem) {
      const updatedInventory = inventory.map(item =>
        item.product === newProduct
          ? { ...item, quantity: item.quantity + parseInt(newQuantity) }
          : item
      );
      saveInventory(updatedInventory);
      toast({
        title: "Stock Updated",
        description: `Added ${newQuantity} ${newUnit} of ${newProduct}`,
      });
    } else {
      const newItem: InventoryItem = {
        id: Date.now().toString(),
        product: newProduct,
        quantity: parseInt(newQuantity),
        unit: newUnit,
        threshold: 10
      };
      saveInventory([...inventory, newItem]);
      toast({
        title: "Product Added",
        description: `${newProduct} added to inventory`,
      });
    }

    setNewProduct('');
    setNewQuantity('');
    setShowAddForm(false);
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.threshold);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory Management</h2>
          <p className="text-gray-600">Track your products and stock levels</p>
        </div>
        <Button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Stock</span>
        </Button>
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
                    <SelectItem value="kgs">Kgs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end space-x-2">
                <Button type="submit" className="flex-1">Add</Button>
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
