import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';

const LoginForm = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-light to-green-awesome p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-green-awesome rounded-full flex items-center justify-center">
            <Store className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Shop Manager</CardTitle>
          <p className="text-gray-600">Please authenticate to continue</p>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => navigate('/auth')} 
            variant="green-awesome"
            className="w-full"
          >
            Go to Login/Sign Up
          </Button>
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 mb-2">You'll need to create an account:</p>
            <div className="text-xs text-gray-600 space-y-1">
              <p>• Sellers: Set your shop ID and name</p>
              <p>• Admins: Select admin role for full access</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginForm;