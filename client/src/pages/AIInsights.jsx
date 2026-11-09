import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Package,
  Layers,
  Calendar,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  Check,
  Ban,
  Archive,
  ChevronRight,
  Info,
  ShoppingCart,
  Percent,
  BrainCircuit,
  BarChart2,
  Activity,
  Zap,
  HelpCircle
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  getAISummary,
  getExpiryRiskQueue,
  getIntelligentDiscounts,
  getDemandForecasts,
  getAIStoreInsights,
  getModelEvaluation,
  getSalesHistory,
  recordRetailSale,
  getBatches
} from '../services/api';

export default function AIInsights() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { store, isOwner } = useAuth();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';

  // Active top-level tab ('risk' | 'discounts' | 'demand' | 'insights' | 'sales')
  const initialTab = searchParams.get('tab') || 'risk';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Executive KPI summary
  const [summary, setSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // Risk Queue State
  const [riskQueue, setRiskQueue] = useState([]);
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [selectedRiskBatch, setSelectedRiskBatch] = useState(null);

  // Discount Recommendations State
  const [discounts, setDiscounts] = useState([]);
  const [isDiscountsLoading, setIsDiscountsLoading] = useState(false);

  // Demand Forecasts State
  const [forecasts, setForecasts] = useState([]);
  const [forecastFilter, setForecastFilter] = useState('ALL');
  const [isForecastLoading, setIsForecastLoading] = useState(false);

  // Store Insights State
  const [insights, setInsights] = useState([]);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);

  // Model Evaluation & Sales State
  const [evaluation, setEvaluation] = useState(null);
  const [salesList, setSalesList] = useState([]);
  const [salesPagination, setSalesPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [isSalesLoading, setIsSalesLoading] = useState(false);

  // Record Sale Modal State
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [saleBatches, setSaleBatches] = useState([]);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [saleForm, setSaleForm] = useState({
    batchId: '',
    quantity: 1,
    unitPrice: '',
    receiptNumber: '',
    notes: ''
  });

  // Load Executive Summary
  const loadSummary = async () => {
    try {
      setIsSummaryLoading(true);
      const res = await getAISummary();
      if (res.success) {
        setSummary(res.data);
      }
    } catch (err) {
      console.error('Failed to load AI summary:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Load Risk Queue
  const loadRiskQueue = async () => {
    try {
      setIsRiskLoading(true);
      const res = await getExpiryRiskQueue({ limit: 50, minRisk: 'LOW' });
      if (res.success) {
        setRiskQueue(res.data.queue || []);
      }
    } catch (err) {
      console.error('Failed to load risk queue:', err);
      showToast({ title: 'Error', message: 'Could not load expiry risk predictions.', type: 'danger' });
    } finally {
      setIsRiskLoading(false);
    }
  };

  // Load Intelligent Discounts
  const loadDiscounts = async () => {
    try {
      setIsDiscountsLoading(true);
      const res = await getIntelligentDiscounts({ limit: 30 });
      if (res.success) {
        setDiscounts(res.data.recommendations || []);
      }
    } catch (err) {
      console.error('Failed to load discount recommendations:', err);
    } finally {
      setIsDiscountsLoading(false);
    }
  };

  // Load Demand Forecasts
  const loadDemandForecasts = async () => {
    try {
      setIsForecastLoading(true);
      const res = await getDemandForecasts({ filter: forecastFilter, limit: 50 });
      if (res.success) {
        setForecasts(res.data.forecasts || []);
      }
    } catch (err) {
      console.error('Failed to load demand forecasts:', err);
    } finally {
      setIsForecastLoading(false);
    }
  };

  // Load Store Insights
  const loadStoreInsights = async () => {
    try {
      setIsInsightsLoading(true);
      const res = await getAIStoreInsights();
      if (res.success) {
        setInsights(res.data.insights || []);
      }
    } catch (err) {
      console.error('Failed to load store insights:', err);
    } finally {
      setIsInsightsLoading(false);
    }
  };

  // Load Model Evaluation and Sales
  const loadSalesAndEvaluation = async (page = 1) => {
    try {
      setIsSalesLoading(true);
      const [evalRes, salesRes] = await Promise.all([
        getModelEvaluation().catch(() => null),
        getSalesHistory({ page, limit: 10 }).catch(() => null)
      ]);

      if (evalRes && evalRes.success) {
        setEvaluation(evalRes.data);
      }
      if (salesRes && salesRes.success) {
        setSalesList(salesRes.data || []);
        setSalesPagination(salesRes.pagination || { page: 1, limit: 10, total: 0 });
      }
    } catch (err) {
      console.error('Failed to load evaluation & sales:', err);
    } finally {
      setIsSalesLoading(false);
    }
  };

  // Initial Data Load
  useEffect(() => {
    loadSummary();
  }, []);

  // Tab-specific Data Load
  useEffect(() => {
    if (activeTab === 'risk') loadRiskQueue();
    else if (activeTab === 'discounts') loadDiscounts();
    else if (activeTab === 'demand') loadDemandForecasts();
    else if (activeTab === 'insights') loadStoreInsights();
    else if (activeTab === 'sales') loadSalesAndEvaluation();
  }, [activeTab, forecastFilter]);

  // Open Record Sale Modal & fetch active batches
  const handleOpenSaleModal = async (prefillBatchId = null) => {
    try {
      const res = await getBatches({ inStockOnly: true, limit: 100 });
      const batches = res.data?.batches || [];
      setSaleBatches(batches);

      let initialBatchId = prefillBatchId || '';
      let initialPrice = '';

      if (prefillBatchId) {
        const found = batches.find((b) => b._id === prefillBatchId);
        if (found) {
          initialPrice = found.discountedPrice || found.sellingPrice || found.purchasePrice || '';
        }
      } else if (batches.length > 0) {
        initialBatchId = batches[0]._id;
        initialPrice = batches[0].discountedPrice || batches[0].sellingPrice || batches[0].purchasePrice || '';
      }

      setSaleForm({
        batchId: initialBatchId,
        quantity: 1,
        unitPrice: initialPrice,
        receiptNumber: '',
        notes: ''
      });
      setIsSaleModalOpen(true);
    } catch (err) {
      showToast({ title: 'Error', message: 'Could not load inventory batches for sale.', type: 'danger' });
    }
  };

  const handleSaleBatchChange = (batchId) => {
    const selected = saleBatches.find((b) => b._id === batchId);
    setSaleForm((prev) => ({
      ...prev,
      batchId,
      unitPrice: selected ? (selected.discountedPrice || selected.sellingPrice || selected.purchasePrice || '') : ''
    }));
  };

  const handleSubmitSale = async (e) => {
    e.preventDefault();
    if (!saleForm.batchId) {
      showToast({ title: 'Required', message: 'Please select a batch to sell.', type: 'warning' });
      return;
    }
    const qty = Number(saleForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      showToast({ title: 'Invalid Quantity', message: 'Quantity must be greater than zero.', type: 'warning' });
      return;
    }

    try {
      setIsSubmittingSale(true);
      const res = await recordRetailSale({
        batchId: saleForm.batchId,
        quantity: qty,
        unitPrice: saleForm.unitPrice ? Number(saleForm.unitPrice) : undefined,
        receiptNumber: saleForm.receiptNumber.trim() || undefined,
        notes: saleForm.notes.trim() || undefined
      });

      if (res.success) {
        showToast({
          title: 'Sale Recorded',
          message: `Successfully sold ${qty} unit(s). Inventory updated.`,
          type: 'success'
        });
        setIsSaleModalOpen(false);
        // Refresh active views
        loadSummary();
        if (activeTab === 'risk') loadRiskQueue();
        if (activeTab === 'discounts') loadDiscounts();
        if (activeTab === 'demand') loadDemandForecasts();
        if (activeTab === 'sales') loadSalesAndEvaluation();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to record sale.';
      showToast({ title: 'Sale Failed', message: msg, type: 'danger' });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Filtered Risk Queue
  const filteredRiskQueue = useMemo(() => {
    if (riskFilter === 'ALL') return riskQueue;
    return riskQueue.filter((item) => item.riskCategory === riskFilter);
  }, [riskQueue, riskFilter]);

  const getRiskBadge = (category, score) => {
    switch (category) {
      case 'VERY_HIGH':
        return <Badge variant="danger">VERY HIGH ({score}%)</Badge>;
      case 'HIGH':
        return <Badge variant="warning">HIGH ({score}%)</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning">MEDIUM ({score}%)</Badge>;
      default:
        return <Badge variant="success">LOW ({score}%)</Badge>;
    }
  };

  const getStockoutBadge = (risk) => {
    switch (risk) {
      case 'CRITICAL_STOCKOUT':
        return <Badge variant="danger">CRITICAL STOCKOUT</Badge>;
      case 'IMMINENT_STOCKOUT':
        return <Badge variant="danger">IMMINENT DEPLETION</Badge>;
      case 'STOCKOUT_WARNING':
        return <Badge variant="warning">STOCKOUT WARNING</Badge>;
      case 'LOW_STOCK':
        return <Badge variant="warning">LOW STOCK</Badge>;
      default:
        return <Badge variant="success">ADEQUATE</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Sparkles className="w-64 h-64 text-emerald-400" />
        </div>
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30">
              <Sparkles className="w-5 h-5" />
            </span>
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-300">
              Machine Intelligence & Analytics
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">AI Predictive Intelligence</h1>
          <p className="text-slate-300 text-sm max-w-2xl">
            Mathematical expiry probability estimation, margin-protected discount optimization, and demand forecasting
            grounded on verified retail sales history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              loadSummary();
              if (activeTab === 'risk') loadRiskQueue();
              if (activeTab === 'discounts') loadDiscounts();
              if (activeTab === 'demand') loadDemandForecasts();
              if (activeTab === 'insights') loadStoreInsights();
              if (activeTab === 'sales') loadSalesAndEvaluation();
            }}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenSaleModal()}
            className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/30"
          >
            <ShoppingCart className="w-4 h-4 mr-1.5" />
            Record Retail Sale
          </Button>
        </div>
      </div>

      {/* Executive Intelligence KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: High Risk Batches */}
        <Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">High Expiry Risk</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-800">
                  {isSummaryLoading ? '...' : summary?.summary?.highRiskBatchesCount || 0}
                </span>
                <span className="text-xs text-rose-600 font-semibold">Batches</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {currencySymbol}{isSummaryLoading ? '...' : (summary?.summary?.totalValueAtRisk || 0).toLocaleString()} value at risk
              </p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Markdown Recovery */}
        <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Projected Recovery</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-800">
                  {currencySymbol}{isSummaryLoading ? '...' : (summary?.summary?.potentialRevenueRecovery || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-emerald-600 font-medium mt-1">
                Across {summary?.summary?.discountRecommendationsCount || 0} discount candidates
              </p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Stockout Danger */}
        <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Stockout Alert</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-800">
                  {isSummaryLoading ? '...' : summary?.summary?.stockoutRiskCount || 0}
                </span>
                <span className="text-xs text-amber-600 font-semibold">Products</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {summary?.summary?.reorderRequiredCount || 0} reorder actions needed
              </p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Model Status */}
        <Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Model Quality</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-slate-800">
                  {isSummaryLoading ? '...' : summary?.modelStatus?.status === 'EVALUATION_COMPLETE' ? 'Active & Calibrated' : 'Grounded Baseline'}
                </span>
              </div>
              <p className="text-xs text-teal-600 font-medium mt-1">
                v{summary?.modelStatus?.modelVersion || '1.0.0'} • Min Margin: {store?.aiSettings?.minMarginPercent || 10}%
              </p>
            </div>
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
              <BrainCircuit className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          onClick={() => handleTabChange('risk')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'risk'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          Expiry Risk Queue
          {summary?.summary?.highRiskBatchesCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700 rounded-full">
              {summary.summary.highRiskBatchesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('discounts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'discounts'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Percent className="w-4 h-4" />
          Intelligent Markdowns
          {summary?.summary?.discountRecommendationsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
              {summary.summary.discountRecommendationsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('demand')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'demand'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Demand & Reorders
          {summary?.summary?.stockoutRiskCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full">
              {summary.summary.stockoutRiskCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('insights')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'insights'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          Store Insights
          {summary?.summary?.activeInsightsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-teal-100 text-teal-700 rounded-full">
              {summary.summary.activeInsightsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('sales')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'sales'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Sales & Evaluation
        </button>
      </div>

      {/* TAB 1: EXPIRY RISK QUEUE */}
      {activeTab === 'risk' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Filter Risk Tier:</span>
              <div className="flex gap-1.5">
                {['ALL', 'VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'].map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setRiskFilter(tier)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                      riskFilter === tier
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tier.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500">
              Showing {filteredRiskQueue.length} ranked active batches
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              {isRiskLoading ? (
                <div className="p-12 text-center text-slate-500">Calculating predictive risk scores...</div>
              ) : filteredRiskQueue.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No At-Risk Inventory Batches"
                  description="All active batches are currently projected to sell out within shelf life, or no batches match the selected filter."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product & Batch</TableHead>
                      <TableHead>Days Remaining</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Velocity</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead>Value at Risk</TableHead>
                      <TableHead>Explainability & Factors</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRiskQueue.map((item) => (
                      <TableRow key={item.batchId} className="hover:bg-slate-50/70">
                        <TableCell>
                          <div>
                            <span className="font-semibold text-slate-800">{item.product?.name}</span>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Batch: {item.batchNumber} • {item.product?.category}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span
                            className={`font-semibold text-sm ${
                              item.daysRemaining <= 0
                                ? 'text-rose-600'
                                : item.daysRemaining <= 3
                                ? 'text-rose-500'
                                : item.daysRemaining <= 7
                                ? 'text-amber-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {item.daysRemaining < 0
                              ? `Expired ${Math.abs(item.daysRemaining)}d ago`
                              : item.daysRemaining === 0
                              ? 'Expires Today'
                              : `${item.daysRemaining} days`}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-medium text-slate-700">{item.currentQuantity} units</span>
                          <div className="text-xs text-rose-500 font-medium">
                            ~{item.estimatedUnsoldQuantity} units unsold
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-600 font-medium">
                            {item.dailyVelocity} units/day
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1">
                            {getRiskBadge(item.riskCategory, item.riskScore)}
                            <div className="w-24 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  item.riskScore >= 75
                                    ? 'bg-rose-500'
                                    : item.riskScore >= 50
                                    ? 'bg-amber-500'
                                    : item.riskScore >= 25
                                    ? 'bg-yellow-400'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${item.riskScore}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-slate-800">
                            {currencySymbol}{item.estimatedValueAtRisk}
                          </span>
                          <div className="text-xs text-slate-400">
                            Retail: {currencySymbol}{item.estimatedRetailLoss}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="max-w-xs text-xs text-slate-600 space-y-1">
                            <p className="line-clamp-2 italic text-slate-700 font-medium">
                              "{item.recommendedAction}"
                            </p>
                            <button
                              onClick={() => setSelectedRiskBatch(item)}
                              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold underline"
                            >
                              View {item.mainFactors?.length || 0} Explainable Factors
                            </button>
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => handleOpenSaleModal(item.batchId)}
                              title="Record retail sale for this batch"
                            >
                              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                              Sell
                            </Button>
                            <Button
                              variant="primary"
                              size="xs"
                              onClick={() => {
                                handleTabChange('discounts');
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Percent className="w-3.5 h-3.5 mr-1" />
                              Optimize
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: INTELLIGENT MARKDOWN OPTIMIZER */}
      {activeTab === 'discounts' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <Percent className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <span className="font-bold">Margin-Protected Markdown Engine:</span> Discounts are calibrated to boost
              velocity based on price elasticity while enforcing the store's configured minimum gross margin floor (
              {store?.aiSettings?.minMarginPercent || 10}%). Under store governance, discounts require explicit owner
              approval before activation.
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isDiscountsLoading ? (
                <div className="p-12 text-center text-slate-500">Analyzing discount elasticity and margin floors...</div>
              ) : discounts.length === 0 ? (
                <EmptyState
                  icon={Percent}
                  title="No Markdowns Recommended"
                  description="No active batches are approaching expiry within warning thresholds or all eligible batches already have approved discounts."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product & Batch</TableHead>
                      <TableHead>Shelf Life Left</TableHead>
                      <TableHead>Pricing & Margin</TableHead>
                      <TableHead>Recommended Discount</TableHead>
                      <TableHead>Projected Recovery</TableHead>
                      <TableHead>Loss Avoided</TableHead>
                      <TableHead>AI Rationale</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discounts.map((rec) => (
                      <TableRow key={rec.batchId} className="hover:bg-slate-50/70">
                        <TableCell>
                          <div>
                            <span className="font-semibold text-slate-800">{rec.product?.name}</span>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Batch: {rec.batchNumber} • Stock: {rec.currentQuantity} units
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant={rec.daysRemaining <= 3 ? 'danger' : 'warning'}>
                            {rec.daysRemaining <= 0 ? 'Today' : `${rec.daysRemaining} days left`}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span className="line-through text-slate-400 font-normal">
                                {currencySymbol}{rec.originalPrice}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-emerald-700">{currencySymbol}{rec.suggestedSellingPrice}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Cost: {currencySymbol}{rec.purchasePrice} • Margin: {rec.marginPercentAtDiscount}%
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            {rec.suggestedDiscountPercent}% OFF
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-bold text-emerald-700">
                            {currencySymbol}{rec.expectedRevenue}
                          </span>
                          <div className="text-xs text-slate-500">
                            ~{rec.estimatedQuantityToSell} of {rec.currentQuantity} units sold
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-slate-700">
                            {currencySymbol}{rec.estimatedDisposalLossAvoided}
                          </span>
                        </TableCell>

                        <TableCell>
                          <p className="max-w-xs text-xs text-slate-600 line-clamp-2">
                            {rec.explanation}
                          </p>
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => {
                              navigate('/actions?tab=markdowns');
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Propose Markdown
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: DEMAND FORECAST & REORDERS */}
      {activeTab === 'demand' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Filter Urgency:</span>
              <div className="flex gap-1.5">
                {[
                  { id: 'ALL', label: 'All Products' },
                  { id: 'STOCKOUT_RISK', label: 'Stockout Risk' },
                  { id: 'REORDER_NEEDED', label: 'Reorder Needed' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setForecastFilter(f.id)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      forecastFilter === f.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500">
              Horizon: {store?.aiSettings?.forecastPeriodDays || 14} days • Lead Time: {store?.aiSettings?.leadTimeDays || 3} days
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              {isForecastLoading ? (
                <div className="p-12 text-center text-slate-500">Forecasting product replenishment requirements...</div>
              ) : forecasts.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No Matching Catalog Forecasts"
                  description="All catalog products maintain adequate buffer stock or no products matched the selected urgency filter."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Current Saleable Stock</TableHead>
                      <TableHead>Sales Pace</TableHead>
                      <TableHead>Projected 14-Day Demand</TableHead>
                      <TableHead>Stockout Risk</TableHead>
                      <TableHead>Suggested Reorder</TableHead>
                      <TableHead>Data Grounding</TableHead>
                      <TableHead>AI Forecast Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecasts.map((f) => (
                      <TableRow key={f.productId} className="hover:bg-slate-50/70">
                        <TableCell>
                          <span className="font-semibold text-slate-800">{f.productName}</span>
                          {f.brand && <div className="text-xs text-slate-400">{f.brand}</div>}
                        </TableCell>

                        <TableCell>
                          <Badge variant="secondary">{f.category}</Badge>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-slate-800">{f.currentSaleableStock} units</span>
                          {f.pendingIncomingStock > 0 && (
                            <div className="text-xs text-emerald-600">+{f.pendingIncomingStock} pending</div>
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-600 font-medium">
                            {f.hasSufficientData ? `${f.dailyVelocity} / day` : 'Cold-Start'}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-bold text-slate-800">
                            {f.forecastedDemandUnits !== null ? `${f.forecastedDemandUnits} units` : 'N/A'}
                          </span>
                        </TableCell>

                        <TableCell>{getStockoutBadge(f.stockoutRisk)}</TableCell>

                        <TableCell>
                          {f.recommendedReorderQuantity > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800">
                              +{f.recommendedReorderQuantity} units
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">None needed</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {f.hasSufficientData ? (
                            <Badge variant="success">EMPIRICAL DATA</Badge>
                          ) : (
                            <Badge variant="secondary">COLD START</Badge>
                          )}
                        </TableCell>

                        <TableCell>
                          <p className="max-w-xs text-xs text-slate-600 line-clamp-2">
                            {f.reasoning}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: STORE & OPERATIONAL INSIGHTS */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
            <Zap className="w-5 h-5 text-teal-600 mt-0.5" />
            <div className="text-sm text-teal-900">
              <span className="font-bold">Autonomous Operational Auditing:</span> NearExpiry continuously analyzes stock
              movements, disposals, and picking sequences to detect chronic loss culprits, departmental waste anomalies,
              and FEFO picking deviations before losses compound.
            </div>
          </div>

          {isInsightsLoading ? (
            <div className="p-12 text-center text-slate-500">Running anomaly detection across store history...</div>
          ) : insights.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Store Operations Clean"
              description="No chronic expiry culprits, stagnant inventory clusters, or FEFO picking deviations detected in recent store logs."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((ins, idx) => (
                <Card
                  key={idx}
                  className={`border-l-4 ${
                    ins.severity === 'CRITICAL'
                      ? 'border-l-rose-500'
                      : ins.severity === 'WARNING'
                      ? 'border-l-amber-500'
                      : 'border-l-teal-500'
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                        {ins.title}
                      </CardTitle>
                      <Badge
                        variant={
                          ins.severity === 'CRITICAL' ? 'danger' : ins.severity === 'WARNING' ? 'warning' : 'secondary'
                        }
                      >
                        {ins.severity}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0 text-sm">
                    <p className="text-slate-600">{ins.message}</p>
                    <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                      <div className="font-semibold text-slate-700">Evidence from Store Data:</div>
                      <div className="text-slate-500">{ins.evidence}</div>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-emerald-800 font-medium bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Recommended Action:</span> {ins.recommendation}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SALES RECORDING & MODEL EVALUATION */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Model Accuracy & Calibration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <BrainCircuit className="w-5 h-5 text-emerald-600" />
                Model Accuracy & Train/Test Evaluation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {evaluation?.status === 'EVALUATION_COMPLETE' && evaluation.metrics ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs text-slate-500 uppercase font-semibold">Model MAE</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">
                        {evaluation.metrics.modelMAE} units
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Mean Absolute Error</div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs text-slate-500 uppercase font-semibold">Model RMSE</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">
                        {evaluation.metrics.modelRMSE} units
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Root Mean Squared Error</div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs text-slate-500 uppercase font-semibold">Naive Baseline MAE</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">
                        {evaluation.metrics.baselineMAE} units
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Static Average Baseline</div>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div className="text-xs text-emerald-700 uppercase font-semibold">Error Reduction</div>
                      <div className="text-xl font-bold text-emerald-800 mt-1">
                        {evaluation.metrics.errorReductionPercent}%
                      </div>
                      <div className="text-xs text-emerald-600 mt-0.5">Vs Naive Benchmark</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Evaluation Interpretation:</span>{' '}
                    {evaluation.interpretation} (Evaluated on {evaluation.trainDataPoints} training sales vs{' '}
                    {evaluation.testDataPoints} testing points).
                  </p>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
                  <Activity className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-sm font-semibold text-slate-700">Accumulating Historical Calibration Points</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    A formal time-based train/test evaluation split activates automatically once sufficient retail sales
                    are recorded across distinct calendar periods. The engine currently operates using empirical moving-window
                    velocity and category baselines.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recorded Sales Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-slate-800">Recorded Retail Sales History</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verified customer purchases feeding the empirical velocity engine and stock-out predictions
                </p>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenSaleModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="w-4 h-4 mr-1" />
                Record Sale
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isSalesLoading ? (
                <div className="p-12 text-center text-slate-500">Loading sales records...</div>
              ) : salesList.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="No Retail Sales Logged Yet"
                  description="Use the 'Record Retail Sale' button above to register verified transactions and calibrate the demand engine."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sale Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Recorded By</TableHead>
                      <TableHead>Receipt #</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesList.map((s) => (
                      <TableRow key={s._id} className="hover:bg-slate-50/70">
                        <TableCell>
                          <span className="text-xs text-slate-600">
                            {new Date(s.saleDate).toLocaleDateString()} {new Date(s.saleDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-slate-800">{s.product?.name}</span>
                          {s.isMarkdown && (
                            <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                              Markdown Sale
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-500">{s.batch?.batchNumber || 'Primary'}</span>
                        </TableCell>

                        <TableCell>
                          <span className="font-semibold text-slate-800">{s.quantity} units</span>
                        </TableCell>

                        <TableCell>
                          <span className="text-slate-700 font-medium">
                            {currencySymbol}{s.unitPrice}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="font-bold text-emerald-700">
                            {currencySymbol}{s.totalAmount}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-600">{s.recordedBy?.fullName || 'Staff'}</span>
                        </TableCell>

                        <TableCell>
                          <span className="text-xs text-slate-400">{s.receiptNumber || '—'}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* EXPLAINABILITY MODAL */}
      <Modal
        isOpen={Boolean(selectedRiskBatch)}
        onClose={() => setSelectedRiskBatch(null)}
        title="Predictive Risk Factors & Explainability"
        size="md"
      >
        {selectedRiskBatch && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-800">{selectedRiskBatch.product?.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Batch #{selectedRiskBatch.batchNumber} • Expiry: {selectedRiskBatch.daysRemaining} days left • Stock: {selectedRiskBatch.currentQuantity} units
              </div>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Mathematical Drivers & Factors
              </div>
              <ul className="space-y-2">
                {selectedRiskBatch.mainFactors?.map((factor, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Recommended Strategy</div>
              <p className="text-xs text-amber-900 mt-1">{selectedRiskBatch.recommendedAction}</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedRiskBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* RECORD RETAIL SALE MODAL */}
      <Modal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        title="Record Retail Customer Sale"
        size="md"
      >
        <form onSubmit={handleSubmitSale} className="space-y-4">
          <p className="text-xs text-slate-500">
            Records customer purchases, decrements batch inventory atomically, and creates auditable STOCK_SOLD
            movements to calibrate predictive velocity.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Inventory Batch <span className="text-rose-500">*</span>
            </label>
            <Select
              value={saleForm.batchId}
              onChange={(e) => handleSaleBatchChange(e.target.value)}
              required
            >
              <option value="">-- Choose active saleable batch --</option>
              {saleBatches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.product?.name} — Batch #{b.batchNumber || 'Primary'} ({b.currentQuantity} in stock, exp{' '}
                  {new Date(b.expiryDate).toLocaleDateString()})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Units Sold <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={saleForm.quantity}
                onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Selling Price / Unit ({currencySymbol})
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={saleForm.unitPrice}
                onChange={(e) => setSaleForm({ ...saleForm, unitPrice: e.target.value })}
                placeholder="Auto-filled from batch"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Invoice #</label>
              <Input
                type="text"
                placeholder="e.g. REC-1002"
                value={saleForm.receiptNumber}
                onChange={(e) => setSaleForm({ ...saleForm, receiptNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Cashier Info</label>
              <Input
                type="text"
                placeholder="Optional notes"
                value={saleForm.notes}
                onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsSaleModalOpen(false)}
              disabled={isSubmittingSale}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingSale}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Confirm & Update Inventory
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

