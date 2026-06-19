import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Package, AlertTriangle } from 'lucide-react';
import ExportButtons from './ExportButtons';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import UnitConverter from './UnitConverter';
import { PIVOT_UNITS, canonicalUnitKey, toBagEquivalent, formatBags } from '@/lib/units';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
  desired_quantity: number;
  shop_id: string;
}

  const getLocalCategoryColor = (id?: string) => {
    if (!id) return undefined;
    try {
      const stored = JSON.parse(localStorage.getItem('categoryColors') || '{}');
      return stored[id];
    } catch (e) { return undefined; }
  };
const InventoryTab = ({ shopId }: { shopId: string }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('bags');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<{id: string; name: string; color?: string}[]>([]);
  const [productToCategory, setProductToCategory] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (shopId) {
      fetchInventory();
    }
    fetchCategoryMapping();
    fetchAvailableProducts();
  }, [shopId]);

  const fetchCategoryMapping = async () => {
    try {
      const { data: cats } = await supabase.from('product_categories').select('*') as any;
      const { data: items } = await supabase.from('product_category_items').select('*') as any;
      const catsArr = (cats || []).map((c: any) => ({ id: c.id, name: c.name, color: c.color }));
      const map: Record<string, string> = {};
      (items || []).forEach((it: any) => {
        map[it.product_name] = it.category_id;
      });
      setCategories(catsArr);
      setProductToCategory(map);
    } catch (e) {
      // ignore
    }
  };

  const fetchAvailableProducts = async () => {
    const { data, error } = await supabase
      .from('product_category_items')
      .select('product_name')
      .order('product_name');

    if (!error && data) {
      const productNames = [...new Set(data.map(item => item.product_name))];
      setAvailableProducts(productNames);
    }
  };

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

    try {
      const qty = Number(newQuantity);
      if (Number.isNaN(qty) || qty <= 0) {
        toast({
          title: "Invalid quantity",
          description: "Enter a positive number",
          variant: "destructive",
        });
        return;
      }

      // Check if an entry exists for the same product AND unit
      const { data: existingItem, error: existingError } = await supabase
        .from('inventory')
        .select('*')
        .eq('shop_id', shopId)
        .eq('product', newProduct)
        .eq('unit', newUnit)
        .maybeSingle();

      if (existingError && (existingError as any).code !== 'PGRST116') {
        console.error('Error checking existing inventory:', existingError);
        toast({
          title: "Error",
          description: "Failed to check existing inventory",
          variant: "destructive",
        });
      } else if (existingItem) {
        // Same product and unit -> aggregate quantity
        const { error: updateError } = await supabase
          .from('inventory')
          .update({ quantity: existingItem.quantity + qty })
          .eq('id', existingItem.id);

        if (updateError) {
          console.error('Error updating inventory:', updateError);
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
        // No entry for this product+unit -> create a new row
        const { error: insertError } = await supabase
          .from('inventory')
          .insert({
            shop_id: shopId,
            product: newProduct,
            quantity: qty,
            unit: newUnit,
            threshold: 15,
            desired_quantity: 25,
          });

        if (insertError) {
          console.error('Error adding inventory:', insertError);
          if ((insertError as any).code === '23505') {
            // Likely a unique constraint on (shop_id, product). Needs DB change to allow (shop_id, product, unit)
            toast({
              title: "Database constraint",
              description: "Update unique constraint to include unit so separate rows per unit are allowed.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Error",
              description: "Failed to add product",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Product Added",
            description: `${newProduct} added to inventory`,
          });
        }
      }
    } finally {
      setNewProduct('');
      setNewQuantity('');
      setShowAddForm(false);
      setLoading(false);
      fetchInventory();
    }
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.threshold);

  const pivotProducts = React.useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    inventory.forEach(item => {
      const key = canonicalUnitKey(item.unit);
      if (!key) return;
      const row = m.get(item.product) || {};
      row[key] = (row[key] || 0) + Number(item.quantity || 0);
      m.set(item.product, row);
    });
    return [...m.entries()]
      .map(([product, units]) => ({ product, units }))
      .sort((a, b) => a.product.localeCompare(b.product));
  }, [inventory]);

  const productBagEq = (units: Record<string, number>) => {
    let total = 0;
    PIVOT_UNITS.forEach(u => {
      const q = units[u.key] || 0;
      if (!q) return;
      // For 70kg use 'bags', for kg use 'kg', otherwise the key itself maps to kg-based unit
      const dbU = u.key === '70kg' ? 'bags' : (u.key === 'kg' ? 'kg' : u.key);
      total += toBagEquivalent(q, dbU);
    });
    return total;
  };

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
        <div className="flex flex-wrap gap-2">
            <div className="w-48">
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          <ExportButtons
            filename={`inventory-${new Date().toISOString().split('T')[0]}`}
            getData={() => ({
              title: 'Inventory Report',
              headers: ['Product', 'Quantity', 'Unit', 'Threshold', 'Desired Qty', 'To Add', 'Status'],
              rows: inventory.map(item => [
                item.product,
                item.quantity,
                item.unit,
                item.threshold,
                item.desired_quantity,
                calculateQuantityToAdd(item.quantity, item.desired_quantity),
                item.quantity <= item.threshold ? 'Low Stock' : 'OK',
              ]),
              summary: {
                'Total Products': inventory.length,
                'Low Stock Items': lowStockItems.length,
              },
            })}
          />
          <UnitConverter 
            inventory={inventory} 
            onConvert={fetchInventory}
            shopId={shopId}
          />
          {/* Manual stock add disabled for sellers — use Delivery Notes instead */}
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/80 backdrop-blur-sm">
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
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
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
                    <SelectItem value="5kg">5 kg</SelectItem>
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

      {/* Pivoted stock-by-product table */}
      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardHeader>
          <CardTitle>Stock by Product</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                {PIVOT_UNITS.map(u => <TableHead key={u.key} className="text-right">{u.label}</TableHead>)}
                <TableHead className="text-right">Total (70kg eq.)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pivotProducts
                .filter(({ product }) => selectedCategory === 'all' ? true : (productToCategory[product] === selectedCategory))
                .map(({ product, units }) => (
                <TableRow key={product}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: (categories.find(c => c.id === productToCategory[product])?.color) || getLocalCategoryColor(productToCategory[product]) || '#9ca3af' }} />
                    {product}
                  </TableCell>
                  {PIVOT_UNITS.map(u => (
                    <TableCell key={u.key} className="text-right">
                      {units[u.key] ? formatBags(units[u.key]) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold">{formatBags(productBagEq(units))}</TableCell>
                </TableRow>
              ))}
              {pivotProducts.length === 0 && (
                <TableRow><TableCell colSpan={PIVOT_UNITS.length + 2} className="text-center text-muted-foreground">No stock yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stock Thresholds (kept) */}
      <Card className="bg-white/80 backdrop-blur-sm border-green-200">
        <CardHeader>
          <CardTitle>Stock Thresholds &amp; Reorder</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Desired</TableHead>
                <TableHead className="text-right">To Add</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory
                .filter(item => selectedCategory === 'all' ? true : (productToCategory[item.product] === selectedCategory))
                .map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: (categories.find(c => c.id === productToCategory[item.product])?.color) || getLocalCategoryColor(productToCategory[item.product]) || '#9ca3af' }} />
                    {item.product}
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.threshold}</TableCell>
                  <TableCell className="text-right">{item.desired_quantity}</TableCell>
                  <TableCell className="text-right">
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