import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { 
  Package, 
  Layers, 
  CalendarClock, 
  AlertTriangle, 
  Clock, 
  PlusCircle, 
  ScanLine, 
  Search, 
  TrendingDown, 
  ShieldCheck, 
  ShieldAlert, 
  ExternalLink, 
  RefreshCw, 
  Sparkles, 
  ArrowRight, 
  Info, 
  DollarSign,
  Calendar,
  RotateCcw,
  Trash2,
  CheckCircle2,
  PieChart as PieIcon,
  BarChart3,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { 
  getDashboardAnalytics, 
  getExpiryDistribution, 
  getCategoryValuation, 
  getMovementTrends, 
  getTopExpiryRiskProducts, 
  getFEFOCompliance,
  getFEFORecommendations
} from '../services/api';

export default function Welcome() {
  const { backendStatus, refreshStatus } = useOutletContext();
  const { showToast } = useToast();
  const { store } = useAuth();
  const navigate = useNavigate();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';

  // Date Filter State
  const [period, setPeriod] = useState('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Analytics Data
  const [analytics, setAnalytics] = useState(null);
  const [distribution, setDistribution] = useState([]);
  const [categories, setCategories] = useState([]);
  const [movementTrends, setMovementTrends] = useState([]);
  const [riskProducts, setRiskProducts] = useState([]);
  const [fefoCompliance, setFefoCompliance] = useState(null);
  const [topFefoPick, setTopFefoPick] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const params = {
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined
      };

      const [dashRes, distRes, catRes, trendRes, riskRes, fefoCompRes, fefoPickRes] = await Promise.all([
        getDashboardAnalytics(params).catch(() => null),
        getExpiryDistribution().catch(() => null),
        getCategoryValuation().catch(() => null),
        getMovementTrends(params).catch(() => null),
        getTopExpiryRiskProducts({ limit: 5 }).catch(() => null),
        getFEFOCompliance().catch(() => null),
        getFEFORecommendations().catch(() => null)
      ]);

      if (dashRes?.success) setAnalytics(dashRes.data);
      if (distRes?.success) setDistribution(distRes.data.distribution || []);
      if (catRes?.success) setCategories(catRes.data.categories || []);
      if (trendRes?.success) setMovementTrends(trendRes.data.timeline || []);
      if (riskRes?.success) setRiskProducts(riskRes.data.products || []);
      if (fefoCompRes?.success) setFefoCompliance(fefoCompRes.data);
      if (fefoPickRes?.data && fefoPickRes.data.length > 0) {
        setTopFefoPick(fefoPickRes.data[0]);
      } else {
        setTopFefoPick(null);
      }
    } catch (err) {
      console.error('Failed to load dashboard analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [period]);

  const handleCustomDateSubmit = (e) => {
    e.preventDefault();
    if (customStart && customEnd) {
      fetchDashboardData();
    }
  };

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  // Filter distribution for active pie slices (units > 0)
  const activePieData = useMemo(() => {
    return distribution.filter((d) => d.units > 0);
  }, [distribution]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* ========================================================================= */}
      {/* 1. WELCOME HERO & PERIOD FILTER BAR */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-7 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 text-white shadow-glass">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-semibold border border-emerald-400/30">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Single-Store Business Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Inventory & Expiry Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
            Real-time physical valuation, shelf-life risk tiers, markdown promotions, and supplier return recovery tracking.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2.5 text-right sm:text-left">
            <p className="text-[11px] text-emerald-200 font-medium">Store Timezone: {analytics?.dateRange?.timezone || 'Asia/Kolkata'}</p>
            <p className="text-xs font-bold text-white tracking-wide mt-0.5">{currentDateFormatted}</p>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={() => {
              refreshStatus();
              fetchDashboardData();
              showToast({
                title: 'Data Refreshed',
                message: 'All business metrics and inventory valuations recalculated.',
                type: 'info'
              });
            }}
            className="bg-white/90 hover:bg-white text-emerald-800 border-none shadow-sm"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Date Filter Ribbon */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">Analytics Timeframe:</span>
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-xs font-semibold w-40"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="custom">Custom Date Range</option>
          </Select>
        </div>

        {period === 'custom' && (
          <form onSubmit={handleCustomDateSubmit} className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="text-xs w-36"
              required
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="text-xs w-36"
              required
            />
            <Button type="submit" variant="primary" size="xs">
              Apply
            </Button>
          </form>
        )}

        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Comparing performance against the equivalent previous {analytics?.dateRange?.periodLabel || 'period'}.</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. URGENT OPERATIONAL ALERTS (EXPIRED STOCK & TOP FEFO) */}
      {/* ========================================================================= */}
      {analytics?.inventoryValuation?.expired?.units > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-rose-500/10 via-red-50 to-rose-100/30 border border-rose-300/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-600 text-white">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-rose-900">
                Action Required: {analytics.inventoryValuation.expired.units} Expired Units Awaiting Quarantine
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                {analytics.inventoryValuation.expired.batchesCount} batch(es) past shelf life ({currencySymbol}{analytics.inventoryValuation.expired.costValue.toFixed(2)} cost loss). Segregate immediately from sales floor.
              </p>
            </div>
          </div>

          <Link to="/actions?tab=quarantine">
            <Button variant="primary" size="sm" icon={ShieldAlert} className="bg-rose-600 hover:bg-rose-700 text-white whitespace-nowrap">
              Quarantine Expired Stock
            </Button>
          </Link>
        </div>
      )}

      {topFefoPick && topFefoPick.fefoPickBatch && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-50 to-emerald-100/30 border border-emerald-300/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-600 text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                  Top FEFO Dispatch Pick
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {topFefoPick.product?.name}
                </span>
              </div>
              <p className="text-xs text-emerald-950 font-medium mt-1">
                Batch #{topFefoPick.fefoPickBatch.batchNumber || 'Primary'} ({topFefoPick.fefoPickBatch.currentQuantity} units) expires on {topFefoPick.fefoPickBatch.expiryDateFormatted} ({topFefoPick.fefoPickBatch.daysUntilExpiry === 0 ? 'TODAY' : `${topFefoPick.fefoPickBatch.daysUntilExpiry} days left`}). Shelve or sell this batch first.
              </p>
            </div>
          </div>

          <Link to="/expiry">
            <Button variant="secondary" size="sm" icon={ArrowRight} className="whitespace-nowrap">
              Open FEFO Queue
            </Button>
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BUSINESS KPI OVERVIEW GRID (ZERO DOUBLE-COUNTING) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Physical Inventory Valuation */}
        <Card hoverEffect className="bg-gradient-to-br from-emerald-50/70 to-white border-emerald-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Physical Inventory (Cost)
              </span>
              <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.inventoryValuation?.totalPhysicalCostValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{analytics?.inventoryValuation?.totalPhysicalUnits || 0} physical units in store</span>
              <span className="font-semibold text-emerald-700">Zero double-count</span>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                {analytics?.inventoryValuation?.saleable?.units || 0} Saleable
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                {analytics?.inventoryValuation?.expired?.units || 0} Expired
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                {analytics?.inventoryValuation?.quarantined?.units || 0} Quarantined
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Saleable Inventory & Retail Value */}
        <Card hoverEffect className="bg-gradient-to-br from-teal-50/70 to-white border-teal-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                Saleable Retail Value
              </span>
              <div className="p-2 rounded-xl bg-teal-100/80 text-teal-700">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.inventoryValuation?.saleable?.retailValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Cost: {currencySymbol}{analytics?.inventoryValuation?.saleable?.costValue?.toFixed(2) || '0.00'}</span>
              <span className="font-semibold text-slate-700">{analytics?.inventoryValuation?.saleable?.batchesCount || 0} batches</span>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-teal-800 font-semibold">
              <span>Potential Margin</span>
              <span>
                {currencySymbol}{((analytics?.inventoryValuation?.saleable?.retailValue || 0) - (analytics?.inventoryValuation?.saleable?.costValue || 0)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Near-Expiry Value at Risk */}
        <Card hoverEffect className="bg-gradient-to-br from-amber-50/70 to-white border-amber-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Near-Expiry Value at Risk
              </span>
              <div className="p-2 rounded-xl bg-amber-100/80 text-amber-700">
                <CalendarClock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.inventoryValuation?.nearExpiry?.costValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{analytics?.inventoryValuation?.nearExpiry?.units || 0} units approaching expiry</span>
              <span className="font-semibold text-amber-700">≤ 7 days</span>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100">
              <Link to="/actions?tab=markdowns" className="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center justify-between">
                <span>Promote Markdowns</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Low Stock & Reorder Alert */}
        <Card hoverEffect className="bg-gradient-to-br from-blue-50/70 to-white border-blue-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                Low Stock & Reorders
              </span>
              <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {analytics?.catalog?.lowStockProductsCount || 0} <span className="text-sm font-normal text-slate-500">SKUs</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Threshold: ≤ {analytics?.storeSettings?.lowStockThreshold || 5} units</span>
              <span>{analytics?.catalog?.totalProducts || 0} total SKUs</span>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100">
              <Link to="/reports?type=lowStock" className="text-[11px] font-bold text-blue-800 hover:text-blue-900 flex items-center justify-between">
                <span>View Reorder Report</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 5: Active Markdowns Value */}
        <Card hoverEffect className="bg-gradient-to-br from-indigo-50/70 to-white border-indigo-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                Active Markdown Value
              </span>
              <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.actions?.markdowns?.activeMarkdownValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{analytics?.actions?.markdowns?.activeCount || 0} active discount campaigns</span>
              <Link to="/actions?tab=markdowns" className="text-indigo-700 font-bold hover:underline">
                Manage
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 6: Pending Supplier Recovery */}
        <Card hoverEffect className="bg-gradient-to-br from-cyan-50/70 to-white border-cyan-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                Pending Return Value
              </span>
              <div className="p-2 rounded-xl bg-cyan-100/80 text-cyan-700">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.actions?.supplierReturns?.pendingRecoveryValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{analytics?.actions?.supplierReturns?.pendingCount || 0} pending tickets</span>
              <Link to="/actions?tab=returns" className="text-cyan-700 font-bold hover:underline">
                View
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* KPI 7: Disposal & Write-Off Loss (Period) */}
        <Card hoverEffect className="bg-gradient-to-br from-rose-50/70 to-white border-rose-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Disposal Loss ({analytics?.dateRange?.periodLabel || 'Period'})
              </span>
              <div className="p-2 rounded-xl bg-rose-100/80 text-rose-700">
                <Trash2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{analytics?.actions?.disposalLoss?.currentPeriod?.costLoss?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{analytics?.actions?.disposalLoss?.currentPeriod?.units || 0} units written off</span>
              <div className="flex items-center font-bold text-xs">
                {analytics?.actions?.disposalLoss?.percentChange > 0 ? (
                  <span className="text-rose-600 flex items-center">
                    <ArrowUpRight className="w-3.5 h-3.5" /> +{analytics.actions.disposalLoss.percentChange}%
                  </span>
                ) : analytics?.actions?.disposalLoss?.percentChange < 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <ArrowDownRight className="w-3.5 h-3.5" /> {analytics.actions.disposalLoss.percentChange}%
                  </span>
                ) : (
                  <span className="text-slate-400">0.0%</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI 8: Stock Movements Throughput */}
        <Card hoverEffect className="bg-gradient-to-br from-purple-50/70 to-white border-purple-100">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-800">
                Stock Throughput ({analytics?.dateRange?.periodLabel || 'Period'})
              </span>
              <div className="p-2 rounded-xl bg-purple-100/80 text-purple-700">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">
              {analytics?.movements?.currentPeriod?.receivedUnits || 0} <span className="text-sm font-normal text-slate-500">rec'd</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Out: {(analytics?.movements?.currentPeriod?.disposedUnitsMoved || 0) + (analytics?.movements?.currentPeriod?.returnedToSupplierUnits || 0)} units</span>
              <div className="flex items-center font-bold text-xs">
                {analytics?.movements?.receivedPercentChange > 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <ArrowUpRight className="w-3.5 h-3.5" /> +{analytics.movements.receivedPercentChange}%
                  </span>
                ) : analytics?.movements?.receivedPercentChange < 0 ? (
                  <span className="text-rose-600 flex items-center">
                    <ArrowDownRight className="w-3.5 h-3.5" /> {analytics.movements.receivedPercentChange}%
                  </span>
                ) : (
                  <span className="text-slate-400">0.0%</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ========================================================================= */}
      {/* 4. VISUAL ANALYTICS: CHARTS ROW 1 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left (5 cols): Expiry Status Distribution Donut Chart */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-600" />
                <span>Inventory Shelf-Life Distribution</span>
              </CardTitle>
              <Badge variant="neutral" size="sm">
                {analytics?.inventoryValuation?.totalPhysicalUnits || 0} units
              </Badge>
            </div>
            <CardDescription>
              Units categorized by remaining shelf-life days in store timezone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activePieData.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No active inventory units to display in distribution.
              </div>
            ) : (
              <div className="h-64 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activePieData}
                      dataKey="units"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {activePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name, item) => [
                        `${val} units (${currencySymbol}${item.payload.costValue})`,
                        item.payload.label
                      ]}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900">
                    {analytics?.inventoryValuation?.totalPhysicalUnits || 0}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Units</span>
                </div>
              </div>
            )}

            {/* Custom Legend */}
            <div className="mt-3 grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
              {distribution.map((d) => (
                <div key={d.status} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50/60">
                  <div className="flex items-center gap-1.5 truncate">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-600 font-medium truncate">{d.label}</span>
                  </div>
                  <span className="font-bold text-slate-900 ml-2">{d.units}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right (7 cols): Movement Trends Timeline AreaChart */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Stock Movement Trends Timeline</span>
              </CardTitle>
              <Badge variant="neutral" size="sm">
                {analytics?.dateRange?.periodLabel || 'Last 30 Days'}
              </Badge>
            </div>
            <CardDescription>
              Chronological units received, adjusted, and disposed over the selected timeframe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movementTrends.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400">
                No stock movement events logged during this time range.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={movementTrends}>
                    <defs>
                      <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorDisposed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="received"
                      name="Stock Received"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorReceived)"
                    />
                    <Area
                      type="monotone"
                      dataKey="disposed"
                      name="Stock Disposed"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDisposed)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ========================================================================= */}
      {/* 5. VISUAL ANALYTICS: CHARTS ROW 2 (CATEGORIES & RISK TABLE) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left (6 cols): Category-wise Valuation BarChart */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Inventory Valuation by Product Category</span>
              </CardTitle>
              <Badge variant="neutral" size="sm">{categories.length} categories</Badge>
            </div>
            <CardDescription>
              Comparison of purchase cost value vs potential retail selling value.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No inventory batches currently in catalog categories.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categories.slice(0, 7)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(val) => [`${currencySymbol}${val}`, '']}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="costValue" name="Purchase Cost" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="retailValue" name="Retail Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right (6 cols): Top Expiry Risk Products & FEFO Compliance */}
        <Card className="lg:col-span-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Top Products by Expiry Financial Risk</span>
              </CardTitle>

              {fefoCompliance && (
                <Badge
                  variant={fefoCompliance.complianceRate >= 90 ? 'success' : fefoCompliance.complianceRate >= 75 ? 'warning' : 'danger'}
                  size="sm"
                >
                  FEFO: {fefoCompliance.complianceRate}%
                </Badge>
              )}
            </div>
            <CardDescription>
              Products with highest purchase value at risk from approaching shelf life.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {riskProducts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                No products currently at expiry risk. All inventory is fresh!
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Units at Risk</TableHead>
                    <TableHead>Cost at Risk</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskProducts.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {p.brand ? `${p.brand} • ` : ''}{p.category}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <span>{(p.expiringSoonUnits || 0) + (p.criticalUnits || 0) + (p.expiringTodayUnits || 0) + (p.expiredUnits || 0)} {p.unit}s</span>
                          {p.expiredUnits > 0 && (
                            <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1 rounded">
                              {p.expiredUnits} exp
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs font-extrabold text-rose-600">
                          {currencySymbol}{p.costAtRisk?.toFixed(2)}
                        </span>
                      </TableCell>

                      <TableCell className="text-right">
                        <Link to="/actions?tab=markdowns">
                          <Button variant="outline" size="xs" icon={Zap}>
                            Markdown
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Need full audit data?</span>
              <Link to="/reports" className="font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <span>Open Full Reports Center</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
