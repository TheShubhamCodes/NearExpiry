import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import TopNav from '../components/TopNav';
import { getHealth } from '../services/api';
import { ShieldCheck, HeartHandshake } from 'lucide-react';

export default function MainLayout() {
  const [backendStatus, setBackendStatus] = useState({
    loading: true,
    connected: false,
    dbState: 'unknown',
    data: null,
    error: null,
  });

  const checkStatus = async () => {
    try {
      const response = await getHealth();
      setBackendStatus({
        loading: false,
        connected: response.success,
        dbState: response.data?.database?.state || 'connected',
        data: response.data,
        error: null,
      });
    } catch (err) {
      setBackendStatus({
        loading: false,
        connected: false,
        dbState: 'disconnected',
        data: null,
        error: err.message || 'Cannot connect to backend server',
      });
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // refresh health every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 transition-colors duration-200">
      {/* Responsive Top Navigation — No left sidebar */}
      <TopNav backendStatus={backendStatus} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-8">
        <Outlet context={{ backendStatus, refreshStatus: checkStatus }} />
      </main>

      {/* Clean Glassmorphic Footer */}
      <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur-md py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p>
              © {new Date().getFullYear()} <span className="font-semibold text-slate-700">NearExpiry</span> — Supermarket Inventory & Batch Expiry Control. Single-Store Edition.
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${backendStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-medium text-slate-600">
                Express API: {backendStatus.connected ? 'Connected' : 'Offline'}
              </span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-medium text-slate-600">
              MongoDB: <span className="text-emerald-700 font-semibold">{backendStatus.dbState}</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
