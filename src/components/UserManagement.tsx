import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, KeyRound, Trash2 } from 'lucide-react';
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
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Create user form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'seller' | 'admin'>('seller');
  const [shopId, setShopId] = useState('');
  const [shopName, setShopName] = useState('');

  // Password reset state
  const [newPassword, setNewPassword] = useState('');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use admin API to create user
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          role,
          shop_id: shopId,
          shop_name: shopName,
        }
      });

      if (error) {
        toast({
          title: "Failed to create user",
          description: error.message,
          variant: "destructive",
        });
      } else {
        // Create profile record
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              user_id: data.user.id,
              username,
              role,
              shop_id: role === 'seller' ? shopId : null,
              shop_name: role === 'seller' ? shopName : null,
            });

          if (profileError) {
            toast({
              title: "Profile creation failed",
              description: profileError.message,
              variant: "destructive",
            });
          } else {
            toast({
              title: "User created successfully",
              description: `${username} has been added to the system.`,
            });
            
            // Reset form
            setEmail('');
            setPassword('');
            setUsername('');
            setRole('seller');
            setShopId('');
            setShopName('');
            setCreateUserOpen(false);
            onProfilesUpdate();
          }
        }
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
      const { error } = await supabase.auth.admin.updateUserById(
        selectedUser.user_id,
        { password: newPassword }
      );

      if (error) {
        toast({
          title: "Failed to update password",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password updated",
          description: `Password for ${selectedUser.username} has been updated.`,
        });
        setNewPassword('');
        setPasswordResetOpen(false);
        setSelectedUser(null);
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

  const handleDeleteUser = async (profile: any) => {
    if (!confirm(`Are you sure you want to delete ${profile.username}? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);

    try {
      // Delete user via admin API
      const { error: authError } = await supabase.auth.admin.deleteUser(profile.user_id);
      
      if (authError) {
        toast({
          title: "Failed to delete user",
          description: authError.message,
          variant: "destructive",
        });
      } else {
        // Profile will be deleted automatically due to cascade
        toast({
          title: "User deleted",
          description: `${profile.username} has been removed from the system.`,
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
              <TableHead>Role</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell>{profile.username}</TableCell>
                <TableCell className="capitalize">{profile.role}</TableCell>
                <TableCell>{profile.shop_name || 'All Shops'}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    profile.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {profile.role === 'admin' ? 'Admin' : 'Active'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
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
            <DialogTitle>Reset Password for {selectedUser?.username}</DialogTitle>
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
    </Card>
  );
};

export default UserManagement;