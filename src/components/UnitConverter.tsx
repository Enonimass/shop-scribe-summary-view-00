import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';
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

interface UnitConverterProps {
  inventory: InventoryItem[];
  onConvert: () => void;
  shopId: string;
}

// Conversion rates - customize these as needed
const conversionRates = {
  'bags': 70, // 1 bag = 70 kg
  '50kg': 50, // 1 unit of 50kg = 50 kg
};

const UnitConverter = ({ inventory, onConvert, shopId }: UnitConverterProps) => {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [fromUnit, setFromUnit] = useState('');
  const [quantityToConvert, setQuantityToConvert] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Get available products that have stock in bags or 50kg units
  const convertibleItems = inventory.filter(item => 
    (item.unit === 'bags' || item.unit === '50kg') && item.quantity > 0
  );

  const selectedItem = inventory.find(item => item.product === selectedProduct);

  const handleConvert = async () => {
    if (!selectedProduct || !quantityToConvert || !fromUnit) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    const convertQuantity = parseInt(quantityToConvert);
    const selectedInventoryItem = inventory.find(item => 
      item.product === selectedProduct && item.unit === fromUnit
    );

    if (!selectedInventoryItem || selectedInventoryItem.quantity < convertQuantity) {
      toast({
        title: "Error",
        description: "Not enough stock to convert",
        variant: "destructive"
      });
      return;
    }

    try {
      // Calculate kg equivalent
      const kgEquivalent = convertQuantity * conversionRates[fromUnit as keyof typeof conversionRates];

      // Update the original item quantity in database
      const { error: updateError } = await supabase
        .from('inventory')
        .update({ quantity: selectedInventoryItem.quantity - convertQuantity })
        .eq('id', selectedInventoryItem.id);

      if (updateError) {
        console.error('Error updating inventory:', updateError);
        toast({
          title: "Error",
          description: "Failed to update inventory",
          variant: "destructive"
        });
        return;
      }

      // Check if there's already a kg entry for this product
      const existingKgItem = inventory.find(item => 
        item.product === selectedProduct && item.unit === 'kgs' && item.shop_id === shopId
      );

      if (existingKgItem) {
        // Add to existing kg stock
        const { error: kgUpdateError } = await supabase
          .from('inventory')
          .update({ quantity: existingKgItem.quantity + kgEquivalent })
          .eq('id', existingKgItem.id);

        if (kgUpdateError) {
          console.error('Error updating kg inventory:', kgUpdateError);
          toast({
            title: "Error",
            description: "Failed to update kg inventory",
            variant: "destructive"
          });
          return;
        }
      } else {
        // Create new kg entry
        const { error: insertError } = await supabase
          .from('inventory')
          .insert({
            shop_id: shopId,
            product: selectedProduct,
            quantity: kgEquivalent,
            unit: 'kgs',
            threshold: 15,
            desired_quantity: 25
          });

        if (insertError) {
          console.error('Error creating kg inventory:', insertError);
          toast({
            title: "Error",
            description: "Failed to create kg inventory",
            variant: "destructive"
          });
          return;
        }
      }

      toast({
        title: "Conversion Successful",
        description: `Converted ${convertQuantity} ${fromUnit} to ${kgEquivalent} kgs of ${selectedProduct}`,
      });

      // Reset form and refresh data
      setSelectedProduct('');
      setFromUnit('');
      setQuantityToConvert('');
      setIsOpen(false);
      onConvert();
    } catch (error) {
      console.error('Error during conversion:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during conversion",
        variant: "destructive"
      });
    }
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