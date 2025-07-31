import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
}

const AdminTableEditor = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [salesTransactions, setSalesTransactions] = useState<SalesTransaction[]>([]);
  const [editingInventory, setEditingInventory] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
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

    const { error } = await supabase
      .from('sales_transactions')
      .update(editValues)
      .eq('id', editingTransaction);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update transaction",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Transaction updated successfully",
      });
      setEditingTransaction(null);
      setEditValues({});
      fetchSalesTransactions();
    }
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
    if (shopFilter && transaction.shop_id !== shopFilter) {
      return false;
    }
    return true;
  });

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    if (shopFilter && item.shop_id !== shopFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Database Management</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Label htmlFor="shop-filter">Shop:</Label>
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All shops" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All shops</SelectItem>
              {uniqueShops.map(shop => (
                <SelectItem key={shop} value={shop}>{shop}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Search className="w-4 h-4" />
          <Input
            placeholder="Filter by customer name..."
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList>
          <TabsTrigger value="inventory">Inventory Management</TabsTrigger>
          <TabsTrigger value="sales">Sales Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Card>
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
          <Card>
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
                            transaction.customer_name
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
                          <div className="space-y-1">
                            {transaction.items.map((item, index) => (
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
      </Tabs>
    </div>
  );
};

export default AdminTableEditor;