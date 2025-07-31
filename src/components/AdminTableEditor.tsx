import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit, Trash2, Save, X } from 'lucide-react';
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

interface SalesRecord {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  customer_name: string;
  sale_date: string;
  shop_id: string;
}

const AdminTableEditor = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [editingInventory, setEditingInventory] = useState<string | null>(null);
  const [editingSales, setEditingSales] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    await fetchInventory();
    await fetchSales();
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

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error);
    } else {
      setSales(data || []);
    }
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

  const startEditingSales = (item: SalesRecord) => {
    setEditingSales(item.id);
    setEditValues({
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      customer_name: item.customer_name,
      sale_date: item.sale_date,
      shop_id: item.shop_id
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

  const saveSalesEdit = async () => {
    if (!editingSales) return;

    const { error } = await supabase
      .from('sales')
      .update(editValues)
      .eq('id', editingSales);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update sales record",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Sales record updated successfully",
      });
      setEditingSales(null);
      setEditValues({});
      fetchSales();
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

  const deleteSalesRecord = async (id: string) => {
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete sales record",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Sales record deleted successfully",
      });
      fetchSales();
    }
  };

  const cancelEdit = () => {
    setEditingInventory(null);
    setEditingSales(null);
    setEditValues({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Database Management</h2>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList>
          <TabsTrigger value="inventory">Inventory Management</TabsTrigger>
          <TabsTrigger value="sales">Sales Records</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Items</CardTitle>
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
                  {inventory.map((item) => (
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
              <CardTitle>Sales Records</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Shop ID</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {editingSales === item.id ? (
                          <Input
                            type="date"
                            value={editValues.sale_date || ''}
                            onChange={(e) => setEditValues({...editValues, sale_date: e.target.value})}
                          />
                        ) : (
                          new Date(item.sale_date).toLocaleDateString()
                        )}
                      </TableCell>
                      <TableCell>
                        {editingSales === item.id ? (
                          <Input
                            value={editValues.customer_name || ''}
                            onChange={(e) => setEditValues({...editValues, customer_name: e.target.value})}
                          />
                        ) : (
                          item.customer_name
                        )}
                      </TableCell>
                      <TableCell>
                        {editingSales === item.id ? (
                          <Input
                            value={editValues.product || ''}
                            onChange={(e) => setEditValues({...editValues, product: e.target.value})}
                          />
                        ) : (
                          item.product
                        )}
                      </TableCell>
                      <TableCell>
                        {editingSales === item.id ? (
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
                        {editingSales === item.id ? (
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
                        {editingSales === item.id ? (
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
                          {editingSales === item.id ? (
                            <>
                              <Button size="sm" onClick={saveSalesEdit}>
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => startEditingSales(item)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => deleteSalesRecord(item.id)}
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
      </Tabs>
    </div>
  );
};

export default AdminTableEditor;