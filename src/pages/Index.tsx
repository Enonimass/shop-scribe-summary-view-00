
import React from 'react';
import { useAuth } from '../components/AuthProvider';
import LoginForm from '../components/LoginForm';
import SellerDashboard from '../components/SellerDashboard';
import AdminDashboard from '../components/AdminDashboard';
import LogisticsDashboard from '../components/LogisticsDashboard';
import AccountantDashboard from '../components/AccountantDashboard';

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

  if (profile?.role === 'logistics') {
    return <LogisticsDashboard />;
  }

  if (profile?.role === 'accountant') {
    return <AccountantDashboard />;
  }

  return <SellerDashboard />;
};

const Index = () => {
  // AuthProvider is mounted at the App level so route guards share its state.
  return <AppContent />;
};

export default Index;
