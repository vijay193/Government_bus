
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';

interface UserRouteProps {
  children: React.ReactNode;
}

const UserRoute: React.FC<UserRouteProps> = ({ children }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loader-overlay"><div className="page-loader"></div></div>;
  }

  // Redirect if not authenticated or not a regular USER
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (user?.role !== UserRole.USER) {
    // Admins/Sub-Admins get redirected to their dashboard
    return <Navigate to="/admin" replace />;
  }


  return <>{children}</>;
};

export default UserRoute;
