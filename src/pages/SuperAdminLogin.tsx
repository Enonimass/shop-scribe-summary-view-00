import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Shield, Loader2 } from 'lucide-react';
import kimpFeedsLogo from '@/assets/kimp-feeds-logo.jpeg';

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'super_admin');
      // Note: anon cannot SELECT user_roles due to RLS, so count will be null.
      // We attempt bootstrap call to detect; simpler: try login mode by default,
      // and let users click "Create first super admin" if needed.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        navigate('/super-admin');
        return;
      }
      setMode('login');
    })();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
      return;
    }
    // Verify role
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    const { data: role } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('user_id', uid!)
      .eq('role', 'super_admin')
      .maybeSingle();
    if (!role) {
      await supabase.auth.signOut();
      toast({ title: 'Access denied', description: 'This account is not a super admin.', variant: 'destructive' });
      return;
    }
    navigate('/super-admin');
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('super-admin-manage', {
      body: { action: 'bootstrap', email, password },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Bootstrap failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Super admin created', description: 'You can now sign in.' });
    setMode('login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={kimpFeedsLogo} alt="Kimp Feeds" className="h-14 w-14 rounded-lg object-cover" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5" />
            Super Admin {mode === 'bootstrap' ? 'Setup' : 'Sign In'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={mode === 'bootstrap' ? handleBootstrap : handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'bootstrap' ? 'Create Super Admin' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === 'bootstrap' ? (
              <button className="text-primary underline" onClick={() => setMode('login')}>Back to sign in</button>
            ) : (
              <button className="text-muted-foreground hover:text-foreground underline" onClick={() => setMode('bootstrap')}>
                First time? Create the initial super admin
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminLogin;