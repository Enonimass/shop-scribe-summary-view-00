import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, ShoppingCart, TrendingUp, ArrowUpDown, Minus, X, Search, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
  const [inventory, setInventory] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([{ product: '', quantity: 0, unit: 'bags' }]);
  const [sortBy, setSortBy] = useState<'product' | 'customer' | 'date'>('date');
  const [searchTerm, setSearchTerm] = useState('');

  // Get unique customers from existing sales
  const getUniqueCustomers = () => {
    const customers = sales.map(sale => sale.customerName);
    return [...new Set(customers)].filter(Boolean).sort();
  };

  const uniqueCustomers = getUniqueCustomers();

  useEffect(() => {
    if (shopId) {
      fetchSales();
      fetchInventory();
    }
  }, [shopId]);

  const fetchInventory = async () => {
    if (!shopId) return;
    
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('shop_id', shopId);

    if (error) {
      console.error('Error fetching inventory:', error);
    } else {
      setInventory(data || []);
    }
  };

  const fetchSales = async () => {
    if (!shopId) return;
    
    // Fetch transactions
    const { data: transactions, error: transError } = await supabase
      .from('sales_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (transError) {
      console.error('Error fetching transactions:', transError);
      return;
    }

    // Fetch all sales items
    const { data: allItems, error: itemsError } = await supabase
      .from('sales_items')
      .select('*');

    if (itemsError) {
      console.error('Error fetching sales items:', itemsError);
      return;
    }

    // Combine transactions with their items
    const salesWithItems = (transactions || []).map(transaction => ({
      id: transaction.id,
      items: (allItems || []).filter(item => item.transaction_id === transaction.id),
      customerName: transaction.customer_name,
      date: transaction.sale_date
    }));

    setSales(salesWithItems);
  };

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

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = saleItems.filter(item => item.product && item.quantity > 0);
    if (!customerName || validItems.length === 0) return;

    // Check inventory availability for each item
    for (const item of validItems) {
      const inventoryItem = inventory.find(inv => inv.product === item.product);
      if (!inventoryItem) {
        toast({
          title: "Product Not Available",
          description: `${item.product} is not in inventory`,
          variant: "destructive",
        });
        return;
      }
      if (inventoryItem.quantity < item.quantity) {
        toast({
          title: "Insufficient Stock",
          description: `Only ${inventoryItem.quantity} ${inventoryItem.unit} of ${item.product} available`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      // Create transaction
      const { data: transaction, error: transError } = await supabase
        .from('sales_transactions')
        .insert({
          shop_id: shopId,
          customer_name: customerName,
          sale_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single();

      if (transError) {
        console.error('Error creating transaction:', transError);
        toast({
          title: "Error",
          description: "Failed to record sale",
          variant: "destructive",
        });
        return;
      }

      // Save sale items to database
      const { error: itemsError } = await supabase
        .from('sales_items')
        .insert(validItems.map(item => ({
          transaction_id: transaction.id,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit
        })));

      if (itemsError) {
        console.error('Error saving sale items:', itemsError);
        toast({
          title: "Error",
          description: "Failed to record sale items",
          variant: "destructive",
        });
        return;
      }

      // Update inventory for each item
      for (const item of validItems) {
        const inventoryItem = inventory.find(inv => inv.product === item.product);
        if (inventoryItem) {
          await supabase
            .from('inventory')
            .update({ quantity: inventoryItem.quantity - item.quantity })
            .eq('id', inventoryItem.id);
        }
      }

      const itemsDescription = validItems.map(item => `${item.quantity} ${item.unit} ${item.product}`).join(', ');
      toast({
        title: "Sale Recorded",
        description: `Sale to ${customerName}: ${itemsDescription}`,
      });

      setCustomerName('');
      setSaleItems([{ product: '', quantity: 0, unit: 'bags' }]);
      setShowAddForm(false);
      fetchSales();
      fetchInventory();
    } catch (error) {
      console.error('Error processing sale:', error);
      toast({
        title: "Error",
        description: "Failed to process sale",
        variant: "destructive",
      });
    }
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
  
  const uniqueCustomersCount = new Set(sales.map(sale => sale.customerName)).size;

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
                <p className="text-2xl font-bold">{uniqueCustomersCount}</p>
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
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSearchOpen}
                        className="w-full justify-between"
                      >
                        {customerName || "Select or add customer..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput 
                          placeholder="Search customers..." 
                          value={customerName}
                          onValueChange={setCustomerName}
                        />
                        <CommandList>
                          <CommandEmpty>
                            <div className="p-2">
                              <Button
                                onClick={() => {
                                  setCustomerSearchOpen(false);
                                }}
                                className="w-full"
                                size="sm"
                              >
                                Add "{customerName}" as new customer
                              </Button>
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            {uniqueCustomers.map((customer) => (
                              <CommandItem
                                key={customer}
                                value={customer}
                                onSelect={() => {
                                  setCustomerName(customer);
                                  setCustomerSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    customerName === customer ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {customer}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                          {inventory.map(item => (
                            <SelectItem key={item.id} value={item.product}>
                              {item.product} ({item.quantity} {item.unit} available)
                            </SelectItem>
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
