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
import { Edit, Trash2, Save, X, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
    // Fetch transactions
    const { data: transactions, error: transError } = await supabase
      .from('sales_transactions')
      .select('*')
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
      shop_id: transaction.shop_id
    });
    
    // Initialize editing state for items
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
      toast({
        title: "Error",
        description: "Failed to update inventory",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Inventory updated successfully",
      });
      setEditingInventory(null);
      setEditValues({});
      fetchInventory();
    }
  };

  const saveTransactionEdit = async () => {
    if (!editingTransaction) return;

    // Update transaction
    const { error: transError } = await supabase
      .from('sales_transactions')
      .update(editValues)
      .eq('id', editingTransaction);

    if (transError) {
      toast({
        title: "Error",
        description: "Failed to update transaction",
        variant: "destructive",
      });
      return;
    }

    // Update all sales items
    for (const itemId in editingSalesItems) {
      const item = editingSalesItems[itemId];
      const { error: itemError } = await supabase
        .from('sales_items')
        .update({
          product: item.product,
          quantity: item.quantity,
          unit: item.unit
        })
        .eq('id', itemId);

      if (itemError) {
        toast({
          title: "Error",
          description: `Failed to update item: ${item.product}`,
          variant: "destructive",
        });
        return;
      }
    }

    toast({
      title: "Success",
      description: "Transaction updated successfully",
    });
    setEditingTransaction(null);
    setEditValues({});
    setEditingSalesItems({});
    fetchSalesTransactions();
  };

  const deleteInventoryItem = async (id: string) => {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete inventory item",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Inventory item deleted successfully",
      });
      fetchInventory();
    }
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase
      .from('sales_transactions')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete transaction",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Transaction deleted successfully",
      });
      fetchSalesTransactions();
    }
  };

  const cancelEdit = () => {
    setEditingInventory(null);
    setEditingTransaction(null);
    setEditValues({});
    setEditingSalesItems({});
  };

  // Get unique customers and shops for filtering
  const uniqueCustomers = [...new Set(salesTransactions.map(t => t.customer_name))].sort();
  const uniqueShops = [...new Set([
    ...inventory.map(i => i.shop_id),
    ...salesTransactions.map(t => t.shop_id)
  ])].sort();

  // Filter transactions
  const filteredTransactions = salesTransactions.filter(transaction => {
    if (customerFilter && !transaction.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) {
      return false;
    }
    if (shopFilter && shopFilter !== "all" && transaction.shop_id !== shopFilter) {
      return false;
    }
    return true;
  });

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    if (shopFilter && shopFilter !== "all" && item.shop_id !== shopFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Database Management</h2>
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
                            onSelect={() => {
                              setCustomerFilter(customer);
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
                          <Input
                            value={editValues.product || ''}
                            onChange={(e) => setEditValues({...editValues, product: e.target.value})}
                          />
                        ) : (
                          item.product
                        )}
                      </TableCell>
                      <TableCell>
                        {editingInventory === item.id ? (
                          <Input
                            type="number"
                            value={editValues.quantity || ''}
                            onChange={(e) => setEditValues({...editValues, quantity: Number(e.target.value)})}
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell>
                        {editingInventory === item.id ? (
                          <Select
                            value={editValues.unit}
                            onValueChange={(value) => setEditValues({...editValues, unit: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bags">Bags</SelectItem>
                              <SelectItem value="50kg Bags">50kg Bags</SelectItem>
                              <SelectItem value="kgs">Kgs</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          item.unit
                        )}
                      </TableCell>
                      <TableCell>
                        {editingInventory === item.id ? (
                          <Input
                            type="number"
                            value={editValues.threshold || ''}
                            onChange={(e) => setEditValues({...editValues, threshold: Number(e.target.value)})}
                          />
                        ) : (
                          item.threshold
                        )}
                      </TableCell>
                      <TableCell>
                        {editingInventory === item.id ? (
                          <Input
                            type="number"
                            value={editValues.desired_quantity || ''}
                            onChange={(e) => setEditValues({...editValues, desired_quantity: Number(e.target.value)})}
                          />
                        ) : (
                          item.desired_quantity
                        )}
                      </TableCell>
                      <TableCell>
                        {editingInventory === item.id ? (
                          <Input
                            value={editValues.shop_id || ''}
                            onChange={(e) => setEditValues({...editValues, shop_id: e.target.value})}
                          />
                        ) : (
                          item.shop_id
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {editingInventory === item.id ? (
                            <>
                              <Button size="sm" onClick={saveInventoryEdit}>
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => startEditingInventory(item)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => deleteInventoryItem(item.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Shop ID</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Total Items</TableHead>
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
                            <Input
                              type="date"
                              value={editValues.sale_date || ''}
                              onChange={(e) => setEditValues({...editValues, sale_date: e.target.value})}
                            />
                          ) : (
                            new Date(transaction.sale_date).toLocaleDateString()
                          )}
                        </TableCell>
                        <TableCell>
                          {editingTransaction === transaction.id ? (
                            <Input
                              value={editValues.customer_name || ''}
                              onChange={(e) => setEditValues({...editValues, customer_name: e.target.value})}
                            />
                           ) : (
                             transaction.customer_name || 'Unknown Customer'
                           )}
                        </TableCell>
                        <TableCell>
                          {editingTransaction === transaction.id ? (
                            <Input
                              value={editValues.shop_id || ''}
                              onChange={(e) => setEditValues({...editValues, shop_id: e.target.value})}
                            />
                          ) : (
                            transaction.shop_id
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {transaction.items.map((item) => (
                              <div key={item.id} className="text-sm">
                                {editingTransaction === transaction.id ? (
                                  <div className="flex gap-2 items-center flex-wrap">
                                    <Input
                                      className="w-32"
                                      value={editingSalesItems[item.id]?.product || item.product}
                                      onChange={(e) => setEditingSalesItems({
                                        ...editingSalesItems,
                                        [item.id]: { ...editingSalesItems[item.id], id: item.id, product: e.target.value, quantity: editingSalesItems[item.id]?.quantity || item.quantity, unit: editingSalesItems[item.id]?.unit || item.unit }
                                      })}
                                    />
                                    <Input
                                      type="number"
                                      className="w-20"
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
                                      <SelectTrigger className="w-28">
                                        <SelectValue />
                                      </SelectTrigger>
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
                                    <span className="text-gray-600 ml-2">
                                      {item.quantity} {item.unit}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{totalQuantity}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {editingTransaction === transaction.id ? (
                              <>
                                <Button size="sm" onClick={saveTransactionEdit}>
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => startEditingTransaction(transaction)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive" 
                                  onClick={() => deleteTransaction(transaction.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
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
    const { data, error } = await supabase
      .from('inventory')
      .select('product');

    if (error) {
      console.error('Error fetching products:', error);
    } else {
      const uniqueProducts = [...new Set(data.map(item => item.product))].sort();
      setProducts(uniqueProducts);
    }
  };

  const addProduct = async () => {
    if (!newProduct.trim()) {
      toast({
        title: "Error",
        description: "Product name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (products.includes(newProduct.trim())) {
      toast({
        title: "Error",
        description: "Product already exists",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: `Product "${newProduct}" added. Create inventory records to use it.`,
    });
    
    setProducts([...products, newProduct.trim()].sort());
    setNewProduct('');
  };

  const startEditing = (product: string) => {
    setEditingProduct(product);
    setEditValue(product);
  };

  const saveEdit = async () => {
    if (!editValue.trim() || !editingProduct) return;

    if (editValue === editingProduct) {
      setEditingProduct(null);
      return;
    }

    // Update all inventory records with this product
    const { error } = await supabase
      .from('inventory')
      .update({ product: editValue.trim() })
      .eq('product', editingProduct);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update product name",
        variant: "destructive",
      });
      return;
    }

    // Update sales items
    await supabase
      .from('sales_items')
      .update({ product: editValue.trim() })
      .eq('product', editingProduct);

    toast({
      title: "Success",
      description: "Product name updated successfully",
    });

    setEditingProduct(null);
    fetchProducts();
  };

  const deleteProduct = async (product: string) => {
    // Check if product is in use
    const { data: inventoryCheck } = await supabase
      .from('inventory')
      .select('id')
      .eq('product', product);

    if (inventoryCheck && inventoryCheck.length > 0) {
      toast({
        title: "Cannot Delete",
        description: "This product is in use in inventory records. Remove those first.",
        variant: "destructive",
      });
      return;
    }

    setProducts(products.filter(p => p !== product));
    toast({
      title: "Success",
      description: "Product removed from list",
    });
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
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                    />
                  ) : (
                    product
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    {editingProduct === product ? (
                      <>
                        <Button size="sm" onClick={saveEdit}>
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingProduct(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEditing(product)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => deleteProduct(product)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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