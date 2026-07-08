import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileSpreadsheet, Check, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getEffectiveUnitPrice, canonicalUnitKey } from '@/lib/units';

interface BulkSalesUploadProps {
  shopId: string;
  onUploadComplete?: () => void;
}

interface ParsedRow {
  date: string;
  customer_name: string;
  product: string;
  raw_product: string;
  product_known: boolean;
  quantity: number;
  unit: string;
  unit_price?: number | null;
  valid: boolean;
  error?: string;
}

const BulkSalesUpload: React.FC<BulkSalesUploadProps> = ({ shopId, onUploadComplete }) => {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [knownProducts, setKnownProducts] = useState<string[]>([]);
  // Default price lookup keyed as `${lower(product)}||${lower(unit)}`
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [priceRows, setPriceRows] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const load = async () => {
      const { data: invData } = await supabase
        .from('inventory')
        .select('product')
        .eq('shop_id', shopId);
      const unique = Array.from(new Set(((invData as any[]) || []).map(r => String(r.product).trim()).filter(Boolean)));
      unique.sort((a, b) => a.localeCompare(b));
      setKnownProducts(unique);

      const { data: priceData } = await supabase
        .from('product_prices')
        .select('product, unit, price')
        .eq('shop_id', shopId);
      const pm: Record<string, number> = {};
      for (const p of (priceData as any[]) || []) {
        pm[`${String(p.product).toLowerCase()}||${String(p.unit).toLowerCase()}`] = Number(p.price);
      }
      setPriceMap(pm);
      setPriceRows((priceData as any[]) || []);

      const { data: pmData } = await supabase.from('payment_methods').select('*').eq('is_active', true).order('name');
      setPaymentMethods(pmData || []);
      if (pmData && pmData.length) setPaymentMethodId(pmData[0].id);
    };
    if (shopId) load();
  }, [shopId]);

  // Resolve unit price using the same rules as SalesTab (per-kg ↔ pack derivations).
  const resolvePrice = (product: string, unit: string): number => {
    const k = canonicalUnitKey(unit);
    if (k) {
      const eff = getEffectiveUnitPrice(priceRows as any, product, k);
      if (eff && eff.value > 0) return eff.value;
    }
    const direct = priceMap[`${product.toLowerCase()}||${unit.toLowerCase()}`];
    return direct > 0 ? direct : 0;
  };

  const fixRowProduct = (index: number, product: string) => {
    setParsedRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const basicsOk = !!r.date && !!r.customer_name && !!product && r.quantity > 0;
      const defaultPrice = resolvePrice(product, r.unit);
      return {
        ...r, product, product_known: true, valid: basicsOk,
        unit_price: r.unit_price ?? (defaultPrice > 0 ? defaultPrice : null),
        error: basicsOk ? undefined : r.error,
      };
    }));
  };

  const PRODUCT_ALIASES: Record<string, string> = {
    'hydm': 'High yield dairy meal', 'high yield': 'High yield dairy meal',
    'dm': 'Dairy meal', 'dairy': 'Dairy meal',
    'lm': 'Layers mash', 'layers': 'Layers mash',
    'gm': 'Growers mash', 'growers': 'Growers mash',
    'km': 'Kienyeji mash', 'kienyeji': 'Kienyeji mash',
    'pg': 'Pig grower', 'pig': 'Pig grower',
    'sw': 'Sow weaner', 'sow': 'Sow weaner',
    'mg': 'Maize germ', 'maize': 'Maize germ',
    'bran': 'Wheat Bran', 'wheat bran': 'Wheat Bran',
    'polland': 'Polland', 'poll': 'Polland',
    'bs': 'Broiler starter', 'bf': 'Broiler finisher',
    'cs': 'Calf starter', 'dp': 'Dairy Pellets',
  };

  const resolveProduct = (raw: string): string => {
    const lower = raw.trim().toLowerCase();
    return PRODUCT_ALIASES[lower] || raw.trim();
  };

  const resolveUnit = (raw: string, qty: number): string => {
    const lower = raw.trim().toLowerCase();
    if (lower.includes('50')) return '50kg';
    if (lower.includes('35')) return '35kg';
    if (lower.includes('10')) return '10kg';
    if (lower.includes('bag') || lower.includes('70') || lower === 'bags') return 'Bags';
    if (qty === 0.5) return 'Bags'; // half bag
    return raw.trim() || 'Bags';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < Math.min(json.length, 10); i++) {
        const row = json[i].map((c: any) => String(c).toLowerCase());
        if (row.some(c => c.includes('date')) && row.some(c => c.includes('customer') || c.includes('name'))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        // Try auto-detect: assume columns are Date, Customer, Product, Quantity, Unit
        headerIdx = 0;
      }

      const headers = json[headerIdx].map((h: any) => String(h).toLowerCase().trim());
      const dateCol = headers.findIndex(h => h.includes('date'));
      const customerCol = headers.findIndex(h => h.includes('customer') || h.includes('name'));
      const productCol = headers.findIndex(h => h.includes('product') || h.includes('item') || h.includes('feed'));
      const quantityCol = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('amount'));
      const unitCol = headers.findIndex(h => h.includes('unit') || h.includes('size') || h.includes('kg'));

      const rows: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.every((c: any) => !c && c !== 0)) continue;

        const rawDate = row[dateCol >= 0 ? dateCol : 0];
        const rawCustomer = String(row[customerCol >= 0 ? customerCol : 1] || '').trim();
        const rawProduct = String(row[productCol >= 0 ? productCol : 2] || '').trim();
        const rawQty = Number(row[quantityCol >= 0 ? quantityCol : 3]) || 0;
        const rawUnit = String(row[unitCol >= 0 ? unitCol : 4] || 'Bags').trim();

        if (!rawCustomer && !rawProduct) continue;

        let dateStr = '';
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().split('T')[0];
        } else if (typeof rawDate === 'number') {
          // Excel serial date
          const d = XLSX.SSF.parse_date_code(rawDate);
          dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        } else {
          dateStr = String(rawDate).trim();
          // Parse dd/mm/yyyy or mm/dd/yyyy formats manually to avoid timezone issues
          const slashMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
          if (slashMatch) {
            const [, a, b, y] = slashMatch;
            // Assume dd/mm/yyyy format (common in Kenya)
            const day = a.padStart(2, '0');
            const month = b.padStart(2, '0');
            dateStr = `${y}-${month}-${day}`;
          } else {
            // Fallback: try parsing but use local date parts to avoid timezone shift
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              dateStr = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
            }
          }
        }

        const product = resolveProduct(rawProduct);
        const product_known = knownProducts.length === 0
          ? true
          : knownProducts.some(p => p.toLowerCase() === product.toLowerCase());
        const unit = resolveUnit(rawUnit, rawQty);
        const basicsOk = !!dateStr && !!rawCustomer && !!product && rawQty > 0;
        const valid = basicsOk && product_known;
        let error: string | undefined;
        if (!basicsOk) {
          error = !dateStr ? 'Missing date' : !rawCustomer ? 'Missing customer' : !product ? 'Missing product' : 'Invalid quantity';
        } else if (!product_known) {
          error = 'Unknown product — pick from list';
        }
        const defaultPrice = resolvePrice(product, unit);
        rows.push({
          date: dateStr, customer_name: rawCustomer, product, raw_product: rawProduct, product_known,
          quantity: rawQty, unit,
          unit_price: defaultPrice > 0 ? defaultPrice : null,
          valid, error,
        });
      }

      setParsedRows(rows);
      setOpen(true);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to parse file. Ensure it has columns: Date, Customer, Product, Quantity, Unit', variant: 'destructive' });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    const validRows = parsedRows.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Fix errors before uploading', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Group by date + customer for transactions
      const txMap: Record<string, ParsedRow[]> = {};
      validRows.forEach(row => {
        const key = `${row.date}_${row.customer_name}`;
        if (!txMap[key]) txMap[key] = [];
        txMap[key].push(row);
      });

      let insertedCount = 0;
      for (const [key, items] of Object.entries(txMap)) {
        const { date, customer_name } = items[0];
        
        const { data: tx, error: txErr } = await supabase.from('sales_transactions').insert({
          customer_name,
          shop_id: shopId,
          sale_date: date,
        } as any).select().single();

        if (txErr || !tx) continue;

        const salesItems = items.map(item => ({
          transaction_id: tx.id,
          product: item.product,
          quantity: item.quantity,
          unit: item.unit,
          ...(item.unit_price != null ? { unit_price: item.unit_price } : {}),
        }));

        await supabase.from('sales_items').insert(salesItems as any);
        insertedCount += items.length;

        // Update inventory
        for (const item of items) {
          const { data: inv } = await supabase.from('inventory')
            .select('*')
            .eq('shop_id', shopId)
            .ilike('product', item.product)
            .single();

          if (inv) {
            await supabase.from('inventory')
              .update({ quantity: Math.max(0, (inv as any).quantity - item.quantity) } as any)
              .eq('id', (inv as any).id);
          }
        }
      }

      toast({ title: 'Upload Complete', description: `${insertedCount} sales records imported from ${Object.keys(txMap).length} transactions` });
      setOpen(false);
      setParsedRows([]);
      onUploadComplete?.();
    } catch (err) {
      toast({ title: 'Upload Failed', description: 'An error occurred during upload', variant: 'destructive' });
    }
    setUploading(false);
  };

  const validCount = parsedRows.filter(r => r.valid).length;
  const errorCount = parsedRows.filter(r => !r.valid).length;

  return (
    <>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload Sales File
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Preview: {fileName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-3 mb-4">
            <Badge className="bg-green-600 text-white"><Check className="h-3 w-3 mr-1" />{validCount} valid</Badge>
            {errorCount > 0 && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{errorCount} errors</Badge>}
            {parsedRows.some(r => !r.product_known) && (
              <Badge className="bg-amber-600 text-white">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {parsedRows.filter(r => !r.product_known).length} unknown product(s) — pick from list
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, i) => (
                  <TableRow key={i} className={!row.valid ? 'bg-destructive/10' : ''}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.customer_name}</TableCell>
                    <TableCell>
                      {row.product_known ? (
                        row.product
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">From file: <span className="italic">{row.raw_product || '(blank)'}</span></div>
                          <Select value="" onValueChange={(v) => fixRowProduct(i, v)}>
                            <SelectTrigger className="w-48 h-8">
                              <SelectValue placeholder="Pick correct product…" />
                            </SelectTrigger>
                            <SelectContent>
                              {knownProducts.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.unit}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-24"
                        placeholder="—"
                        value={row.unit_price ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          setParsedRows(prev => prev.map((r, idx) => idx === i ? { ...r, unit_price: v } : r));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {row.valid ? (
                        <Badge className="bg-green-600 text-white">OK</Badge>
                      ) : (
                        <Badge variant="destructive">{row.error}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || validCount === 0 || parsedRows.some(r => !r.product_known)}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : `Import ${validCount} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkSalesUpload;
