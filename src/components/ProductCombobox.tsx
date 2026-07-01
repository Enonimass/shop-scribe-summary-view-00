import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ProductComboboxProps {
  products: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Shared product picker. Callers pass the list of allowed products
 * (usually from inventory for the active shop). Users can only pick
 * from that list — no free-text entry, so product names stay uniform.
 */
const ProductCombobox: React.FC<ProductComboboxProps> = ({ products, value, onChange, placeholder = 'Select product…', className, disabled }) => {
  const [open, setOpen] = React.useState(false);
  const sorted = React.useMemo(
    () => [...products].sort((a, b) => a.localeCompare(b)),
    [products]
  );
  const missing = value && !sorted.some(p => p.toLowerCase() === value.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('h-8 justify-between font-normal', missing && 'border-destructive text-destructive', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product…" className="h-8" />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>
            <CommandGroup>
              {sorted.map(p => (
                <CommandItem key={p} value={p} onSelect={() => { onChange(p); setOpen(false); }}>
                  <Check className={cn('mr-2 h-4 w-4', value.toLowerCase() === p.toLowerCase() ? 'opacity-100' : 'opacity-0')} />
                  {p}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ProductCombobox;