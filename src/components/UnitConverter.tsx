import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface InventoryItem {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  threshold: number;
  desiredQuantity: number;
}

interface UnitConverterProps {
  inventory: InventoryItem[];
  onConvert: (updatedInventory: InventoryItem[]) => void;
}

// Conversion rates - customize these as needed
const conversionRates = {
  'bags': 70, // 1 bag = 70 kg
  '50kg': 50, // 1 unit of 50kg = 50 kg
};

const UnitConverter = ({ inventory, onConvert }: UnitConverterProps) => {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [fromUnit, setFromUnit] = useState('');
  const [quantityToConvert, setQuantityToConvert] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Get available products that have stock in bags or 50kg units
  const convertibleItems = inventory.filter(item => 
    (item.unit === 'bags' || item.unit === '50kg') && item.quantity > 0
  );

  const selectedItem = inventory.find(item => item.product === selectedProduct);

  const handleConvert = () => {
    if (!selectedProduct || !quantityToConvert || !fromUnit) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const convertQuantity = parseInt(quantityToConvert);
    const selectedInventoryItem = inventory.find(item => item.product === selectedProduct);

    if (!selectedInventoryItem || selectedInventoryItem.quantity < convertQuantity) {
      toast({
        title: "Error",
        description: "Not enough stock to convert",
        variant: "destructive"
      });
      return;
    }

    // Calculate kg equivalent
    const kgEquivalent = convertQuantity * conversionRates[fromUnit as keyof typeof conversionRates];

    // Update inventory
    const updatedInventory = inventory.map(item => {
      if (item.product === selectedProduct && item.unit === fromUnit) {
        // Reduce the original unit quantity
        return { ...item, quantity: item.quantity - convertQuantity };
      }
      return item;
    });

    // Check if there's already a kg entry for this product
    const existingKgItem = updatedInventory.find(item => 
      item.product === selectedProduct && item.unit === 'kg'
    );

    if (existingKgItem) {
      // Add to existing kg stock
      const finalInventory = updatedInventory.map(item => 
        item.id === existingKgItem.id 
          ? { ...item, quantity: item.quantity + kgEquivalent }
          : item
      );
      onConvert(finalInventory);
    } else {
      // Create new kg entry
      const newKgItem: InventoryItem = {
        id: `${selectedProduct}_kg_${Date.now()}`,
        product: selectedProduct,
        quantity: kgEquivalent,
        unit: 'kg',
        threshold: 15,
        desiredQuantity: 25
      };
      onConvert([...updatedInventory, newKgItem]);
    }

    toast({
      title: "Conversion Successful",
      description: `Converted ${convertQuantity} ${fromUnit} to ${kgEquivalent} kg of ${selectedProduct}`,
    });

    // Reset form
    setSelectedProduct('');
    setFromUnit('');
    setQuantityToConvert('');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center space-x-2">
          <RotateCcw className="w-4 h-4" />
          <span>Convert Units</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unit Converter</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product">Select Product</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Choose product to convert" />
              </SelectTrigger>
              <SelectContent>
                {convertibleItems.map(item => (
                  <SelectItem key={`${item.product}_${item.unit}`} value={item.product}>
                    {item.product} ({item.quantity} {item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fromUnit">From Unit</Label>
                <Select value={fromUnit} onValueChange={setFromUnit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit to convert from" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory
                      .filter(item => item.product === selectedProduct && (item.unit === 'bags' || item.unit === '50kg'))
                      .map(item => (
                        <SelectItem key={item.unit} value={item.unit}>
                          {item.unit} (Available: {item.quantity})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity to Convert</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={quantityToConvert}
                  onChange={(e) => setQuantityToConvert(e.target.value)}
                  placeholder="Enter quantity"
                  min="1"
                  max={selectedItem?.quantity || 0}
                />
              </div>

              {fromUnit && quantityToConvert && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Converting {quantityToConvert} {fromUnit} will give you{' '}
                    <strong>
                      {parseInt(quantityToConvert) * conversionRates[fromUnit as keyof typeof conversionRates]} kg
                    </strong>
                  </p>
                </div>
              )}

              <div className="flex space-x-2">
                <Button onClick={handleConvert} className="flex-1">
                  Convert
                </Button>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {convertibleItems.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No items available for conversion. Add bags or 50kg units to inventory first.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UnitConverter;