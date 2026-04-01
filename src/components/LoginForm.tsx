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
          <div className="mx-auto mb-4 w-16 h-16">
            <img src="src/assets/kimp-feeds-logo.jpeg" alt="Kimp Feeds Logo" className="w-full h-full object-contain rounded-full" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Kimp Feeds</CardTitle>
          <p className="text-gray-600">Your partner in livestock Production.</p>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginForm;
