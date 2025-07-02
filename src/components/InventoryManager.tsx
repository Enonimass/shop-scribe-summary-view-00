
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Settings, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
  desiredQuantity: number;
}

const shops = [
  { id: 'kiambu', name: 'Kiambu Shop' },
  { id: 'ikinu', name: 'Ikinu Shop' },
  { id: 'kwa-maiko', name: 'Kwa-Maiko Shop' },
  { id: 'githunguri', name: 'Githunguri Shop' },
  { id: 'manyatta', name: 'Manyatta Shop' },
  { id: 'kibugu', name: 'Kibugu Shop' },
];

const InventoryManager = () => {
  const [selectedShop, setSelectedShop] = useState('kiambu');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ threshold: string; desiredQuantity: string }>({
    threshold: '',
    desiredQuantity: ''
  });

  useEffect(() => {
    loadInventory();
  }, [selectedShop]);

  const loadInventory = () => {
    const savedInventory = localStorage.getItem(`inventory_${selectedShop}`);
    if (savedInventory) {
      setInventory(JSON.parse(savedInventory));
    } else {
      setInventory([]);
    }
  };

  const saveInventory = (newInventory: InventoryItem[]) => {
    localStorage.setItem(`inventory_${selectedShop}`, JSON.stringify(newInventory));
    setInventory(newInventory);
  };

  const handleEditStart = (item: InventoryItem) => {
    setEditingItem(item.id);
    setEditValues({
      threshold: item.threshold.toString(),
      desiredQuantity: item.desiredQuantity.toString()
    });
  };

  const handleEditSave = (itemId: string) => {
    const threshold = parseInt(editValues.threshold);
    const desiredQuantity = parseInt(editValues.desiredQuantity);

    if (isNaN(threshold) || isNaN(desiredQuantity) || threshold < 0 || desiredQuantity < 0) {
      toast({
        title: "Invalid Values",
        description: "Please enter valid positive numbers",
        variant: "destructive"
      });
      return;
    }

    const updatedInventory = inventory.map(item =>
      item.id === itemId
        ? { ...item, threshold, desiredQuantity }
        : item
    );

    saveInventory(updatedInventory);
    setEditingItem(null);
    toast({
      title: "Settings Updated",
      description: "Threshold and desired quantity updated successfully",
    });
  };

  const handleEditCancel = () => {
    setEditingItem(null);
    setEditValues({ threshold: '', desiredQuantity: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory Settings</h2>
          <p className="text-gray-600">Manage thresholds and desired quantities for all shops</p>
        </div>
        <div className="flex items-center space-x-4">
          <Settings className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Select Shop:</span>
          <Select value={selectedShop} onValueChange={setSelectedShop}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shops.map(shop => (
                <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Settings - {shops.find(s => s.id === selectedShop)?.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {inventory.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No products in inventory yet. Products will appear here once sellers add them.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Current Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead>Desired Quantity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.product}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      {editingItem === item.id ? (
                        <Input
                          type="number"
                          value={editValues.threshold}
                          onChange={(e) => setEditValues(prev => ({ ...prev, threshold: e.target.value }))}
                          className="w-20"
                          min="0"
                        />
                      ) : (
                        item.threshold
                      )}
                    </TableCell>
                    <TableCell>
                      {editingItem === item.id ? (
                        <Input
                          type="number"
                          value={editValues.desiredQuantity}
                          onChange={(e) => setEditValues(prev => ({ ...prev, desiredQuantity: e.target.value }))}
                          className="w-20"
                          min="0"
                        />
                      ) : (
                        item.desiredQuantity
                      )}
                    </TableCell>
                    <TableCell>
                      {editingItem === item.id ? (
                        <div className="flex space-x-2">
                          <Button size="sm" onClick={() => handleEditSave(item.id)}>
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleEditCancel}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleEditStart(item)}>
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryManager;
