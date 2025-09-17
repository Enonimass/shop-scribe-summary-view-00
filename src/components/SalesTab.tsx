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
  const [filterProduct, setFilterProduct] = useState('all-products');
  const [filterCustomer, setFilterCustomer] = useState('all-customers');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

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

  const addSaleItem = () => {
    setSaleItems([...saleItems, { product: '', quantity: 0, unit: 'bags' }]);
  };

  const removeSaleItem = (index: number) => {
    if (saleItems.length > 1) {
      setSaleItems(saleItems.filter((_, i) => i !== index));
    }
  };

  const updateSaleItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const updatedItems = saleItems.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, [field]: value };
        
        // Auto-select unit when product is selected
        if (field === 'product' && value) {
          const inventoryItem = inventory.find(inv => inv.product === value);
          if (inventoryItem) {
            updatedItem.unit = inventoryItem.unit;
          }
        }
        
        return updatedItem;
      }
      return item;
    });
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
      // Filter by search term
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesCustomer = sale.customerName.toLowerCase().includes(searchLower);
        const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
        const matchesProduct = items.some(item => item.product.toLowerCase().includes(searchLower));
        if (!matchesCustomer && !matchesProduct) return false;
      }
      
      // Filter by specific product
      if (filterProduct && filterProduct !== 'all-products') {
        const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
        if (!items.some(item => item.product === filterProduct)) return false;
      }
      
      // Filter by specific customer
      if (filterCustomer && filterCustomer !== 'all-customers' && sale.customerName !== filterCustomer) return false;
      
      // Filter by date range
      if (dateFrom && sale.date < dateFrom) return false;
      if (dateTo && sale.date > dateTo) return false;
      
      return true;
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

  // Get unique products from inventory for filtering
  const getUniqueProducts = () => {
    return [...new Set(inventory.map(item => item.product))].sort();
  };

  // Calculate filtered totals
  const filteredTotalQuantity = filteredAndSortedSales.reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => {
        if (!filterProduct || filterProduct === 'all-products' || item.product === filterProduct) {
          return itemSum + item.quantity;
        }
        return itemSum;
      }, 0);
    }
    if (!filterProduct || filterProduct === 'all-products' || sale.product === filterProduct) {
      return sum + (sale.quantity || 0);
    }
    return sum;
  }, 0);

  const totalSales = sales.reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }
    return sum + (sale.quantity || 0);
  }, 0);

  // Group sales by date for timeline view
  const groupSalesByDate = () => {
    const grouped: { [date: string]: Sale[] } = {};
    
    filteredAndSortedSales.forEach(sale => {
      const date = sale.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(sale);
    });
    
    return Object.entries(grouped)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, sales]) => ({
        date,
        sales,
        totalQuantity: sales.reduce((sum, sale) => {
          if (sale.items) {
            return sum + sale.items.reduce((itemSum, item) => {
              if (!filterProduct || filterProduct === 'all-products' || item.product === filterProduct) {
                return itemSum + item.quantity;
              }
              return itemSum;
            }, 0);
          }
          if (!filterProduct || filterProduct === 'all-products' || sale.product === filterProduct) {
            return sum + (sale.quantity || 0);
          }
          return sum;
        }, 0),
        customers: [...new Set(sales.map(sale => sale.customerName))]
      }));
  };

  const groupedSales = groupSalesByDate();
  
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Sales Records</h2>
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Record Sale</span>
          </Button>
        </div>
        
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterProduct} onValueChange={setFilterProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-products">All Products</SelectItem>
                  {getUniqueProducts().map(product => (
                    <SelectItem key={product} value={product}>{product}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-customers">All Customers</SelectItem>
                  {uniqueCustomers.map(customer => (
                    <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Input
                type="date"
                placeholder="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              
              <Input
                type="date"
                placeholder="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              
              <Select value={sortBy} onValueChange={(value: 'product' | 'customer' | 'date') => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Sort by Date</SelectItem>
                  <SelectItem value="product">Sort by Product</SelectItem>
                  <SelectItem value="customer">Sort by Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 mt-4">
              <Label>View Mode:</Label>
              <Select value={viewMode} onValueChange={(value: 'table' | 'timeline') => setViewMode(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table View</SelectItem>
                  <SelectItem value="timeline">Date Timeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Filter Summary */}
            {(filterProduct || filterCustomer || dateFrom || dateTo) && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Filtered Results:</strong> {filteredAndSortedSales.length} records
                  {filterProduct && ` • Product: ${filterProduct}`}
                  {filterCustomer && ` • Customer: ${filterCustomer}`}
                  {(dateFrom || dateTo) && ` • Date: ${dateFrom || 'Start'} to ${dateTo || 'End'}`}
                  {filterProduct && ` • Total Quantity: ${filteredTotalQuantity}`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterProduct('all-products');
                    setFilterCustomer('all-customers');
                    setDateFrom('');
                    setDateTo('');
                    setSearchTerm('');
                  }}
                  className="mt-2"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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
                      <Input
                        value={item.unit}
                        readOnly
                        className="bg-gray-50"
                        placeholder="Auto-selected"
                      />
                    </div>
                    <div className="flex items-end">
                      {saleItems.length > 1 && (
                        <Button 
                          type="button" 
                          onClick={() => removeSaleItem(index)}
                          variant="outline"
                          size="icon"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Record Sale
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sales Data Display */}
      {viewMode === 'table' ? (
        <Card>
          <CardHeader>
            <CardTitle>Sales Records ({filteredAndSortedSales.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Total Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedSales.map((sale) => {
                  const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
                  
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {items.map((item, index) => (
                            <div key={index} className="text-sm">
                              {item.product} - {item.quantity} {item.unit}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{totalQuantity}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Sales Timeline 
              {filterCustomer && ` - ${filterCustomer}`}
              {filterProduct && ` - ${filterProduct}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {groupedSales.map(({ date, sales, totalQuantity, customers }) => (
                <Card key={date} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold text-lg">
                          {new Date(date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {sales.length} transaction{sales.length > 1 ? 's' : ''} • 
                          {customers.length} customer{customers.length > 1 ? 's' : ''} • 
                          Total: {totalQuantity} items
                        </p>
                      </div>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                        {totalQuantity}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {sales.map((sale) => {
                        const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                        
                        return (
                          <div key={sale.id} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{sale.customerName}</p>
                                <div className="text-sm text-gray-600 mt-1">
                                  {items.map((item, index) => (
                                    <div key={index}>
                                      {item.product}: {item.quantity} {item.unit}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-500">
                                  {items.reduce((sum, item) => sum + item.quantity, 0)} total
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {groupedSales.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No sales found for the selected filters.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SalesTab;