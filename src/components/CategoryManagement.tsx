import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { FolderPlus, Trash2, Edit, Plus, Tag } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  products: string[];
}

const CategoryManagement: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchAllProducts();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    const { data: cats } = await supabase.from('product_categories').select('*') as any;
    const { data: items } = await supabase.from('product_category_items').select('*') as any;

    const mapped: Category[] = (cats || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      products: (items || []).filter((i: any) => i.category_id === cat.id).map((i: any) => i.product_name),
    }));
    setCategories(mapped);
    setLoading(false);
  };

  const fetchAllProducts = async () => {
    const { data: inventoryData } = await supabase.from('inventory').select('product');
    const { data: catalogData } = await supabase.from('product_category_items').select('product_name');
    const inventoryProducts = (inventoryData || []).map((d: any) => d.product);
    const catalogProducts = (catalogData || []).map((d: any) => d.product_name);
    const products = [...new Set([...inventoryProducts, ...catalogProducts])].sort();
    setAllProducts(products as string[]);
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: 'Error', description: 'Category name is required', variant: 'destructive' });
      return;
    }

    const { data: cat, error } = await supabase.from('product_categories').insert({ name: newCategoryName.trim() } as any).select().single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    if (selectedProducts.length > 0 && cat) {
      await supabase.from('product_category_items').insert(
        selectedProducts.map(p => ({ category_id: (cat as any).id, product_name: p })) as any
      );
    }

    toast({ title: 'Success', description: `Category "${newCategoryName}" created` });
    setShowCreateDialog(false);
    setNewCategoryName('');
    setSelectedProducts([]);
    fetchCategories();
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setSelectedProducts(category.products);
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || !newCategoryName.trim()) return;

    // Update name
    await supabase.from('product_categories').update({ name: newCategoryName.trim() } as any).eq('id', editingCategory.id);

    // Replace products: delete all, re-insert
    await supabase.from('product_category_items').delete().eq('category_id', editingCategory.id);
    if (selectedProducts.length > 0) {
      await supabase.from('product_category_items').insert(
        selectedProducts.map(p => ({ category_id: editingCategory.id, product_name: p })) as any
      );
    }

    toast({ title: 'Success', description: 'Category updated' });
    setEditingCategory(null);
    setNewCategoryName('');
    setSelectedProducts([]);
    fetchCategories();
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!confirm(`Delete category "${category.name}"?`)) return;
    await supabase.from('product_categories').delete().eq('id', category.id);
    toast({ title: 'Deleted', description: `Category "${category.name}" deleted` });
    fetchCategories();
  };

  const toggleProduct = (product: string) => {
    setSelectedProducts(prev => 
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    );
  };

  const dialogOpen = showCreateDialog || !!editingCategory;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Product Categories
          </CardTitle>
          <Button onClick={() => { setShowCreateDialog(true); setNewCategoryName(''); setSelectedProducts([]); }}>
            <Plus className="h-4 w-4 mr-1" /> New Category
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No categories yet. Create one to get started.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map(cat => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {cat.products.length > 0 ? cat.products.map(p => (
                        <Badge key={p} variant="secondary">{p}</Badge>
                      )) : (
                        <span className="text-muted-foreground text-xs">No products</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEditCategory(cat)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteCategory(cat)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setEditingCategory(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="e.g. Dairy, Poultry" />
            </div>
            <div className="space-y-2">
              <Label>Select Products</Label>
              <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2">
                {allProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products in inventory yet</p>
                ) : allProducts.map(product => (
                  <div key={product} className="flex items-center gap-2">
                    <Checkbox 
                      checked={selectedProducts.includes(product)}
                      onCheckedChange={() => toggleProduct(product)}
                      id={`product-${product}`}
                    />
                    <label htmlFor={`product-${product}`} className="text-sm cursor-pointer">{product}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingCategory(null); }}>Cancel</Button>
            <Button onClick={editingCategory ? handleSaveEdit : handleCreateCategory}>
              {editingCategory ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CategoryManagement;
