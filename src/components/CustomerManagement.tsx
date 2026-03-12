import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Users, Search, Edit, Phone, MapPin, Calendar, UserCheck, UserX, Filter } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  place: string | null;
  shop_id: string;
  first_purchase_date: string | null;
  last_purchase_date: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomerManagementProps {
  shopId: string;
  shops?: { shop_id: string; shop_name: string }[];
  isAdmin?: boolean;
}

const CustomerManagement: React.FC<CustomerManagementProps> = ({ shopId, shops = [], isAdmin = false }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shopFilter, setShopFilter] = useState(isAdmin ? 'all' : shopId);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, [shopId]);

  const fetchCustomers = async () => {
    setLoading(true);
    // Fetch customers
    let query = supabase.from('customers').select('*');
    if (!isAdmin) {
      query = query.eq('shop_id', shopId);
    }
    const { data: existingCustomers, error } = await query;
    
    if (error) {
      console.error('Error fetching customers:', error);
      setLoading(false);
      return;
    }

    // Also sync from sales_transactions to auto-create missing customers
    let salesQuery = supabase.from('sales_transactions').select('customer_name, shop_id, sale_date');
    if (!isAdmin) {
      salesQuery = salesQuery.eq('shop_id', shopId);
    }
    const { data: salesData } = await salesQuery;

    if (salesData && salesData.length > 0) {
      // Group by customer_name + shop_id to find first/last purchase
      const customerMap: Record<string, { name: string; shop_id: string; first: string; last: string }> = {};
      salesData.forEach(sale => {
        const key = `${sale.customer_name?.toLowerCase()}_${sale.shop_id}`;
        if (!customerMap[key]) {
          customerMap[key] = { name: sale.customer_name, shop_id: sale.shop_id, first: sale.sale_date, last: sale.sale_date };
        } else {
          if (sale.sale_date < customerMap[key].first) customerMap[key].first = sale.sale_date;
          if (sale.sale_date > customerMap[key].last) customerMap[key].last = sale.sale_date;
        }
      });

      const existing = existingCustomers || [];
      const existingKeys = new Set(existing.map(c => `${c.name.toLowerCase()}_${c.shop_id}`));

      // Insert missing customers
      const toInsert = Object.entries(customerMap)
        .filter(([key]) => !existingKeys.has(key))
        .map(([_, val]) => ({
          name: val.name,
          shop_id: val.shop_id,
          first_purchase_date: val.first,
          last_purchase_date: val.last,
        }));

      if (toInsert.length > 0) {
        await supabase.from('customers').insert(toInsert as any);
      }

      // Update first/last purchase dates for existing customers
      for (const customer of existing) {
        const key = `${customer.name.toLowerCase()}_${customer.shop_id}`;
        const salesInfo = customerMap[key];
        if (salesInfo) {
          const needsUpdate = 
            customer.first_purchase_date !== salesInfo.first || 
            customer.last_purchase_date !== salesInfo.last;
          if (needsUpdate) {
            await supabase.from('customers').update({
              first_purchase_date: salesInfo.first,
              last_purchase_date: salesInfo.last,
            } as any).eq('id', customer.id);
          }
        }
      }

      // Re-fetch after sync
      let refetchQuery = supabase.from('customers').select('*');
      if (!isAdmin) {
        refetchQuery = refetchQuery.eq('shop_id', shopId);
      }
      const { data: refreshed } = await refetchQuery;
      setCustomers((refreshed as any) || []);
    } else {
      setCustomers((existingCustomers as any) || []);
    }
    setLoading(false);
  };

  const getCustomerStatus = (customer: Customer): 'active' | 'inactive' | 'new' => {
    if (!customer.last_purchase_date) return 'inactive';
    const lastPurchase = new Date(customer.last_purchase_date);
    const now = new Date();
    const daysSinceLast = Math.floor((now.getTime() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24));
    
    if (!customer.first_purchase_date) return 'inactive';
    const firstPurchase = new Date(customer.first_purchase_date);
    const daysSinceFirst = Math.floor((now.getTime() - firstPurchase.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceFirst <= 30 && daysSinceLast <= 30) return 'new';
    if (daysSinceLast <= 30) return 'active';
    return 'inactive';
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = !searchTerm || 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.place?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesShop = shopFilter === 'all' || c.shop_id === shopFilter;
      
      const status = getCustomerStatus(c);
      const matchesStatus = statusFilter === 'all' || statusFilter === status ||
        (statusFilter === 'current' && (status === 'active' || status === 'new'));

      return matchesSearch && matchesShop && matchesStatus;
    });
  }, [customers, searchTerm, shopFilter, statusFilter]);

  const statusCounts = useMemo(() => {
    const shopFiltered = customers.filter(c => shopFilter === 'all' || c.shop_id === shopFilter);
    const counts = { total: shopFiltered.length, active: 0, inactive: 0, new: 0, current: 0 };
    shopFiltered.forEach(c => {
      const status = getCustomerStatus(c);
      counts[status]++;
      if (status === 'active' || status === 'new') counts.current++;
    });
    return counts;
  }, [customers, shopFilter]);

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditPhone(customer.phone || '');
    setEditPlace(customer.place || '');
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    const { error } = await supabase.from('customers').update({
      phone: editPhone || null,
      place: editPlace || null,
    } as any).eq('id', editingCustomer.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update customer', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Customer details updated' });
      setEditingCustomer(null);
      fetchCustomers();
    }
  };

  const getShopName = (sid: string) => {
    return shops.find(s => s.shop_id === sid)?.shop_name || sid;
  };

  const getStatusBadge = (customer: Customer) => {
    const status = getCustomerStatus(customer);
    switch (status) {
      case 'active': return <Badge className="bg-green-600 text-white">Active</Badge>;
      case 'new': return <Badge className="bg-blue-600 text-white">New</Badge>;
      case 'inactive': return <Badge variant="destructive">Inactive</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', count: statusCounts.total, filter: 'all', icon: Users },
          { label: 'Active', count: statusCounts.active, filter: 'active', icon: UserCheck },
          { label: 'New', count: statusCounts.new, filter: 'new', icon: UserCheck },
          { label: 'Current', count: statusCounts.current, filter: 'current', icon: UserCheck },
          { label: 'Inactive', count: statusCounts.inactive, filter: 'inactive', icon: UserX },
        ].map(item => (
          <Card 
            key={item.label} 
            className={`cursor-pointer transition-all ${statusFilter === item.filter ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
            onClick={() => setStatusFilter(item.filter)}
          >
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-bold text-foreground">{item.count}</p>
                </div>
                <item.icon className={`h-5 w-5 ${item.label === 'Inactive' ? 'text-destructive' : 'text-green-awesome'}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, phone, place..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            {isAdmin && shops.length > 0 && (
              <div className="space-y-2">
                <Label>Shop</Label>
                <Select value={shopFilter} onValueChange={setShopFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shops</SelectItem>
                    {shops.map(s => (
                      <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="current">Current (Active + New)</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Directory ({filteredCustomers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No customers found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Place</TableHead>
                    {isAdmin && <TableHead>Shop</TableHead>}
                    <TableHead>First Purchase</TableHead>
                    <TableHead>Last Purchase</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.place ? (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.place}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not set</span>
                        )}
                      </TableCell>
                      {isAdmin && <TableCell>{getShopName(customer.shop_id)}</TableCell>}
                      <TableCell>
                        {customer.first_purchase_date ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {new Date(customer.first_purchase_date).toLocaleDateString()}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {customer.last_purchase_date ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {new Date(customer.last_purchase_date).toLocaleDateString()}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(customer)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => handleEditCustomer(customer)}>
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer: {editingCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="e.g. 0712345678" />
            </div>
            <div className="space-y-2">
              <Label>Place / Location</Label>
              <Input value={editPlace} onChange={e => setEditPlace(e.target.value)} placeholder="e.g. Nakuru" />
            </div>
            {editingCustomer && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>First Purchase: {editingCustomer.first_purchase_date ? new Date(editingCustomer.first_purchase_date).toLocaleDateString() : 'N/A'}</p>
                <p>Last Purchase: {editingCustomer.last_purchase_date ? new Date(editingCustomer.last_purchase_date).toLocaleDateString() : 'N/A'}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerManagement;
