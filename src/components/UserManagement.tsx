import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, KeyRound, Trash2, Eye, EyeOff, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserManagementProps {
  profiles: any[];
  onProfilesUpdate: () => void;
}

const UserManagement = ({ profiles, onProfilesUpdate }: UserManagementProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});

  // Create user form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'seller' | 'admin'>('seller');
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');

  // Password reset state
  const [newPassword, setNewPassword] = useState('');

  // Edit user state
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editShopName, setEditShopName] = useState('');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          username,
          password,
          display_name: displayName,
          role,
          shop_id: role === 'seller' ? shopId : null,
          shop_name: role === 'seller' ? shopName : null,
        });

      if (error) {
        toast({
          title: "Failed to create user",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "User created successfully",
          description: `${displayName} has been added to the system.`,
        });
        
        // Reset form
        setUsername('');
        setPassword('');
        setDisplayName('');
        setRole('seller');
        setShopId('');
        setShopName('');
        setCreateUserOpen(false);
        onProfilesUpdate();
      }
    } catch (error) {
      toast({
        title: "Failed to create user",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ password: newPassword })
        .eq('id', selectedUser.id);

      if (error) {
        toast({
          title: "Failed to update password",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password updated",
          description: `Password for ${selectedUser.display_name} has been updated.`,
        });
        setNewPassword('');
        setPasswordResetOpen(false);
        setSelectedUser(null);
        onProfilesUpdate();
      }
    } catch (error) {
      toast({
        title: "Failed to update password",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: editUsername,
          display_name: editDisplayName,
          shop_name: editShopName || null,
        })
        .eq('id', selectedUser.id);

      if (error) {
        toast({
          title: "Failed to update user",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "User updated",
          description: `${editDisplayName} has been updated.`,
        });
        setEditUserOpen(false);
        setSelectedUser(null);
        onProfilesUpdate();
      }
    } catch (error) {
      toast({
        title: "Failed to update user",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const handleDeleteUser = async (profile: any) => {
    if (!confirm(`Are you sure you want to delete ${profile.display_name}? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);
      
      if (error) {
        toast({
          title: "Failed to delete user",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "User deleted",
          description: `${profile.display_name} has been removed from the system.`,
        });
        onProfilesUpdate();
      }
    } catch (error) {
      toast({
        title: "Failed to delete user",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  const togglePasswordVisibility = (profileId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [profileId]: !prev[profileId]
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>User Management</CardTitle>
          <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4" />
                <span>Add User</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">Display Name</Label>
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(value: 'seller' | 'admin') => setRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === 'seller' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="shop-id">Shop ID</Label>
                      <Input
                        id="shop-id"
                        type="text"
                        value={shopId}
                        onChange={(e) => setShopId(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shop-name">Shop Name</Label>
                      <Input
                        id="shop-name"
                        type="text"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating...' : 'Create User'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">{profile.username}</TableCell>
                <TableCell>{profile.display_name}</TableCell>
                <TableCell className="capitalize">{profile.role}</TableCell>
                <TableCell>{profile.shop_name || 'All Shops'}</TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm">
                      {showPasswords[profile.id] ? profile.password : '••••••••'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePasswordVisibility(profile.id)}
                      className="p-1"
                    >
                      {showPasswords[profile.id] ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(profile);
                        setEditUsername(profile.username);
                        setEditDisplayName(profile.display_name);
                        setEditShopName(profile.shop_name || '');
                        setEditUserOpen(true);
                      }}
                      className="flex items-center space-x-1"
                    >
                      <Edit className="w-3 h-3" />
                      <span>Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(profile);
                        setPasswordResetOpen(true);
                      }}
                      className="flex items-center space-x-1"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Reset</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteUser(profile)}
                      className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Password Reset Dialog */}
      <Dialog open={passwordResetOpen} onOpenChange={setPasswordResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedUser?.display_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {selectedUser?.display_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Display Name</Label>
              <Input
                id="edit-display-name"
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                required
              />
            </div>
            {selectedUser?.role === 'seller' && (
              <div className="space-y-2">
                <Label htmlFor="edit-shop-name">Shop Name</Label>
                <Input
                  id="edit-shop-name"
                  type="text"
                  value={editShopName}
                  onChange={(e) => setEditShopName(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update User'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default UserManagement;