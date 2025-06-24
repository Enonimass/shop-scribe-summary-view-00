import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ShoppingCart, TrendingUp, ArrowUpDown, Minus, X, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SaleItem {
  product: string;
  quantity: number;
  unit: string;
}

interface Sale {
  id: string;
  items: SaleItem[];
  customerName: string;
  date: string;
  // Legacy support for old single-item sales
  product?: string;
  quantity?: number;
  unit?: string;
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
  const [customerName, setCustomerName] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItem[]>([{ product: '', quantity: 0, unit: 'bags' }]);
  const [sortBy, setSortBy] = useState<'product' | 'customer' | 'date'>('date');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const savedSales = localStorage.getItem(`sales_${shopId}`);
    if (savedSales) {
      const parsedSales = JSON.parse(savedSales);
      // Convert legacy sales to new format
      const convertedSales = parsedSales.map((sale: any) => {
        if (sale.product && !sale.items) {
          return {
            ...sale,
            items: [{ product: sale.product, quantity: sale.quantity, unit: sale.unit }]
          };
        }
        return sale;
      });
      setSales(convertedSales);
    } else {
      // Initialize with demo data
      const demoSales = [
        { 
          id: '1', 
          items: [{ product: 'Dairy Meal', quantity: 5, unit: 'bags' }],
          customerName: 'John Kamau', 
          date: '2024-06-18'
        },
        { 
          id: '2', 
          items: [{ product: 'Layers Mash', quantity: 10, unit: 'kgs' }],
          customerName: 'Mary Wanjiku', 
          date: '2024-06-17'
        },
        { 
          id: '3', 
          items: [
            { product: 'Dairy Meal', quantity: 3, unit: 'bags' },
            { product: 'Broiler Starter', quantity: 2, unit: 'bags' }
          ],
          customerName: 'John Kamau', 
          date: '2024-06-16'
        },
      ];
      setSales(demoSales);
      localStorage.setItem(`sales_${shopId}`, JSON.stringify(demoSales));
    }
  }, [shopId]);

  const saveSales = (newSales: Sale[]) => {
    localStorage.setItem(`sales_${shopId}`, JSON.stringify(newSales));
    setSales(newSales);
  };

  const addSaleItem = () => {
    setSaleItems([...saleItems, { product: '', quantity: 0, unit: 'bags' }]);
  };

  const removeSaleItem = (index: number) => {
    if (saleItems.length > 1) {
      setSaleItems(saleItems.filter((_, i) => i !== index));
    }
  };

  const updateSaleItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const updatedItems = saleItems.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    );
    setSaleItems(updatedItems);
  };

  const handleAddSale = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = saleItems.filter(item => item.product && item.quantity > 0);
    if (!customerName || validItems.length === 0) return;

    const sale: Sale = {
      id: Date.now().toString(),
      items: validItems,
      customerName: customerName,
      date: new Date().toISOString().split('T')[0]
    };

    saveSales([sale, ...sales]);
    
    // Update inventory (reduce stock for each item)
    const inventory = JSON.parse(localStorage.getItem(`inventory_${shopId}`) || '[]');
    let updatedInventory = [...inventory];
    
    validItems.forEach(item => {
      updatedInventory = updatedInventory.map((invItem: any) => 
        invItem.product === item.product 
          ? { ...invItem, quantity: Math.max(0, invItem.quantity - item.quantity) }
          : invItem
      );
    });
    
    localStorage.setItem(`inventory_${shopId}`, JSON.stringify(updatedInventory));

    const itemsDescription = validItems.map(item => `${item.quantity} ${item.unit} ${item.product}`).join(', ');
    toast({
      title: "Sale Recorded",
      description: `Sale to ${customerName}: ${itemsDescription}`,
    });

    setCustomerName('');
    setSaleItems([{ product: '', quantity: 0, unit: 'bags' }]);
    setShowAddForm(false);
  };

  const filteredAndSortedSales = [...sales]
    .filter(sale => {
      if (!searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      
      // Search in customer name
      if (sale.customerName.toLowerCase().includes(searchLower)) return true;
      
      // Search in products
      const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
      return items.some(item => item.product.toLowerCase().includes(searchLower));
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'product':
          const aProduct = a.items?.[0]?.product || a.product || '';
          const bProduct = b.items?.[0]?.product || b.product || '';
          return aProduct.localeCompare(bProduct);
        case 'customer':
          return a.customerName.localeCompare(b.customerName);
        case 'date':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        default:
          return 0;
      }
    });

  const totalSales = sales.reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }
    return sum + (sale.quantity || 0);
  }, 0);
  
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">Sales Records</h2>
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search customers or products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
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
            <form onSubmit={handleAddSale} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Products</Label>
                  <Button type="button" onClick={addSaleItem} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Product
                  </Button>
                </div>
                
                {saleItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label>Product</Label>
                      <Select 
                        value={item.product} 
                        onValueChange={(value) => updateSaleItem(index, 'product', value)}
                      >
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
                        value={item.quantity || ''}
                        onChange={(e) => updateSaleItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        placeholder="Quantity"
                        min="1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select 
                        value={item.unit} 
                        onValueChange={(value) => updateSaleItem(index, 'unit', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bags">Bags</SelectItem>
                          <SelectItem value="kgs">Kgs</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      {saleItems.length > 1 && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => removeSaleItem(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex space-x-2">
                <Button type="submit">Record Sale</Button>
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
                <TableHead>Customer</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Total Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedSales.map((sale) => {
                const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                
                return (
                  <TableRow key={sale.id}>
                    <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{sale.customerName}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {items.map((item, index) => (
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
    </div>
  );
};

export default SalesTab;
