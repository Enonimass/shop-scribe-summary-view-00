import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Edit, Trash2, Save, X, Search, Replace } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
  desired_quantity: number;
  shop_id: string;
}

interface SalesTransaction {
  id: string;
  customer_name: string;
  sale_date: string;
  shop_id: string;
  sale_type: string;
  items: SalesItem[];
}

interface SalesItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  transaction_id?: string;
}

const AdminTableEditor = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [salesTransactions, setSalesTransactions] = useState<SalesTransaction[]>([]);
  const [editingInventory, setEditingInventory] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [editingSalesItems, setEditingSalesItems] = useState<Record<string, SalesItem>>({});
  const [editValues, setEditValues] = useState<any>({});
  const [customerFilter, setCustomerFilter] = useState('');
  const [shopFilter, setShopFilter] = useState('');

  // Find and replace state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findResults, setFindResults] = useState<{ table: string; count: number }[]>([]);
  const [isReplacing, setIsReplacing] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    await fetchInventory();
    await fetchSalesTransactions();
  };

  const fetchInventory = async () => {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory:', error);
    } else {
      setInventory(data || []);
    }
  };

  const fetchSalesTransactions = async () => {
    const { data: transactions, error: transError } = await supabase
      .from('sales_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (transError) {
      console.error('Error fetching transactions:', transError);
      return;
    }

    const { data: allItems, error: itemsError } = await supabase
      .from('sales_items')
      .select('*');

    if (itemsError) {
      console.error('Error fetching sales items:', itemsError);
      return;
    }

    const transactionsWithItems = (transactions || []).map(transaction => ({
      ...transaction,
      items: (allItems || []).filter(item => item.transaction_id === transaction.id)
    }));

    setSalesTransactions(transactionsWithItems);
  };

  const startEditingInventory = (item: InventoryItem) => {
    setEditingInventory(item.id);
    setEditValues({
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      threshold: item.threshold,
      desired_quantity: item.desired_quantity,
      shop_id: item.shop_id
    });
  };

  const startEditingTransaction = (transaction: SalesTransaction) => {
    setEditingTransaction(transaction.id);
    setEditValues({
      customer_name: transaction.customer_name,
      sale_date: transaction.sale_date,
      shop_id: transaction.shop_id,
      sale_type: transaction.sale_type || 'local'
    });
    
    const itemsMap: Record<string, SalesItem> = {};
    transaction.items.forEach(item => {
      itemsMap[item.id] = { ...item };
    });
    setEditingSalesItems(itemsMap);
  };

  const saveInventoryEdit = async () => {
    if (!editingInventory) return;

    const { error } = await supabase
      .from('inventory')
      .update(editValues)
      .eq('id', editingInventory);

    if (error) {
      toast({ title: "Error", description: "Failed to update inventory", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Inventory updated successfully" });
      setEditingInventory(null);
      setEditValues({});
      fetchInventory();
    }
  };

  const saveTransactionEdit = async () => {
    if (!editingTransaction) return;

    const { error: transError } = await supabase
      .from('sales_transactions')
      .update(editValues)
      .eq('id', editingTransaction);

    if (transError) {
      toast({ title: "Error", description: "Failed to update transaction", variant: "destructive" });
      return;
    }

    for (const itemId in editingSalesItems) {
      const item = editingSalesItems[itemId];
      const { error: itemError } = await supabase
        .from('sales_items')
        .update({ product: item.product, quantity: item.quantity, unit: item.unit })
        .eq('id', itemId);

      if (itemError) {
        toast({ title: "Error", description: `Failed to update item: ${item.product}`, variant: "destructive" });
        return;
      }
    }

    toast({ title: "Success", description: "Transaction updated successfully" });
    setEditingTransaction(null);
    setEditValues({});
    setEditingSalesItems({});
    fetchSalesTransactions();
  };

  const deleteInventoryItem = async (id: string) => {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete inventory item", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Inventory item deleted successfully" });
      fetchInventory();
    }
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from('sales_transactions').delete().eq('id', id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete transaction", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Transaction deleted successfully" });
      fetchSalesTransactions();
    }
  };

  const cancelEdit = () => {
    setEditingInventory(null);
    setEditingTransaction(null);
    setEditValues({});
    setEditingSalesItems({});
  };

  // Find and replace
  const handleFind = async () => {
    if (!findText.trim()) return;
    
    const [salesItemsRes, inventoryRes, catalogRes] = await Promise.all([
      supabase.from('sales_items').select('id').eq('product', findText.trim()),
      supabase.from('inventory').select('id').eq('product', findText.trim()),
      supabase.from('product_category_items').select('id').eq('product_name', findText.trim()),
    ]);

    const results = [
      { table: 'Sales Items', count: salesItemsRes.data?.length || 0 },
      { table: 'Inventory', count: inventoryRes.data?.length || 0 },
      { table: 'Product Catalog', count: catalogRes.data?.length || 0 },
    ].filter(r => r.count > 0);

    setFindResults(results);
  };

  const handleReplace = async () => {
    if (!findText.trim() || !replaceText.trim()) return;
    setIsReplacing(true);

    try {
      const [salesRes, invRes, catRes] = await Promise.all([
        supabase.from('sales_items').update({ product: replaceText.trim() } as any).eq('product', findText.trim()),
        supabase.from('inventory').update({ product: replaceText.trim() } as any).eq('product', findText.trim()),
        supabase.from('product_category_items').update({ product_name: replaceText.trim() } as any).eq('product_name', findText.trim()),
      ]);

      if (salesRes.error || invRes.error || catRes.error) {
        toast({ title: "Error", description: "Some updates failed", variant: "destructive" });
      } else {
        const total = findResults.reduce((s, r) => s + r.count, 0);
        toast({ title: "Success", description: `Replaced "${findText}" with "${replaceText}" in ${total} records` });
        setFindText('');
        setReplaceText('');
        setFindResults([]);
        setShowFindReplace(false);
        fetchAllData();
      }
    } finally {
      setIsReplacing(false);
    }
  };

  const uniqueCustomers = [...new Set(salesTransactions.map(t => t.customer_name))].sort();
  const uniqueShops = [...new Set([
    ...inventory.map(i => i.shop_id),
    ...salesTransactions.map(t => t.shop_id)
  ])].sort();

  const filteredTransactions = salesTransactions.filter(transaction => {
    if (customerFilter && !transaction.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) return false;
    if (shopFilter && shopFilter !== "all" && transaction.shop_id !== shopFilter) return false;
    return true;
  });

  const filteredInventory = inventory.filter(item => {
    if (shopFilter && shopFilter !== "all" && item.shop_id !== shopFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Database Management</h2>
          <Button variant="outline" onClick={() => setShowFindReplace(true)}>
            <Replace className="w-4 h-4 mr-2" /> Find & Replace Product
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-sm">
          <div className="flex items-center space-x-2">
            <Label htmlFor="shop-filter">Shop:</Label>
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All shops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                {uniqueShops.map(shop => (
                  <SelectItem key={shop} value={shop}>{shop}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Popover open={customerFilter.length > 0}>
            <PopoverTrigger asChild>
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4" />
                <Input
                  placeholder="Filter by customer name..."
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-64"
                />
              </div>
            </PopoverTrigger>
            {customerFilter.length > 0 && (
              <PopoverContent className="w-64 p-0 z-50" align="start">
                <Command>
                  <CommandList>
                    <CommandEmpty>No suggestions found.</CommandEmpty>
                    {(() => {
                      const suggestions = uniqueCustomers.filter(customer =>
                        customer.toLowerCase().includes(customerFilter.toLowerCase())
                      );
                      return suggestions.length > 0 && (
                        <CommandGroup heading="Customers">
                          {suggestions.slice(0, 5).map((customer) => (
                            <CommandItem
                              key={customer}
                              value={customer}
                              onSelect={() => setCustomerFilter(customer)}
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
        </div>

        <Tabs defaultValue="inventory" className="w-full">
          <TabsList>
            <TabsTrigger value="inventory">Inventory Management</TabsTrigger>
            <TabsTrigger value="sales">Sales Transactions</TabsTrigger>
            <TabsTrigger value="products">Product Management</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory">
            <Card className="bg-white/80 backdrop-blur-sm border-green-200">
              <CardHeader>
                <CardTitle>Inventory Items ({filteredInventory.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Desired Qty</TableHead>
                      <TableHead>Shop ID</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Input value={editValues.product || ''} onChange={(e) => setEditValues({...editValues, product: e.target.value})} />
                          ) : item.product}
                        </TableCell>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Input type="number" value={editValues.quantity || ''} onChange={(e) => setEditValues({...editValues, quantity: Number(e.target.value)})} />
                          ) : item.quantity}
                        </TableCell>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Select value={editValues.unit} onValueChange={(value) => setEditValues({...editValues, unit: value})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bags">Bags</SelectItem>
                                <SelectItem value="50kg Bags">50kg Bags</SelectItem>
                                <SelectItem value="kgs">Kgs</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : item.unit}
                        </TableCell>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Input type="number" value={editValues.threshold || ''} onChange={(e) => setEditValues({...editValues, threshold: Number(e.target.value)})} />
                          ) : item.threshold}
                        </TableCell>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Input type="number" value={editValues.desired_quantity || ''} onChange={(e) => setEditValues({...editValues, desired_quantity: Number(e.target.value)})} />
                          ) : item.desired_quantity}
                        </TableCell>
                        <TableCell>
                          {editingInventory === item.id ? (
                            <Input value={editValues.shop_id || ''} onChange={(e) => setEditValues({...editValues, shop_id: e.target.value})} />
                          ) : item.shop_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {editingInventory === item.id ? (
                              <>
                                <Button size="sm" onClick={saveInventoryEdit}><Save className="w-4 h-4" /></Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => startEditingInventory(item)}><Edit className="w-4 h-4" /></Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteInventoryItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales">
            <Card className="bg-white/80 backdrop-blur-sm border-green-200">
              <CardHeader>
                <CardTitle>Sales Transactions ({filteredTransactions.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Shop ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Total Qty</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction) => {
                      const totalQuantity = transaction.items.reduce((sum, item) => sum + item.quantity, 0);
                      
                      return (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            {editingTransaction === transaction.id ? (
                              <Input type="date" value={editValues.sale_date || ''} onChange={(e) => setEditValues({...editValues, sale_date: e.target.value})} className="w-36" />
                            ) : new Date(transaction.sale_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {editingTransaction === transaction.id ? (
                              <Input value={editValues.customer_name || ''} onChange={(e) => setEditValues({...editValues, customer_name: e.target.value})} className="w-32" />
                            ) : transaction.customer_name || 'Unknown Customer'}
                          </TableCell>
                          <TableCell>
                            {editingTransaction === transaction.id ? (
                              <Select value={editValues.shop_id} onValueChange={(v) => setEditValues({...editValues, shop_id: v})}>
                                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {uniqueShops.map(shop => (
                                    <SelectItem key={shop} value={shop}>{shop}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : transaction.shop_id}
                          </TableCell>
                          <TableCell>
                            {editingTransaction === transaction.id ? (
                              <Select value={editValues.sale_type || 'local'} onValueChange={(v) => setEditValues({...editValues, sale_type: v})}>
                                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="local">Local</SelectItem>
                                  <SelectItem value="away">Away</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={transaction.sale_type === 'away' ? 'destructive' : 'secondary'}>
                                {transaction.sale_type || 'local'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {transaction.items.map((item) => (
                                <div key={item.id} className="text-sm">
                                  {editingTransaction === transaction.id ? (
                                    <div className="flex gap-1 items-center flex-wrap">
                                      <Input
                                        className="w-28"
                                        value={editingSalesItems[item.id]?.product || item.product}
                                        onChange={(e) => setEditingSalesItems({
                                          ...editingSalesItems,
                                          [item.id]: { ...editingSalesItems[item.id], id: item.id, product: e.target.value, quantity: editingSalesItems[item.id]?.quantity || item.quantity, unit: editingSalesItems[item.id]?.unit || item.unit }
                                        })}
                                      />
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={editingSalesItems[item.id]?.quantity || item.quantity}
                                        onChange={(e) => setEditingSalesItems({
                                          ...editingSalesItems,
                                          [item.id]: { ...editingSalesItems[item.id], id: item.id, product: editingSalesItems[item.id]?.product || item.product, quantity: Number(e.target.value), unit: editingSalesItems[item.id]?.unit || item.unit }
                                        })}
                                      />
                                      <Select
                                        value={editingSalesItems[item.id]?.unit || item.unit}
                                        onValueChange={(value) => setEditingSalesItems({
                                          ...editingSalesItems,
                                          [item.id]: { ...editingSalesItems[item.id], id: item.id, product: editingSalesItems[item.id]?.product || item.product, quantity: editingSalesItems[item.id]?.quantity || item.quantity, unit: value }
                                        })}
                                      >
                                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="bags">Bags</SelectItem>
                                          <SelectItem value="50kg Bags">50kg Bags</SelectItem>
                                          <SelectItem value="kgs">Kgs</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="font-medium">{item.product}</span>
                                      <span className="text-muted-foreground ml-1">{item.quantity} {item.unit}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-bold">{totalQuantity}</TableCell>
                          <TableCell>
                            <div className="flex space-x-1">
                              {editingTransaction === transaction.id ? (
                                <>
                                  <Button size="sm" onClick={saveTransactionEdit}><Save className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="outline" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                                </>
                              ) : (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => startEditingTransaction(transaction)}><Edit className="w-4 h-4" /></Button>
                                  <Button size="sm" variant="destructive" onClick={() => deleteTransaction(transaction.id)}><Trash2 className="w-4 h-4" /></Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <ProductManagement />
          </TabsContent>
        </Tabs>
      </div>

      {/* Find and Replace Dialog */}
      <Dialog open={showFindReplace} onOpenChange={setShowFindReplace}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Replace className="h-5 w-5" />
              Find & Replace Product Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Find product name (exact match)</Label>
              <Input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="e.g. super" />
            </div>
            <div className="space-y-2">
              <Label>Replace with</Label>
              <Input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="e.g. Super dairy" />
            </div>
            <Button variant="outline" onClick={handleFind} className="w-full">
              <Search className="w-4 h-4 mr-2" /> Find Matches
            </Button>
            {findResults.length > 0 && (
              <div className="space-y-2 p-3 bg-muted rounded-md">
                <p className="text-sm font-semibold">Found matches:</p>
                {findResults.map(r => (
                  <div key={r.table} className="flex justify-between text-sm">
                    <span>{r.table}</span>
                    <Badge variant="secondary">{r.count} records</Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Total: {findResults.reduce((s, r) => s + r.count, 0)} records will be updated
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFindReplace(false); setFindResults([]); }}>Cancel</Button>
            <Button 
              onClick={handleReplace} 
              disabled={findResults.length === 0 || !replaceText.trim() || isReplacing}
            >
              {isReplacing ? 'Replacing...' : 'Replace All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Product Management Component
const ProductManagement = () => {
  const [products, setProducts] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newProduct, setNewProduct] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const [inventoryRes, catalogRes] = await Promise.all([
      supabase.from('inventory').select('product'),
      supabase.from('product_category_items').select('product_name'),
    ]);

    if (inventoryRes.error || catalogRes.error) {
      console.error('Error fetching products:', inventoryRes.error || catalogRes.error);
      return;
    }

    const uniqueProducts = [
      ...(inventoryRes.data || []).map(item => item.product),
      ...(catalogRes.data || []).map(item => item.product_name),
    ];

    setProducts([...new Set(uniqueProducts)].sort());
  };

  const getDefaultCategoryId = async () => {
    const { data: firstCategory, error } = await supabase
      .from('product_categories')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (firstCategory?.id) return firstCategory.id;

    const { data: createdCategory, error: createError } = await supabase
      .from('product_categories')
      .insert({ name: 'General' })
      .select('id')
      .single();

    if (createError) throw createError;
    return createdCategory.id;
  };

  const addProduct = async () => {
    const trimmedProduct = newProduct.trim();
    if (!trimmedProduct) {
      toast({ title: "Error", description: "Product name cannot be empty", variant: "destructive" });
      return;
    }

    const productExists = products.some(p => p.toLowerCase() === trimmedProduct.toLowerCase());
    if (productExists) {
      toast({ title: "Error", description: "Product already exists", variant: "destructive" });
      return;
    }

    try {
      const categoryId = await getDefaultCategoryId();
      const { error } = await supabase.from('product_category_items').insert({ category_id: categoryId, product_name: trimmedProduct });

      if (error) {
        toast({ title: "Error", description: "Failed to save product", variant: "destructive" });
        return;
      }

      toast({ title: "Success", description: `Product "${trimmedProduct}" added.` });
      setNewProduct('');
      fetchProducts();
    } catch (error) {
      console.error('Error adding product:', error);
      toast({ title: "Error", description: "Failed to save product", variant: "destructive" });
    }
  };

  const startEditing = (product: string) => {
    setEditingProduct(product);
    setEditValue(product);
  };

  const saveEdit = async () => {
    const trimmedValue = editValue.trim();
    if (!trimmedValue || !editingProduct) return;
    if (trimmedValue === editingProduct) { setEditingProduct(null); return; }

    const [inventoryUpdate, salesItemsUpdate, catalogUpdate] = await Promise.all([
      supabase.from('inventory').update({ product: trimmedValue }).eq('product', editingProduct),
      supabase.from('sales_items').update({ product: trimmedValue }).eq('product', editingProduct),
      supabase.from('product_category_items').update({ product_name: trimmedValue }).eq('product_name', editingProduct),
    ]);

    if (inventoryUpdate.error || salesItemsUpdate.error || catalogUpdate.error) {
      toast({ title: "Error", description: "Failed to update product name", variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Product name updated successfully" });
    setEditingProduct(null);
    fetchProducts();
  };

  const deleteProduct = async (product: string) => {
    const { data: inventoryCheck } = await supabase.from('inventory').select('id').eq('product', product);

    if (inventoryCheck && inventoryCheck.length > 0) {
      toast({ title: "Cannot Delete", description: "This product is in use in inventory records. Remove those first.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from('product_category_items').delete().eq('product_name', product);
    if (error) {
      toast({ title: "Error", description: "Failed to remove product", variant: "destructive" });
      return;
    }

    setProducts(products.filter(p => p !== product));
    toast({ title: "Success", description: "Product removed from list" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Add new product..."
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addProduct()}
          />
          <Button onClick={addProduct}>Add Product</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product}>
                <TableCell>
                  {editingProduct === product ? (
                    <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && saveEdit()} />
                  ) : product}
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    {editingProduct === product ? (
                      <>
                        <Button size="sm" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingProduct(null)}><X className="w-4 h-4" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEditing(product)}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteProduct(product)}><Trash2 className="w-4 h-4" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default AdminTableEditor;
