
import React from 'react';
import { AuthProvider, useAuth } from '../components/AuthProvider';
import LoginForm from '../components/LoginForm';
import SellerDashboard from '../components/SellerDashboard';
import AdminDashboard from '../components/AdminDashboard';

const AppContent = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  return <SellerDashboard />;
};

const Index = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default Index;
