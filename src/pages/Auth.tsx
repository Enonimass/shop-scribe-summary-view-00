import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Store } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Login form state - updated for simplified auth
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use edge function for server-side password verification
      const { data, error } = await supabase.functions.invoke('login', {
        body: { username, password },
      });

      if (error || !data?.profile) {
        toast({
          title: "Login failed",
          description: "Invalid username or password.",
          variant: "destructive",
        });
      } else {
        // Store profile WITHOUT password in localStorage
        localStorage.setItem('currentUser', JSON.stringify(data.profile));
        
        toast({
          title: "Welcome back!",
          description: `Logged in as ${data.profile.display_name}`,
        });
        navigate('/');
      }
    } catch (error) {
      toast({
        title: "Login failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-light to-green-awesome p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16">
            <img src="src/assets/kimp-feeds-logo.jpeg" alt="Kimp Feeds Logo" className="w-full h-full object-contain rounded-full" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Kimp Feeds Limited
            Your Partner In Livestock Production
          </CardTitle>
          <CardDescription>Welcome to your livestock nutrition system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button type="submit" variant="green-awesome" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
