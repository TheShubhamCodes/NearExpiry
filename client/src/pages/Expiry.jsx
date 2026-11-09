import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  CalendarClock, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert,
  Search, 
  Filter, 
  Clock, 
  Trash2,
  Tag,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Info,
  DollarSign,
  Package,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  List,
  Grid,
  Zap
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import AdjustStockModal from '../components/inventory/AdjustStockModal';
import BatchDetailModal from '../components/inventory/BatchDetailModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { 
  getExpirySummary, 
  getExpiryBatches, 
  getFEFORecommendations, 
  getExpiryCalendar, 
  getExpiryRiskAssessment,
  getProductCategories
} from '../services/api';

export default function Expiry() {
  const { showToast } = useToast();
  const { store } = useAuth();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';

  // Active top-level view tab
  const [activeTab, setActiveTab] = useState('fefo'); // 'fefo' | 'table' | 'calendar' | 'risk'

  // Summary KPIs
  const [summary, setSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // FEFO Recommendations State
  const [fefoData, setFefoData] = useState([]);
  const [isFefoLoading, setIsFefoLoading] = useState(false);
  const [fefoSearch, setFefoSearch] = useState('');

  // Table Batches State
  const [batches, setBatches] = useState([]);
  const [isBatchesLoading, setIsBatchesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('expiryDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBatchesCount, setTotalBatchesCount] = useState(0);

  // Calendar State
  const [calendarData, setCalendarData] = useState(null);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [calendarViewMode, setCalendarViewMode] = useState('grid'); // 'grid' | 'timeline'

  // Risk Assessment State
  const [riskData, setRiskData] = useState(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);

  // Modal State
  const [selectedBatchForAdjust, setSelectedBatchForAdjust] = useState(null);
  const [selectedBatchIdForDetail, setSelectedBatchIdForDetail] = useState(null);

  // Load summary KPIs
  const fetchSummary = async () => {
    try {
      setIsSummaryLoading(true);
      const res = await getExpirySummary();
      if (res?.success) {
        setSummary(res.data);
      }
    } catch (err) {
      console.warn('Failed to load expiry summary:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Load FEFO Recommendations
  const fetchFEFO = async () => {
    try {
      setIsFefoLoading(true);
      const res = await getFEFORecommendations();
      if (res?.success) {
        setFefoData(res.data || []);
      }
    } catch (err) {
      console.warn('Failed to load FEFO recommendations:', err);
    } finally {
      setIsFefoLoading(false);
    }
  };

  // Load Paginated Batches
  const fetchBatches = async () => {
    try {
      setIsBatchesLoading(true);
      const params = {
        page,
        limit: 10,
        sortBy,
        sortOrder,
        search: searchQuery || undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined
      };
      const res = await getExpiryBatches(params);
      if (res?.success) {
        setBatches(res.data || []);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalBatchesCount(res.pagination?.totalBatches || 0);
      }
    } catch (err) {
      console.warn('Failed to load expiry batches:', err);
    } finally {
      setIsBatchesLoading(false);
    }
  };

  // Load Calendar Data
  const fetchCalendar = async (month, year) => {
    try {
      setIsCalendarLoading(true);
      const res = await getExpiryCalendar({ month, year });
      if (res?.success) {
        setCalendarData(res.data);
        if (res.data?.today && !selectedDayKey) {
          setSelectedDayKey(res.data.today);
        }
      }
    } catch (err) {
      console.warn('Failed to load calendar data:', err);
    } finally {
      setIsCalendarLoading(false);
    }
  };

  // Load Risk Assessment
  const fetchRisk = async () => {
    try {
      setIsRiskLoading(true);
      const res = await getExpiryRiskAssessment();
      if (res?.success) {
        setRiskData(res.data);
      }
    } catch (err) {
      console.warn('Failed to load risk assessment:', err);
    } finally {
      setIsRiskLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSummary();
    getProductCategories().then((res) => {
      if (res?.success) setCategories(res.data || []);
    }).catch(() => {});
  }, []);

  // Fetch when tab changes
  useEffect(() => {
    if (activeTab === 'fefo') fetchFEFO();
    if (activeTab === 'table') fetchBatches();
    if (activeTab === 'calendar') fetchCalendar(selectedMonth, selectedYear);
    if (activeTab === 'risk') fetchRisk();
  }, [activeTab]);

  // Fetch table data when table filters change
  useEffect(() => {
    if (activeTab === 'table') {
      fetchBatches();
    }
  }, [page, statusFilter, categoryFilter, sortBy, sortOrder]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBatches();
  };

  // Calendar month navigation
  const handlePrevMonth = () => {
    let newMonth = selectedMonth - 1;
    let newYear = selectedYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setSelectedDayKey(null);
    fetchCalendar(newMonth, newYear);
  };

  const handleNextMonth = () => {
    let newMonth = selectedMonth + 1;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setSelectedDayKey(null);
    fetchCalendar(newMonth, newYear);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
    setSelectedDayKey(null);
    fetchCalendar(now.getMonth() + 1, now.getFullYear());
  };

  // Filter FEFO recommendations by search query
  const filteredFEFO = useMemo(() => {
    if (!fefoSearch.trim()) return fefoData;
    const q = fefoSearch.toLowerCase().trim();
    return fefoData.filter(
      (item) =>
        item.product?.name?.toLowerCase().includes(q) ||
        item.product?.brand?.toLowerCase().includes(q) ||
        item.product?.category?.toLowerCase().includes(q) ||
        item.batches?.some((b) => b.batchNumber?.toLowerCase().includes(q))
    );
  }, [fefoData, fefoSearch]);

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'EXPIRED':
        return <Badge variant="danger" dot>Expired</Badge>;
      case 'EXPIRING_TODAY':
        return <Badge variant="danger" dot>Expiring Today</Badge>;
      case 'CRITICAL':
        return <Badge variant="warning" dot>Critical (≤3d)</Badge>;
      case 'EXPIRING_SOON':
        return <Badge variant="warning">Expiring Soon</Badge>;
      case 'FRESH':
        return <Badge variant="fresh">Fresh</Badge>;
      case 'DEPLETED':
        return <Badge variant="neutral">Depleted</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Days remaining text & color helper
  const renderDaysText = (days, status) => {
    if (status === 'DEPLETED') {
      return <span className="text-slate-400 font-medium">0 remaining (0 units)</span>;
    }
    if (days < 0) {
      return <span className="text-rose-600 font-bold">{Math.abs(days)}d ago</span>;
    }
    if (days === 0) {
      return <span className="text-rose-600 font-extrabold animate-pulse">Expires Today</span>;
    }
    if (days === 1) {
      return <span className="text-amber-600 font-bold">Tomorrow (1d)</span>;
    }
    if (days <= 3) {
      return <span className="text-amber-600 font-semibold">{days} days left</span>;
    }
    if (days <= 7) {
      return <span className="text-amber-500 font-medium">{days} days left</span>;
    }
    return <span className="text-emerald-600 font-medium">{days} days</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CalendarClock className="w-6 h-6 text-emerald-600" />
            <span>Expiry & FEFO Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Enforce First Expired, First Out (FEFO) picking, monitor shelf life, and mitigate inventory shrinkage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {summary?.storeSettings?.timezone && (
            <Badge variant="neutral" size="sm">
              TZ: {summary.storeSettings.timezone}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              fetchSummary();
              if (activeTab === 'fefo') fetchFEFO();
              if (activeTab === 'table') fetchBatches();
              if (activeTab === 'calendar') fetchCalendar(selectedMonth, selectedYear);
              if (activeTab === 'risk') fetchRisk();
              showToast({ title: 'Refreshed', message: 'Expiry calculations updated.', type: 'info' });
            }}
          >
            Refresh
          </Button>

          <Link to="/actions">
            <Button variant="primary" size="sm" icon={Zap}>
              Near-Expiry Actions
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        
        {/* Expired Loss Card */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-rose-50/90 to-red-50/60 border border-rose-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Expired Stock</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-900">
            {summary?.expiredUnits ?? 0} <span className="text-xs font-normal text-rose-600">units</span>
          </div>
          <p className="text-[11px] text-rose-600/90 mt-1 font-medium">
            Loss: {currencySymbol}{summary?.expiredCostLoss ?? '0.00'} ({summary?.expiredBatches ?? 0} batches)
          </p>
        </div>

        {/* Expiring Today Card */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/90 to-orange-50/60 border border-amber-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Expiring Today</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-900">
            {summary?.expiringTodayUnits ?? 0} <span className="text-xs font-normal text-amber-600">units</span>
          </div>
          <p className="text-[11px] text-amber-700/90 mt-1 font-medium">
            {summary?.expiringTodayBatches ?? 0} active batch(es) on final day
          </p>
        </div>

        {/* Critical Card */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-orange-50/90 to-amber-50/50 border border-orange-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Critical (≤ 3d)</span>
            <ShieldAlert className="w-4 h-4 text-orange-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-orange-900">
            {summary?.criticalUnits ?? 0} <span className="text-xs font-normal text-orange-600">units</span>
          </div>
          <p className="text-[11px] text-orange-700/90 mt-1 font-medium">
            {summary?.criticalBatches ?? 0} urgent batch(es)
          </p>
        </div>

        {/* Expiring Soon Card */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-50/70 to-amber-50/40 border border-yellow-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-800">Expiring Soon (≤ 7d)</span>
            <CalendarClock className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-yellow-950">
            {summary?.expiringSoonUnits ?? 0} <span className="text-xs font-normal text-yellow-700">units</span>
          </div>
          <p className="text-[11px] text-yellow-800/80 mt-1 font-medium">
            {summary?.expiringSoonBatches ?? 0} batch(es) in warning window
          </p>
        </div>

        {/* Total Value at Risk */}
        <div className="col-span-2 lg:col-span-1 p-4 rounded-xl bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border border-emerald-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Value At Risk</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">
            {currencySymbol}{summary?.totalValueAtRisk ?? '0.00'}
          </div>
          <p className="text-[11px] text-emerald-700/90 mt-1 font-medium">
            Across {summary?.totalActiveBatches ?? 0} active batches
          </p>
        </div>

      </div>

      {/* Main View Mode Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 overflow-x-auto">
        <button
          onClick={() => setActiveTab('fefo')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'fefo'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>FEFO Dispatch Queue</span>
          {fefoData?.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold">
              {fefoData.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'table'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-600" />
          <span>Expiry Management Table</span>
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'calendar'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          <span>Monthly Calendar</span>
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'risk'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
          <span>Risk Assessment</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: FEFO RECOMMENDATIONS ENGINE */}
      {/* ========================================================================= */}
      {activeTab === 'fefo' && (
        <div className="space-y-4">
          
          {/* FEFO Explanatory Hero Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/50 to-slate-50 border border-emerald-200/70 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-600 text-white mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  First Expired, First Out (FEFO) Recommendation Engine
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                  Always sell or display the highlighted <span className="font-bold text-emerald-700">#1 Pick First</span> batch before newer stock. Expired batches are excluded from active sale and must be quarantined.
                </p>
              </div>
            </div>

            <div className="w-full sm:w-64">
              <Input
                placeholder="Search product in FEFO queue..."
                icon={Search}
                value={fefoSearch}
                onChange={(e) => setFefoSearch(e.target.value)}
              />
            </div>
          </div>

          {/* FEFO Product Cards List */}
          {isFefoLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="inline-block w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs font-medium">Calculating dynamic FEFO rotation rankings...</p>
            </div>
          ) : filteredFEFO.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No active stock in FEFO queue"
              description="Record batches in the Inventory tab to generate intelligent rotation recommendations."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredFEFO.map((item) => {
                const p = item.product;
                const pickBatch = item.fefoPickBatch;
                const subsequentBatches = item.batches.slice(1);

                return (
                  <Card key={p._id} className="overflow-hidden border border-slate-200/80 hover:shadow-md transition-shadow">
                    <div className="p-4 sm:p-5">
                      
                      {/* Product Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="w-11 h-11 rounded-lg object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-base">
                              {p.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                              {p.brand && <span className="text-xs text-slate-400">({p.brand})</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="neutral" size="sm">{p.category}</Badge>
                              <span className="text-xs text-slate-500">
                                Total Saleable Stock: <strong className="text-slate-800">{item.totalSaleableUnits} {p.unit}s</strong> ({item.saleableBatchesCount} active batch{item.saleableBatchesCount === 1 ? '' : 'es'})
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expired Stock Alert if any */}
                        {item.expiredBatchesCount > 0 && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                            <span>
                              {item.expiredBatchesCount} batch ({item.expiredUnits} {p.unit}s) EXPIRED! Do not sell.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* FEFO Queue Body */}
                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
                        
                        {/* #1 Pick First Featured Card */}
                        <div className="lg:col-span-7 p-4 rounded-xl bg-gradient-to-br from-emerald-50/70 via-mint-50/30 to-white border-2 border-emerald-400/80 shadow-sm relative">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-600 text-white shadow-sm flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                #1 Pick First
                              </span>
                              <span className="text-xs text-emerald-900 font-bold">
                                Batch #{pickBatch?.batchNumber || 'Primary'}
                              </span>
                            </div>

                            {pickBatch && renderStatusBadge(pickBatch.status)}
                          </div>

                          {/* Pick Batch Metrics */}
                          <div className="mt-3 grid grid-cols-3 gap-2 py-2 border-y border-emerald-100/80 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Available</span>
                              <span className="font-extrabold text-slate-900 text-sm">
                                {pickBatch?.currentQuantity} {p.unit}s
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Expiry Date</span>
                              <span className="font-bold text-slate-800">
                                {pickBatch?.expiryDateFormatted}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Time Left</span>
                              <div className="font-bold">
                                {renderDaysText(pickBatch?.daysUntilExpiry, pickBatch?.status)}
                              </div>
                            </div>
                          </div>

                          {/* FEFO Plain-Language Rationale */}
                          <p className="mt-2.5 text-xs text-emerald-950 font-medium bg-emerald-100/50 p-2.5 rounded-lg border border-emerald-200/50">
                            <strong>Rotation Instruction:</strong> {pickBatch?.fefoRecommendation}
                          </p>

                          {/* Quick Action Button */}
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Eye}
                              onClick={() => setSelectedBatchIdForDetail(pickBatch._id)}
                            >
                              Batch Details
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              icon={ArrowDownUp}
                              onClick={() => setSelectedBatchForAdjust(pickBatch)}
                            >
                              Adjust / Dispatch Stock
                            </Button>
                          </div>
                        </div>

                        {/* Subsequent Queue Batches */}
                        <div className="lg:col-span-5 flex flex-col justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                              Next in Rotation Queue ({subsequentBatches.length})
                            </span>

                            {subsequentBatches.length === 0 ? (
                              <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                                No secondary batches in stock for this product.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {subsequentBatches.map((b, idx) => (
                                  <div
                                    key={b._id}
                                    className="p-2.5 rounded-lg border border-slate-200/80 bg-slate-50/60 hover:bg-white flex items-center justify-between text-xs transition-colors"
                                  >
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="neutral" size="sm">Queue #{idx + 2}</Badge>
                                        <span className="font-bold text-slate-800">
                                          #{b.batchNumber || 'Batch'}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                                        Exp: {b.expiryDateFormatted} ({b.daysUntilExpiry}d remaining)
                                      </span>
                                    </div>

                                    <div className="text-right">
                                      <span className="font-extrabold text-slate-900 block">
                                        {b.currentQuantity} {p.unit}s
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Hold in reserve
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>

                    </div>
                  </Card>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COMPLETE EXPIRY MANAGEMENT TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          
          {/* Table Filters Ribbon */}
          <Card className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              
              {/* Search Bar */}
              <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md flex items-center gap-2">
                <Input
                  placeholder="Search batch #, product name, brand..."
                  icon={Search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Button type="submit" variant="secondary" size="md">
                  Search
                </Button>
              </form>

              {/* Status and Category Selects */}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'EXPIRED', label: 'Expired Only' },
                    { value: 'EXPIRING_TODAY', label: 'Expiring Today' },
                    { value: 'CRITICAL', label: 'Critical (≤ 3 Days)' },
                    { value: 'EXPIRING_SOON', label: 'Expiring Soon (≤ 7 Days)' },
                    { value: 'FRESH', label: 'Fresh (> 7 Days)' },
                    { value: 'DEPLETED', label: 'Depleted (0 Units)' },
                  ]}
                />

                <Select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: 'All Categories' },
                    ...categories.map((c) => ({ value: c, label: c }))
                  ]}
                />

                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  options={[
                    { value: 'expiryDate', label: 'Sort: Expiry Date' },
                    { value: 'currentQuantity', label: 'Sort: Stock Level' },
                    { value: 'purchaseValueAtRisk', label: 'Sort: Value at Risk' },
                    { value: 'daysUntilExpiry', label: 'Sort: Days Left' },
                    { value: 'createdAt', label: 'Sort: Received Date' }
                  ]}
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? '▲ Asc' : '▼ Desc'}
                </Button>
              </div>

            </div>
          </Card>

          {/* Batches Table */}
          <Card className="overflow-hidden">
            {isBatchesLoading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="inline-block w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs font-medium">Loading inventory batches with expiry classification...</p>
              </div>
            ) : batches.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No batches match filters"
                description="Try clearing search terms or selecting 'All Statuses'."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / Brand</TableHead>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stock Level</TableHead>
                      <TableHead>Cost at Risk</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => {
                      const p = b.product;
                      const ratio = b.quantityReceived > 0
                        ? Math.min(100, Math.round((b.currentQuantity / b.quantityReceived) * 100))
                        : 0;

                      return (
                        <TableRow key={b._id}>
                          <TableCell>
                            <div>
                              <span className="font-bold text-slate-900 block">{p?.name || 'Unknown'}</span>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <span>{p?.category}</span>
                                {p?.brand && <span>• {p.brand}</span>}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="font-mono text-xs font-bold text-slate-700">
                              {b.batchNumber || '—'}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="font-medium text-slate-800 text-xs">
                              {b.expiryDateFormatted}
                            </span>
                          </TableCell>

                          <TableCell>
                            {renderDaysText(b.daysUntilExpiry, b.status)}
                          </TableCell>

                          <TableCell>
                            {renderStatusBadge(b.status)}
                          </TableCell>

                          <TableCell>
                            <div className="w-28">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-extrabold text-slate-900">{b.currentQuantity}</span>
                                <span className="text-slate-400">/ {b.quantityReceived}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    b.status === 'EXPIRED'
                                      ? 'bg-rose-500'
                                      : b.status === 'CRITICAL'
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${ratio}%` }}
                                ></div>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="font-bold text-slate-800 text-xs">
                              {currencySymbol}{b.purchaseValueAtRisk}
                            </span>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={Eye}
                                onClick={() => setSelectedBatchIdForDetail(b._id)}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={ArrowDownUp}
                                onClick={() => setSelectedBatchForAdjust(b)}
                              >
                                Adjust
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing page {page} of {totalPages} ({totalBatchesCount} total batches)
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MONTHLY EXPIRY CALENDAR */}
      {/* ========================================================================= */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          
          {/* Calendar Header with Navigation */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={handlePrevMonth} />
                <h3 className="text-base font-extrabold text-slate-900 min-w-44 text-center">
                  {calendarData?.monthName || 'Calendar'}
                </h3>
                <Button variant="secondary" size="sm" icon={ChevronRight} onClick={handleNextMonth} />
                <Button variant="ghost" size="sm" onClick={handleCurrentMonth}>
                  Today
                </Button>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setCalendarViewMode('grid')}
                  className={`p-1.5 rounded text-xs font-bold flex items-center gap-1 ${
                    calendarViewMode === 'grid' ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setCalendarViewMode('timeline')}
                  className={`p-1.5 rounded text-xs font-bold flex items-center gap-1 ${
                    calendarViewMode === 'timeline' ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Schedule List</span>
                </button>
              </div>
            </div>
          </Card>

          {isCalendarLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="inline-block w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs font-medium">Loading month expiry schedule...</p>
            </div>
          ) : calendarViewMode === 'grid' ? (
            /* Month Grid View */
            <Card className="p-4 sm:p-5">
              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 gap-1.5 pt-2">
                {/* Pad leading days */}
                {Array.from({
                  length: new Date(selectedYear, selectedMonth - 1, 1).getDay()
                }).map((_, i) => (
                  <div key={`pad-${i}`} className="min-h-20 bg-slate-50/40 rounded-lg border border-slate-100/50"></div>
                ))}

                {/* Actual Month Days */}
                {Object.values(calendarData?.calendarDays || {}).map((day) => {
                  const isToday = day.date === calendarData?.today;
                  const isSelected = day.date === selectedDayKey;
                  const hasBatches = day.totalBatches > 0;

                  return (
                    <div
                      key={day.date}
                      onClick={() => setSelectedDayKey(day.date)}
                      className={`min-h-20 p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/30'
                          : isToday
                            ? 'border-amber-400 bg-amber-50/20'
                            : hasBatches
                              ? 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                              : 'border-slate-100 bg-white hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            isToday
                              ? 'px-1.5 py-0.5 rounded-full bg-amber-500 text-white'
                              : 'text-slate-700'
                          }`}
                        >
                          {day.dayNumber}
                        </span>

                        {hasBatches && (
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                              day.highestRisk === 'EXPIRED'
                                ? 'bg-rose-100 text-rose-800'
                                : day.highestRisk === 'CRITICAL'
                                  ? 'bg-orange-100 text-orange-800'
                                  : day.highestRisk === 'EXPIRING_SOON'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {day.totalBatches} batch{day.totalBatches === 1 ? '' : 'es'}
                          </span>
                        )}
                      </div>

                      {hasBatches && (
                        <div className="mt-1">
                          <span className="text-[10px] text-slate-500 block">
                            {day.totalUnits} units
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected Day Batches Detail Drawer */}
              {selectedDayKey && calendarData?.calendarDays?.[selectedDayKey] && (
                <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Batches Expiring on {selectedDayKey}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Total: {calendarData.calendarDays[selectedDayKey].totalBatches} batches ({calendarData.calendarDays[selectedDayKey].totalUnits} units)
                      </p>
                    </div>
                    {renderStatusBadge(calendarData.calendarDays[selectedDayKey].highestRisk)}
                  </div>

                  {calendarData.calendarDays[selectedDayKey].batches.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      No batches expiring on this specific date.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200/80 mt-2">
                      {calendarData.calendarDays[selectedDayKey].batches.map((b) => (
                        <div key={b._id} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800">{b.productName}</span>
                            <span className="text-slate-400 ml-2">#{b.batchNumber || 'Batch'}</span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Category: {b.productCategory} • Price: {currencySymbol}{b.purchasePrice}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-extrabold text-slate-900">
                              {b.currentQuantity} {b.productUnit}s
                            </span>
                            {renderStatusBadge(b.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </Card>
          ) : (
            /* Timeline / List View */
            <Card className="p-4">
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                Chronological Expiration Schedule ({calendarData?.monthName})
              </h4>
              <div className="space-y-3">
                {Object.values(calendarData?.calendarDays || {})
                  .filter((day) => day.totalBatches > 0)
                  .map((day) => (
                    <div
                      key={day.date}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:shadow-xs transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-14 p-2 rounded-lg bg-slate-100 font-bold">
                          <span className="text-sm text-slate-900 block">{day.dayNumber}</span>
                          <span className="text-[10px] text-slate-400 uppercase">
                            {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{day.date}</span>
                            {day.date === calendarData?.today && (
                              <Badge variant="warning" size="sm">Today</Badge>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">
                            {day.totalBatches} batch{day.totalBatches === 1 ? '' : 'es'} • {day.totalUnits} total units
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {renderStatusBadge(day.highestRisk)}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedDayKey(day.date);
                            setCalendarViewMode('grid');
                          }}
                        >
                          View Batches
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RISK ASSESSMENT & URGENCY */}
      {/* ========================================================================= */}
      {activeTab === 'risk' && (
        <div className="space-y-4">
          
          {/* Risk Tier Summaries */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* High Risk Tier */}
            <Card className="border-l-4 border-l-rose-500 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">High Risk Tier</span>
              <div className="mt-2 text-2xl font-black text-rose-950">
                {riskData?.summary?.highRiskCount ?? 0} <span className="text-xs font-normal text-rose-600">batches</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {riskData?.summary?.highRiskUnits ?? 0} units • {currencySymbol}{riskData?.summary?.highRiskValue ?? '0.00'} at risk
              </p>
              <p className="text-[11px] text-rose-700 mt-2 font-medium">
                Expiring today or within critical window (≤ 3 days).
              </p>
            </Card>

            {/* Medium Risk Tier */}
            <Card className="border-l-4 border-l-amber-500 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Medium Risk Tier</span>
              <div className="mt-2 text-2xl font-black text-amber-950">
                {riskData?.summary?.mediumRiskCount ?? 0} <span className="text-xs font-normal text-amber-600">batches</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {riskData?.summary?.mediumRiskUnits ?? 0} units • {currencySymbol}{riskData?.summary?.mediumRiskValue ?? '0.00'} at risk
              </p>
              <p className="text-[11px] text-amber-700 mt-2 font-medium">
                Approaching warning window (4 to 7 days).
              </p>
            </Card>

            {/* Low Risk Tier */}
            <Card className="border-l-4 border-l-emerald-500 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Low Risk Tier</span>
              <div className="mt-2 text-2xl font-black text-emerald-950">
                {riskData?.summary?.lowRiskCount ?? 0} <span className="text-xs font-normal text-emerald-600">batches</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {riskData?.summary?.lowRiskUnits ?? 0} units • {currencySymbol}{riskData?.summary?.lowRiskValue ?? '0.00'} value
              </p>
              <p className="text-[11px] text-emerald-700 mt-2 font-medium">
                Fresh inventory safely beyond warning threshold.
              </p>
            </Card>

          </div>

          {/* Actionable Urgent Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Prioritized Action Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isRiskLoading ? (
                <div className="p-8 text-center text-slate-400">Loading risk evaluation...</div>
              ) : (
                <div className="space-y-2.5">
                  {/* Expired Stock items first */}
                  {(riskData?.expired || []).map((b) => (
                    <div
                      key={b._id}
                      className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="danger">Immediate Disposal</Badge>
                          <span className="font-bold text-slate-900">{b.product?.name}</span>
                          <span className="text-slate-400">#{b.batchNumber}</span>
                        </div>
                        <p className="text-rose-700 font-medium mt-1">
                          {b.riskReason} • Cost loss: {currencySymbol}{b.purchaseValueAtRisk} ({b.currentQuantity} units)
                        </p>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Trash2}
                        onClick={() => setSelectedBatchForAdjust(b)}
                      >
                        Write Off Stock
                      </Button>
                    </div>
                  ))}

                  {/* High Risk items */}
                  {(riskData?.highRisk || []).map((b) => (
                    <div
                      key={b._id}
                      className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(b.status)}
                          <span className="font-bold text-slate-900">{b.product?.name}</span>
                          <span className="text-slate-400">#{b.batchNumber}</span>
                        </div>
                        <p className="text-amber-800 font-medium mt-1">
                          {b.riskReason} • {b.currentQuantity} units at risk ({currencySymbol}{b.purchaseValueAtRisk})
                        </p>
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        icon={ArrowDownUp}
                        onClick={() => setSelectedBatchForAdjust(b)}
                      >
                        FEFO Dispatch
                      </Button>
                    </div>
                  ))}

                  {(riskData?.expired?.length === 0 && riskData?.highRisk?.length === 0) && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No urgent high-risk or expired stock items found. All inventory is in stable condition.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {/* Reusable Stock Adjustment Modal */}
      {selectedBatchForAdjust && (
        <AdjustStockModal
          isOpen={!!selectedBatchForAdjust}
          onClose={() => setSelectedBatchForAdjust(null)}
          batch={selectedBatchForAdjust}
          onSuccess={() => {
            fetchSummary();
            if (activeTab === 'fefo') fetchFEFO();
            if (activeTab === 'table') fetchBatches();
            if (activeTab === 'calendar') fetchCalendar(selectedMonth, selectedYear);
            if (activeTab === 'risk') fetchRisk();
            showToast({ title: 'Stock Updated', message: 'Batch inventory adjusted successfully.', type: 'success' });
            setSelectedBatchForAdjust(null);
          }}
        />
      )}

      {/* Reusable Batch Detail Modal */}
      {selectedBatchIdForDetail && (
        <BatchDetailModal
          isOpen={!!selectedBatchIdForDetail}
          onClose={() => setSelectedBatchIdForDetail(null)}
          batchId={selectedBatchIdForDetail}
          onOpenAdjust={(batch) => {
            setSelectedBatchIdForDetail(null);
            setSelectedBatchForAdjust(batch);
          }}
        />
      )}

    </div>
  );
}
