import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, ShoppingCart, TrendingUp, ArrowUpDown, Minus, X, Search, Check, ChevronsUpDown, Download, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ExportButtons from './ExportButtons';
import BulkSalesUpload from './BulkSalesUpload';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Convert quantity to bag equivalent for totals
// 1 x 50kg bag = 5/7 of a regular bag (since a bag = 70kg)
const toBagEquivalent = (quantity: number, unit: string): number => {
  if (unit === '50kg' || unit === '50kg Bags') {
    return quantity * (5 / 7);
  }
  return quantity;
};

const formatBagEquivalent = (value: number): string => {
  // Show as fraction if it's a clean multiple of 5/7
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
};

interface SaleItem {
  product: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  original_price?: number;
  price_overridden?: boolean;
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
  saleType?: string;
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
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [productPrices, setProductPrices] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'product' | 'customer' | 'date'>('date');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProduct, setFilterProduct] = useState('all-products');
  const [filterCustomer, setFilterCustomer] = useState('all-customers');
  const [filterUnit, setFilterUnit] = useState('all-units');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  const [filterSaleType, setFilterSaleType] = useState('all-types');

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
      fetchPaymentMethods();
      fetchPrices();
    }
  }, [shopId]);

  // Real-time subscription for inventory changes
  useEffect(() => {
    if (!shopId) return;
    const channel = supabase
      .channel('sales-inventory-changes')
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
      .eq('shop_id', shopId);

    if (error) {
      console.error('Error fetching inventory:', error);
    } else {
      setInventory(data || []);
    }
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').eq('is_active', true).order('name');
    setPaymentMethods(data || []);
    if (data && data.length && !paymentMethodId) setPaymentMethodId(data[0].id);
  };

  const fetchPrices = async () => {
    if (!shopId) return;
    const { data } = await supabase.from('product_prices').select('*').eq('shop_id', shopId);
    setProductPrices(data || []);
  };

  const lookupPrice = (product: string, unit: string) =>
    productPrices.find(p => p.product === product && p.unit === unit)?.price ?? 0;

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

    // Fetch sales items for these transactions (batch in chunks to avoid URL length limits)
    const txIds = (transactions || []).map(t => t.id);
    let allItems: any[] = [];
    const chunkSize = 200;
    for (let i = 0; i < txIds.length; i += chunkSize) {
      const chunk = txIds.slice(i, i + chunkSize);
      const { data: itemsChunk, error: itemsError } = await supabase
        .from('sales_items')
        .select('*')
        .in('transaction_id', chunk);
      if (itemsError) {
        console.error('Error fetching sales items:', itemsError);
        return;
      }
      allItems = allItems.concat(itemsChunk || []);
    }


    // Combine transactions with their items
    const salesWithItems = (transactions || []).map(transaction => ({
      id: transaction.id,
      items: (allItems || []).filter(item => item.transaction_id === transaction.id),
      customerName: transaction.customer_name,
      date: transaction.sale_date,
      saleType: (transaction as any).sale_type || 'local'
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
        return { ...item, [field]: value };
      }
      return item;
    });
    setSaleItems(updatedItems);
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = saleItems.filter(item => item.product && item.quantity > 0);
    if (!customerName || validItems.length === 0) return;
    if (!paymentMethodId) {
      toast({ title: 'Select payment method', variant: 'destructive' });
      return;
    }
    const method = paymentMethods.find(m => m.id === paymentMethodId);
    const isCredit = method?.kind === 'credit';

    // Check inventory availability for each item - match both product AND unit
    for (const item of validItems) {
      const inventoryItem = inventory.find(inv => inv.product.toLowerCase() === item.product.toLowerCase() && inv.unit === item.unit);
      if (!inventoryItem) {
        toast({
          title: "Product Not Available",
          description: `${item.product} (${item.unit}) is not in inventory`,
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
      const totalAmount = validItems.reduce((s, it) => s + (Number(it.unit_price ?? lookupPrice(it.product, it.unit)) * Number(it.quantity)), 0);
      const paid = isCredit ? Number(amountPaid || 0) : (amountPaid ? Number(amountPaid) : totalAmount);
      // Create transaction
      const { data: transaction, error: transError } = await supabase
        .from('sales_transactions')
        .insert({
          shop_id: shopId,
          customer_name: customerName,
          sale_date: saleDate,
          payment_method_id: paymentMethodId,
          payment_method_name: method?.name,
          is_credit: isCredit,
          total_amount: totalAmount,
          amount_paid: paid,
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
        .insert(validItems.map(item => {
          const original = lookupPrice(item.product, item.unit);
          const unitPrice = Number(item.unit_price ?? original);
          return {
            transaction_id: transaction.id,
            product: item.product,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: unitPrice,
            original_price: original,
            price_overridden: Number(unitPrice) !== Number(original),
            line_total: unitPrice * Number(item.quantity),
          };
        }));

      if (itemsError) {
        console.error('Error saving sale items:', itemsError);
        toast({
          title: "Error",
          description: "Failed to record sale items",
          variant: "destructive",
        });
        return;
      }

      // Update inventory for each item - match both product AND unit
      for (const item of validItems) {
        const inventoryItem = inventory.find(inv => inv.product.toLowerCase() === item.product.toLowerCase() && inv.unit === item.unit);
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
      setSaleDate(new Date().toISOString().split('T')[0]);
      setAmountPaid('');
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
      const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
      
      // Filter by specific product FIRST (exact match only)
      if (filterProduct && filterProduct !== 'all-products') {
        if (!items.some(item => item.product === filterProduct)) return false;
      }
      
      // Filter by unit type
      if (filterUnit && filterUnit !== 'all-units') {
        const hasMatchingUnit = items.some(item => {
          const matchesProduct = !filterProduct || filterProduct === 'all-products' || item.product === filterProduct;
          return matchesProduct && item.unit === filterUnit;
        });
        if (!hasMatchingUnit) return false;
      }
      
      // Filter by search term (exact match)
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesCustomer = sale.customerName.toLowerCase().includes(searchLower);
        // Only show sales where at least one product exactly matches
        const matchesProduct = items.some(item => item.product.toLowerCase() === searchLower);
        if (!matchesCustomer && !matchesProduct) return false;
      }
      
      // Filter by specific customer
      if (filterCustomer && filterCustomer !== 'all-customers' && sale.customerName !== filterCustomer) return false;
      
      // Filter by date range
      if (dateFrom && sale.date < dateFrom) return false;
      if (dateTo && sale.date > dateTo) return false;
      
      // Filter by sale type (local/away)
      if (filterSaleType && filterSaleType !== 'all-types') {
        if (sale.saleType !== filterSaleType) return false;
      }
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

  // Get unique units from sales for filtering
  const getUniqueUnits = () => {
    const units = sales.flatMap(sale => {
      if (sale.items) {
        return sale.items.map(item => item.unit);
      }
      return sale.unit ? [sale.unit] : [];
    });
    return [...new Set(units)].filter(Boolean).sort();
  };

  // Calculate filtered totals - only for matching product AND unit
  // 50kg bags are converted to bag equivalents (5/7 per 50kg bag)
  const filteredTotalQuantity = filteredAndSortedSales.reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => {
        const matchesProduct = !filterProduct || filterProduct === 'all-products' || item.product === filterProduct;
        const matchesUnit = !filterUnit || filterUnit === 'all-units' || item.unit === filterUnit;
        if (matchesProduct && matchesUnit) {
          return itemSum + toBagEquivalent(item.quantity, item.unit);
        }
        return itemSum;
      }, 0);
    }
    const matchesProduct = !filterProduct || filterProduct === 'all-products' || sale.product === filterProduct;
    const matchesUnit = !filterUnit || filterUnit === 'all-units' || sale.unit === filterUnit;
    if (matchesProduct && matchesUnit) {
      return sum + toBagEquivalent(sale.quantity || 0, sale.unit || '');
    }
    return sum;
  }, 0);

  const totalSales = sales.reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => itemSum + toBagEquivalent(item.quantity, item.unit), 0);
    }
    return sum + toBagEquivalent(sale.quantity || 0, sale.unit || '');
  }, 0);

  const awaySales = sales.filter(s => s.saleType === 'away').reduce((sum, sale) => {
    if (sale.items) {
      return sum + sale.items.reduce((itemSum, item) => itemSum + toBagEquivalent(item.quantity, item.unit), 0);
    }
    return sum + toBagEquivalent(sale.quantity || 0, sale.unit || '');
  }, 0);

  const localSales = totalSales - awaySales;

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
                return itemSum + toBagEquivalent(item.quantity, item.unit);
              }
              return itemSum;
            }, 0);
          }
          if (!filterProduct || filterProduct === 'all-products' || sale.product === filterProduct) {
            return sum + toBagEquivalent(sale.quantity || 0, sale.unit || '');
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Sales</p>
                <p className="text-2xl font-bold text-foreground">{formatBagEquivalent(totalSales)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Local Sales</p>
                <p className="text-2xl font-bold text-foreground">{formatBagEquivalent(localSales)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 backdrop-blur-sm border-orange-200 border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Away Sales</p>
                <p className="text-2xl font-bold text-orange-600">{formatBagEquivalent(awaySales)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unique Customers</p>
                <p className="text-2xl font-bold text-foreground">{uniqueCustomersCount}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Records</p>
                <p className="text-2xl font-bold text-foreground">{sales.length}</p>
              </div>
              <ArrowUpDown className="h-8 w-8 text-green-awesome" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Sales Records</h2>
          <div className="flex items-center gap-2">
            <ExportButtons
              filename={`sales-records-${new Date().toISOString().split('T')[0]}`}
              getData={() => ({
                title: 'Sales Records Report',
                headers: ['Date', 'Customer', 'Product', 'Quantity', 'Unit'],
                rows: filteredAndSortedSales.flatMap(sale => {
                  const items = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                  return items.map((item: any) => [
                    new Date(sale.date).toLocaleDateString(),
                    sale.customerName,
                    item.product,
                    item.quantity,
                    item.unit,
                  ]);
                }),
                summary: {
                  'Total Sales Quantity': totalSales,
                  'Unique Customers': uniqueCustomersCount,
                  'Total Records': sales.length,
                },
              })}
            />
            <BulkSalesUpload shopId={shopId} onUploadComplete={fetchSales} />
            <Button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Record Sale</span>
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full flex items-center justify-between bg-white/80 backdrop-blur-sm border-green-200">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
                {(filterProduct !== 'all-products' || filterCustomer !== 'all-customers' || filterUnit !== 'all-units' || dateFrom || dateTo || searchTerm) && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">Active</span>
                )}
              </span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="bg-white/80 backdrop-blur-sm border-green-200 mt-2 border-t-0 rounded-t-none">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <Popover open={searchTerm.length > 0}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                    <Input
                      placeholder="Search products or customers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </PopoverTrigger>
                {searchTerm.length > 0 && (
                  <PopoverContent className="w-80 p-0 z-50" align="start">
                    <Command>
                      <CommandList>
                        <CommandEmpty>No suggestions found.</CommandEmpty>
                        
                        {/* Product suggestions */}
                        {(() => {
                          const productSuggestions = getUniqueProducts().filter(product =>
                            product.toLowerCase().includes(searchTerm.toLowerCase())
                          );
                          return productSuggestions.length > 0 && (
                            <CommandGroup heading="Products">
                              {productSuggestions.slice(0, 5).map((product) => (
                                <CommandItem
                                  key={product}
                                  value={product}
                                  onSelect={() => {
                                    setSearchTerm(product);
                                  }}
                                  className="cursor-pointer"
                                >
                                  {product}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          );
                        })()}
                        
                        {/* Customer suggestions */}
                        {(() => {
                          const customerSuggestions = uniqueCustomers.filter(customer =>
                            customer.toLowerCase().includes(searchTerm.toLowerCase())
                          );
                          return customerSuggestions.length > 0 && (
                            <CommandGroup heading="Customers">
                              {customerSuggestions.slice(0, 5).map((customer) => (
                                <CommandItem
                                  key={customer}
                                  value={customer}
                                  onSelect={() => {
                                    setSearchTerm(customer);
                                  }}
                                  className="cursor-pointer"
                                >
                                  {customer}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          );
                        })()}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                )}
              </Popover>
              
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
              
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-units">All Units</SelectItem>
                  {getUniqueUnits().map(unit => (
                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterSaleType} onValueChange={setFilterSaleType}>
                <SelectTrigger>
                  <SelectValue placeholder="Sale Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-types">All Types</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
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
            {(filterProduct !== 'all-products' || filterCustomer !== 'all-customers' || filterUnit !== 'all-units' || dateFrom || dateTo) && (
              <div className="mt-4 p-3 bg-green-light/20 rounded-lg">
                <p className="text-sm text-green-awesome">
                  <strong>Filtered Results:</strong> {filteredAndSortedSales.length} records
                  {filterProduct !== 'all-products' && ` • Product: ${filterProduct}`}
                  {filterUnit !== 'all-units' && ` • Unit: ${filterUnit}`}
                  {filterCustomer !== 'all-customers' && ` • Customer: ${filterCustomer}`}
                  {(dateFrom || dateTo) && ` • Date: ${dateFrom || 'Start'} to ${dateTo || 'End'}`}
                  {(filterProduct !== 'all-products' || filterUnit !== 'all-units') && ` • Total Quantity: ${formatBagEquivalent(filteredTotalQuantity)} bags${filterUnit !== 'all-units' ? ` (filtered by ${filterUnit})` : ''}`}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterProduct('all-products');
                    setFilterCustomer('all-customers');
                    setFilterUnit('all-units');
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
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Add Sale Form */}
      {showAddForm && (
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
          <CardHeader>
            <CardTitle>Record New Sale</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddSale} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sale Date</Label>
                  <Input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                  />
                </div>
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
                      <Label>Product & Unit</Label>
                      <Select 
                        value={item.product && item.unit ? `${item.product}|${item.unit}` : ''} 
                        onValueChange={(value) => {
                          const [product, unit] = value.split('|');
                          setSaleItems(saleItems.map((sItem, i) => 
                            i === index ? { ...sItem, product, unit } : sItem
                          ));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product & unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {inventory.map(invItem => (
                            <SelectItem key={invItem.id} value={`${invItem.product}|${invItem.unit}`}>
                              {invItem.product} - {invItem.unit} ({invItem.quantity} available)
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
                        onChange={(e) => updateSaleItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        placeholder="Quantity"
                        min="0.1"
                        step="0.1"
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
                  const allItems = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                  // Filter items based on selected product and unit
                  const displayItems = allItems.filter(item => {
                    const matchesProduct = filterProduct === 'all-products' || item.product === filterProduct;
                    const matchesUnit = filterUnit === 'all-units' || item.unit === filterUnit;
                    return matchesProduct && matchesUnit;
                  });
                  const totalQuantity = displayItems.reduce((sum, item) => sum + toBagEquivalent(item.quantity, item.unit), 0);
                  
                  if (displayItems.length === 0) return null;
                  
                  return (
                    <TableRow key={sale.id} className={sale.saleType === 'away' ? 'bg-orange-50' : ''}>
                      <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {sale.customerName}
                          {sale.saleType === 'away' && <Badge className="bg-orange-500 text-white text-xs">Away</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {displayItems.map((item, index) => (
                            <div key={index} className="text-sm">
                              {item.product} - {item.quantity} {item.unit}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{formatBagEquivalent(totalQuantity)} bags</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white/80 backdrop-blur-sm border-green-200">
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
                <Card key={date} className="border-l-4 border-l-green-awesome bg-white/60">
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
                          Total: {formatBagEquivalent(totalQuantity)} bags
                        </p>
                      </div>
                      <div className="bg-green-light/30 text-green-awesome px-3 py-1 rounded-full text-sm font-medium">
                        {formatBagEquivalent(totalQuantity)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      {sales.map((sale) => {
                        const allItems = sale.items || [{ product: sale.product || '', quantity: sale.quantity || 0, unit: sale.unit || '' }];
                        // Filter items based on selected product and unit
                        const displayItems = allItems.filter(item => {
                          const matchesProduct = filterProduct === 'all-products' || item.product === filterProduct;
                          const matchesUnit = filterUnit === 'all-units' || item.unit === filterUnit;
                          return matchesProduct && matchesUnit;
                        });
                        
                        if (displayItems.length === 0) return null;
                        
                        return (
                          <div key={sale.id} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{sale.customerName}</p>
                                <div className="text-sm text-gray-600 mt-1">
                                  {displayItems.map((item, index) => (
                                    <div key={index}>
                                      {item.product}: {item.quantity} {item.unit}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-500">
                                  {formatBagEquivalent(displayItems.reduce((sum, item) => sum + toBagEquivalent(item.quantity, item.unit), 0))} bags
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