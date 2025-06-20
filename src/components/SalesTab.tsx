
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ShoppingCart, TrendingUp, ArrowUpDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Sale {
  id: string;
  product: string;
  quantity: number;
  customerName: string;
  date: string;
  unit: string;
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

const SalesTab = ({ shopId }: { shopId: string }) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSale, setNewSale] = useState({
    product: '',
    quantity: '',
    customerName: '',
    unit: 'bags'
  });
  const [sortBy, setSortBy] = useState<'product' | 'customer' | 'date'>('date');

  useEffect(() => {
    const savedSales = localStorage.getItem(`sales_${shopId}`);
    if (savedSales) {
      setSales(JSON.parse(savedSales));
    } else {
      // Initialize with demo data
      const demoSales = [
        { id: '1', product: 'Dairy Meal', quantity: 5, customerName: 'John Kamau', date: '2024-06-18', unit: 'bags' },
        { id: '2', product: 'Layers Mash', quantity: 10, customerName: 'Mary Wanjiku', date: '2024-06-17', unit: 'kgs' },
        { id: '3', product: 'Dairy Meal', quantity: 3, customerName: 'John Kamau', date: '2024-06-16', unit: 'bags' },
      ];
      setSales(demoSales);
      localStorage.setItem(`sales_${shopId}`, JSON.stringify(demoSales));
    }
  }, [shopId]);

  const saveSales = (newSales: Sale[]) => {
    localStorage.setItem(`sales_${shopId}`, JSON.stringify(newSales));
    setSales(newSales);
  };

  const handleAddSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSale.product || !newSale.quantity || !newSale.customerName) return;

    const sale: Sale = {
      id: Date.now().toString(),
      product: newSale.product,
      quantity: parseInt(newSale.quantity),
      customerName: newSale.customerName,
      date: new Date().toISOString().split('T')[0],
      unit: newSale.unit
    };

    saveSales([sale, ...sales]);
    
    // Update inventory (reduce stock)
    const inventory = JSON.parse(localStorage.getItem(`inventory_${shopId}`) || '[]');
    const updatedInventory = inventory.map((item: any) => 
      item.product === sale.product 
        ? { ...item, quantity: Math.max(0, item.quantity - sale.quantity) }
        : item
    );
    localStorage.setItem(`inventory_${shopId}`, JSON.stringify(updatedInventory));

    toast({
      title: "Sale Recorded",
      description: `Sale of ${sale.quantity} ${sale.unit} ${sale.product} to ${sale.customerName}`,
    });

    setNewSale({ product: '', quantity: '', customerName: '', unit: 'bags' });
    setShowAddForm(false);
  };

  const sortedSales = [...sales].sort((a, b) => {
    switch (sortBy) {
      case 'product':
        return a.product.localeCompare(b.product);
      case 'customer':
        return a.customerName.localeCompare(b.customerName);
      case 'date':
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      default:
        return 0;
    }
  });

  const totalSales = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const uniqueCustomers = new Set(sales.map(sale => sale.customerName)).size;

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold">{totalSales}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Unique Customers</p>
                <p className="text-2xl font-bold">{uniqueCustomers}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Records</p>
                <p className="text-2xl font-bold">{sales.length}</p>
              </div>
              <ArrowUpDown className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">Sales Records</h2>
          <Select value={sortBy} onValueChange={(value: 'product' | 'customer' | 'date') => setSortBy(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort by Date</SelectItem>
              <SelectItem value="product">Sort by Product</SelectItem>
              <SelectItem value="customer">Sort by Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Record Sale</span>
        </Button>
      </div>

      {/* Add Sale Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Record New Sale</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddSale} className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={newSale.product} onValueChange={(value) => setNewSale({...newSale, product: value})}>
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
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={newSale.quantity}
                  onChange={(e) => setNewSale({...newSale, quantity: e.target.value})}
                  placeholder="Quantity"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={newSale.unit} onValueChange={(value) => setNewSale({...newSale, unit: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bags">Bags</SelectItem>
                    <SelectItem value="kgs">Kgs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input
                  value={newSale.customerName}
                  onChange={(e) => setNewSale({...newSale, customerName: e.target.value})}
                  placeholder="Customer name"
                />
              </div>
              <div className="flex items-end space-x-2">
                <Button type="submit" className="flex-1">Record</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sales Table */}
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Customer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{sale.product}</TableCell>
                  <TableCell>{sale.quantity}</TableCell>
                  <TableCell>{sale.unit}</TableCell>
                  <TableCell>{sale.customerName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesTab;
