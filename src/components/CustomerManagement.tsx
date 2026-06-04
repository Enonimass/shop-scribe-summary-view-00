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
import { Users, Search, Edit, Phone, MapPin, Calendar, UserCheck, UserX, Moon, Eye, RefreshCw, Mail } from 'lucide-react';
import CustomerDetailDialog from '@/components/customers/CustomerDetailDialog';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  place: string | null;
  email?: string | null;
  shop_id: string;
  first_purchase_date: string | null;
  last_purchase_date: string | null;
  status: string | null;
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
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, [shopId]);

  const fetchCustomers = async () => {
    setLoading(true);
    let query = supabase.from('customers').select('*').order('name', { ascending: true });
    if (!isAdmin) query = query.eq('shop_id', shopId);
    const { data, error } = await query;
    if (error) console.error('Error fetching customers:', error);
    setCustomers((data as any) || []);
    setLoading(false);
  };

  const syncFromSales = async () => {
    setSyncing(true);
    const { error } = await supabase.rpc('sync_customers_from_sales', { p_shop_id: isAdmin ? null : shopId });
    if (error) toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Synced', description: 'Customer list refreshed from sales' });
    await fetchCustomers();
    setSyncing(false);
  };

  const getCustomerStatus = (customer: Customer): 'active' | 'inactive' | 'new' | 'dormant' => {
    // Manual dormant status takes priority (back-compat: 'dead' value is treated as 'dormant')
    if (customer.status === 'dormant' || customer.status === 'dead') return 'dormant';

    if (!customer.last_purchase_date) return 'inactive';
    const lastPurchase = new Date(customer.last_purchase_date);
    const now = new Date();
    const daysSinceLast = Math.floor((now.getTime() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24));

    // Auto-dormant: 90+ days inactive
    if (daysSinceLast > 90) return 'dormant';

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
    const counts = { total: shopFiltered.length, active: 0, inactive: 0, new: 0, current: 0, dormant: 0 };
    shopFiltered.forEach(c => {
      const status = getCustomerStatus(c);
      counts[status]++;
      if (status === 'active' || status === 'new') counts.current++;
    });
    return counts;
  }, [customers, shopFilter]);

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditName(customer.name);
    setEditEmail(customer.email || '');
    setEditPhone(customer.phone || '');
    setEditPlace(customer.place || '');
    setEditStatus(customer.status || getCustomerStatus(customer));
  };

  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    const trimmedNew = editName.trim();
    if (!trimmedNew) {
      toast({ title: 'Name required', variant: 'destructive' }); return;
    }
    // If renaming, propagate via RPC across sales/debts/etc.
    if (trimmedNew.toLowerCase() !== editingCustomer.name.toLowerCase()) {
      const { data: rpc, error: rErr } = await supabase.rpc('rename_customer', {
        p_old: editingCustomer.name,
        p_new: trimmedNew,
        p_shop_id: editingCustomer.shop_id,
      });
      if (rErr) {
        toast({ title: 'Rename failed', description: rErr.message, variant: 'destructive' });
        return;
      }
      const r = (rpc as any) || {};
      toast({
        title: 'Customer renamed',
        description: `Updated in ${r.sales_transactions || 0} sales, ${r.debt_payments || 0} debt records, ${r.trip_stops || 0} trips.`,
      });
    }
    const { error } = await supabase.from('customers').update({
      name: trimmedNew,
      phone: editPhone || null,
      place: editPlace || null,
      email: editEmail || null,
      status: editStatus === 'dormant' ? 'dormant' : 'active',
    } as any).eq('id', editingCustomer.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update customer', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Customer details updated' });
      setEditingCustomer(null);
      fetchCustomers();
    }
  };

  const handleMarkDormant = async (customer: Customer) => {
    const newStatus = getCustomerStatus(customer) === 'dormant' ? 'active' : 'dormant';
    await supabase.from('customers').update({ status: newStatus } as any).eq('id', customer.id);
    toast({ title: 'Updated', description: `${customer.name} marked as ${newStatus}` });
    fetchCustomers();
  };

  const getShopName = (sid: string) => shops.find(s => s.shop_id === sid)?.shop_name || sid;

  const getStatusBadge = (customer: Customer) => {
    const status = getCustomerStatus(customer);
    switch (status) {
      case 'active': return <Badge className="bg-green-600 text-white">Active</Badge>;
      case 'new': return <Badge className="bg-blue-600 text-white">New</Badge>;
      case 'inactive': return <Badge variant="destructive">Inactive</Badge>;
      case 'dormant': return <Badge className="bg-gray-600 text-white">Dormant</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: statusCounts.total, filter: 'all', icon: Users, color: '' },
          { label: 'Active', count: statusCounts.active, filter: 'active', icon: UserCheck, color: 'text-green-600' },
          { label: 'New', count: statusCounts.new, filter: 'new', icon: UserCheck, color: 'text-blue-600' },
          { label: 'Current', count: statusCounts.current, filter: 'current', icon: UserCheck, color: 'text-green-600' },
          { label: 'Inactive', count: statusCounts.inactive, filter: 'inactive', icon: UserX, color: 'text-destructive' },
          { label: 'Dormant', count: statusCounts.dormant, filter: 'dormant', icon: Moon, color: 'text-gray-500' },
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
                <item.icon className={`h-5 w-5 ${item.color || 'text-muted-foreground'}`} />
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
                    {shops.map(s => <SelectItem key={s.shop_id} value={s.shop_id}>{s.shop_name}</SelectItem>)}
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
                  <SelectItem value="dormant">Dormant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Directory ({filteredCustomers.length})
            </CardTitle>
            <Button size="sm" variant="outline" onClick={syncFromSales} disabled={syncing}>
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Refresh from sales
            </Button>
          </div>
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
                    <TableHead>Email</TableHead>
                    {isAdmin && <TableHead>Shop</TableHead>}
                    <TableHead>First Purchase</TableHead>
                    <TableHead>Last Purchase</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map(customer => (
                    <TableRow key={customer.id} className={getCustomerStatus(customer) === 'dormant' ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
                        ) : <span className="text-muted-foreground text-xs">Not set</span>}
                      </TableCell>
                      <TableCell>
                        {customer.place ? (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{customer.place}</span>
                        ) : <span className="text-muted-foreground text-xs">Not set</span>}
                      </TableCell>
                      <TableCell>
                        {customer.email ? (
                          <span className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" />{customer.email}</span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
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
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setViewingCustomer(customer)} title="View details">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEditCustomer(customer)}>
                            <Edit className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={getCustomerStatus(customer) === 'dormant' ? 'secondary' : 'ghost'}
                            onClick={() => handleMarkDormant(customer)}
                            title={getCustomerStatus(customer) === 'dormant' ? 'Reactivate customer' : 'Mark as dormant'}
                          >
                            <Moon className="h-3 w-3" />
                          </Button>
                        </div>
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
              <Label>Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Customer name" />
              <p className="text-xs text-muted-foreground">Renaming updates sales, debts and trip records for this shop.</p>
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="e.g. 0712345678" />
            </div>
            <div className="space-y-2">
              <Label>Place / Location</Label>
              <Input value={editPlace} onChange={e => setEditPlace(e.target.value)} placeholder="e.g. Nakuru" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="e.g. name@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="dormant">Dormant (Inactive long-term)</SelectItem>
                </SelectContent>
              </Select>
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
      <CustomerDetailDialog customer={viewingCustomer} onClose={() => setViewingCustomer(null)} shopName={viewingCustomer ? getShopName(viewingCustomer.shop_id) : undefined} />
    </div>
  );
};

export default CustomerManagement;
