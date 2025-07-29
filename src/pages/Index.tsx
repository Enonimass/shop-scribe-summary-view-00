
import React from 'react';
import { AuthProvider, useAuth } from '../components/AuthProvider';
import LoginForm from '../components/LoginForm';
import SellerDashboard from '../components/SellerDashboard';
import AdminDashboard from '../components/AdminDashboard';

const AppContent = () => {
  const { profile, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  if (profile?.role === 'admin') {
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
