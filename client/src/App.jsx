import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Welcome from './pages/Welcome';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Expiry from './pages/Expiry';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Employees from './pages/Employees';
import Notifications from './pages/Notifications';
import Actions from './pages/Actions';
import AIInsights from './pages/AIInsights';
import InitialSetup from './pages/InitialSetup';
import Register from './pages/Register';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Setup & Auth Routes */}
              <Route path="/setup" element={<Register />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/unauthorized" element={<Unauthorized />} />

              {/* Protected Store Routes (Requires Authenticated Active User) */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<MainLayout />}>
                  <Route index element={<Welcome />} />
                  <Route path="products" element={<Products />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="expiry" element={<Expiry />} />
                  <Route path="actions" element={<Actions />} />
                  <Route path="ai-insights" element={<AIInsights />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="notifications" element={<Notifications />} />

                  {/* Owner-Only Routes */}
                  <Route element={<ProtectedRoute requireOwner />}>
                    <Route path="employees" element={<Employees />} />
                  </Route>
                </Route>
              </Route>

              {/* 404 Catch-All */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
