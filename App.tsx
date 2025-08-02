import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/navigation/ProtectedRoute';
import AdminRoute from './components/navigation/AdminRoute';
import './styles.css';

import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { BookingPage } from './pages/BookingPage';
import { TrackingPage } from './pages/TrackingPage';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminSettingsPage } from './pages/admin/SettingsPage';
import { AdminUserManagementPage } from './pages/admin/UserManagementPage';
import { RevenueAnalyticsPage } from './pages/admin/RevenueAnalyticsPage';
import { UploadSchedulesPage } from './pages/admin/UploadSchedulesPage';
import { ManageSchedulesPage } from './pages/admin/ManageSchedulesPage';


const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="app-container">
          <Header />
          <main>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/track" element={<TrackingPage />} />

              {/* Protected User Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <UserDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/book/:scheduleId"
                element={
                  <ProtectedRoute>
                    <BookingPage />
                  </ProtectedRoute>
                }
              />

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                  <Route path="users" element={<AdminUserManagementPage />} />
                  <Route path="revenue" element={<RevenueAnalyticsPage />} />
                  <Route path="schedules" element={<UploadSchedulesPage />} />
                  <Route path="manage-schedules" element={<ManageSchedulesPage />} />
              </Route>

              {/* Not Found Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
