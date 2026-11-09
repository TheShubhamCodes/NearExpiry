import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Zap,
  TrendingDown,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Sparkles,
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
  Info
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
  getActionsSummary,
  getMarkdownSuggestions,
  getMarkdowns,
  createMarkdown,
  approveMarkdown,
  activateMarkdown,
  rejectMarkdown,
  cancelMarkdown,
  completeMarkdown,
  getSupplierReturns,
  createSupplierReturn,
  updateSupplierReturnStatus,
  getStockDispositions,
  quarantineStock,
  disposeStock,
  releaseQuarantineStock,
  getBatches
} from '../services/api';

export default function Actions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user, store, isOwner } = useAuth();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';

  // Active top-level tab ('markdowns' | 'returns' | 'quarantine')
  const initialTab = searchParams.get('tab') || 'markdowns';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Synchronize tab with URL search parameter
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Summary & KPIs
  const [summary, setSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // --- Markdowns State ---
  const [markdownSuggestions, setMarkdownSuggestions] = useState([]);
  const [markdowns, setMarkdowns] = useState([]);
  const [markdownStatusFilter, setMarkdownStatusFilter] = useState('ALL');
  const [isMarkdownsLoading, setIsMarkdownsLoading] = useState(false);
  const [markdownPage, setMarkdownPage] = useState(1);
  const [markdownTotalPages, setMarkdownTotalPages] = useState(1);

  // Markdown Modals State
  const [isCreateMarkdownOpen, setIsCreateMarkdownOpen] = useState(false);
  const [isRejectMarkdownOpen, setIsRejectMarkdownOpen] = useState(false);
  const [selectedMarkdown, setSelectedMarkdown] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Propose Markdown Form
  const [availableBatches, setAvailableBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [discountPercent, setDiscountPercent] = useState(20);
  const [markdownReason, setMarkdownReason] = useState('');
  const [isSubmittingMarkdown, setIsSubmittingMarkdown] = useState(false);

  // --- Supplier Returns State ---
  const [returns, setReturns] = useState([]);
  const [returnStatusFilter, setReturnStatusFilter] = useState('ALL');
  const [isReturnsLoading, setIsReturnsLoading] = useState(false);
  const [returnPage, setReturnPage] = useState(1);
  const [returnTotalPages, setReturnTotalPages] = useState(1);
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Return Modals State
  const [isCreateReturnOpen, setIsCreateReturnOpen] = useState(false);
  const [isUpdateReturnOpen, setIsUpdateReturnOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [returnUpdateStatus, setReturnUpdateStatus] = useState('DISPATCHED');
  const [returnResolutionNotes, setReturnResolutionNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [creditNoteNumber, setCreditNoteNumber] = useState('');

  // Initiate Return Form
  const [returnBatchId, setReturnBatchId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('');
  const [returnReason, setReturnReason] = useState('NEAR_EXPIRY');
  const [returnResolutionExpected, setReturnResolutionExpected] = useState('REPLACEMENT');
  const [returnFollowUpDate, setReturnFollowUpDate] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // --- Quarantine & Disposal State ---
  const [dispositions, setDispositions] = useState([]);
  const [dispositionStatusFilter, setDispositionStatusFilter] = useState('ALL');
  const [isDispositionsLoading, setIsDispositionsLoading] = useState(false);
  const [dispositionPage, setDispositionPage] = useState(1);
  const [dispositionTotalPages, setDispositionTotalPages] = useState(1);

  // Quarantine & Disposal Modals State
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState(false);
  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState(null);
  const [releaseReason, setReleaseReason] = useState('');

  // Quarantine Form
  const [quarantineBatchId, setQuarantineBatchId] = useState('');
  const [quarantineQuantity, setQuarantineQuantity] = useState('');
  const [quarantineReason, setQuarantineReason] = useState('Quality segregation / Approaching expiry');
  const [quarantineNotes, setQuarantineNotes] = useState('');
  const [isSubmittingQuarantine, setIsSubmittingQuarantine] = useState(false);

  // Disposal Form
  const [disposalMethod, setDisposalMethod] = useState('DISPOSED_TRASH');
  const [disposalActionType, setDisposalActionType] = useState('DISPOSAL');
  const [disposalReason, setDisposalReason] = useState('Expired / Damaged unsellable stock write-off');
  const [disposalWitness, setDisposalWitness] = useState('');
  const [disposalNotes, setDisposalNotes] = useState('');
  const [isSubmittingDisposal, setIsSubmittingDisposal] = useState(false);

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const fetchSummary = async () => {
    try {
      setIsSummaryLoading(true);
      const res = await getActionsSummary();
      if (res.success) {
        setSummary(res.data);
      }
    } catch (err) {
      console.error('Failed to load actions summary:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const fetchMarkdowns = async () => {
    try {
      setIsMarkdownsLoading(true);
      const [suggestionsRes, markdownsRes] = await Promise.all([
        getMarkdownSuggestions(),
        getMarkdowns({
          page: markdownPage,
          limit: 10,
          status: markdownStatusFilter !== 'ALL' ? markdownStatusFilter : undefined
        })
      ]);

      if (suggestionsRes.success) {
        setMarkdownSuggestions(suggestionsRes.data.suggestions || []);
      }
      if (markdownsRes.success) {
        setMarkdowns(markdownsRes.data || []);
        if (markdownsRes.pagination) {
          setMarkdownTotalPages(markdownsRes.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load markdowns:', err);
    } finally {
      setIsMarkdownsLoading(false);
    }
  };

  const fetchReturns = async () => {
    try {
      setIsReturnsLoading(true);
      const res = await getSupplierReturns({
        page: returnPage,
        limit: 10,
        status: returnStatusFilter !== 'ALL' ? returnStatusFilter : undefined,
        overdueOnly: overdueOnly ? 'true' : undefined
      });
      if (res.success) {
        setReturns(res.data || []);
        if (res.pagination) {
          setReturnTotalPages(res.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load supplier returns:', err);
    } finally {
      setIsReturnsLoading(false);
    }
  };

  const fetchDispositions = async () => {
    try {
      setIsDispositionsLoading(true);
      const res = await getStockDispositions({
        page: dispositionPage,
        limit: 10,
        status: dispositionStatusFilter !== 'ALL' ? dispositionStatusFilter : undefined
      });
      if (res.success) {
        setDispositions(res.data || []);
        if (res.pagination) {
          setDispositionTotalPages(res.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to load stock dispositions:', err);
    } finally {
      setIsDispositionsLoading(false);
    }
  };

  const fetchBatchesList = async () => {
    try {
      const res = await getBatches({ status: 'active', limit: 100 });
      if (res.success) {
        setAvailableBatches(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load active batches:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchBatchesList();
  }, []);

  useEffect(() => {
    if (activeTab === 'markdowns') fetchMarkdowns();
    if (activeTab === 'returns') fetchReturns();
    if (activeTab === 'quarantine') fetchDispositions();
  }, [activeTab, markdownStatusFilter, markdownPage, returnStatusFilter, returnPage, overdueOnly, dispositionStatusFilter, dispositionPage]);

  // Selected batch helper for live calculations
  const selectedBatchObj = useMemo(() => {
    return availableBatches.find((b) => b._id === selectedBatchId);
  }, [availableBatches, selectedBatchId]);

  const returnBatchObj = useMemo(() => {
    return availableBatches.find((b) => b._id === returnBatchId);
  }, [availableBatches, returnBatchId]);

  const quarantineBatchObj = useMemo(() => {
    return availableBatches.find((b) => b._id === quarantineBatchId);
  }, [availableBatches, quarantineBatchId]);

  // ---------------------------------------------------------------------------
  // Action Handlers: Markdowns
  // ---------------------------------------------------------------------------

  const handleApplySuggestion = async (suggestion) => {
    try {
      await createMarkdown({
        batchId: suggestion.batchId,
        discountPercent: suggestion.suggestedPercent,
        reason: suggestion.reason
      });
      showToast({
        title: 'Markdown Proposed',
        message: `${suggestion.suggestedPercent}% markdown submitted for ${suggestion.product?.name}.`,
        type: 'success'
      });
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({
        title: 'Action Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  const handleProposeMarkdownSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBatchId) {
      showToast({ title: 'Validation Error', message: 'Please select an inventory batch.', type: 'error' });
      return;
    }
    try {
      setIsSubmittingMarkdown(true);
      await createMarkdown({
        batchId: selectedBatchId,
        discountPercent: Number(discountPercent),
        reason: markdownReason.trim() || `Proposed ${discountPercent}% clearance markdown`
      });
      showToast({
        title: 'Markdown Created',
        message: isOwner ? 'Markdown created and ready for activation.' : 'Markdown request submitted for owner approval.',
        type: 'success'
      });
      setIsCreateMarkdownOpen(false);
      setSelectedBatchId('');
      setMarkdownReason('');
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({
        title: 'Failed to Propose Markdown',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSubmittingMarkdown(false);
    }
  };

  const handleApproveMarkdown = async (id) => {
    try {
      await approveMarkdown(id);
      showToast({ title: 'Approved', message: 'Markdown approved. Ready to activate on sales floor.', type: 'success' });
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({ title: 'Approval Failed', message: err.response?.data?.message || err.message, type: 'error' });
    }
  };

  const handleActivateMarkdown = async (id) => {
    try {
      await activateMarkdown(id);
      showToast({ title: 'Activated', message: 'Markdown activated! Batch selling price updated on POS.', type: 'success' });
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({ title: 'Activation Failed', message: err.response?.data?.message || err.message, type: 'error' });
    }
  };

  const handleRejectMarkdownSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMarkdown) return;
    try {
      await rejectMarkdown(selectedMarkdown._id, rejectionReason);
      showToast({ title: 'Markdown Rejected', message: 'Markdown proposal was rejected.', type: 'info' });
      setIsRejectMarkdownOpen(false);
      setSelectedMarkdown(null);
      setRejectionReason('');
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({ title: 'Action Failed', message: err.response?.data?.message || err.message, type: 'error' });
    }
  };

  const handleCancelMarkdown = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this markdown? Original selling price will be restored.')) return;
    try {
      await cancelMarkdown(id, 'Cancelled by store user');
      showToast({ title: 'Cancelled', message: 'Markdown cancelled and active discount cleared.', type: 'info' });
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({ title: 'Action Failed', message: err.response?.data?.message || err.message, type: 'error' });
    }
  };

  const handleCompleteMarkdown = async (id) => {
    try {
      await completeMarkdown(id);
      showToast({ title: 'Completed', message: 'Markdown marked as completed.', type: 'success' });
      fetchMarkdowns();
      fetchSummary();
    } catch (err) {
      showToast({ title: 'Action Failed', message: err.response?.data?.message || err.message, type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Supplier Returns
  // ---------------------------------------------------------------------------

  const handleInitiateReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnBatchObj) {
      showToast({ title: 'Validation Error', message: 'Please select an inventory batch.', type: 'error' });
      return;
    }
    const qty = Number(returnQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast({ title: 'Validation Error', message: 'Return quantity must be greater than 0.', type: 'error' });
      return;
    }
    if (qty > returnBatchObj.currentQuantity) {
      showToast({
        title: 'Validation Error',
        message: `Quantity exceeds available batch stock (${returnBatchObj.currentQuantity}).`,
        type: 'error'
      });
      return;
    }

    try {
      setIsSubmittingReturn(true);
      await createSupplierReturn({
        productId: returnBatchObj.product?._id || returnBatchObj.product,
        batchId: returnBatchObj._id,
        supplierName: supplierName.trim(),
        supplierContact: supplierContact.trim(),
        quantity: qty,
        reason: returnReason,
        resolutionExpected: returnResolutionExpected,
        followUpDate: returnFollowUpDate || undefined,
        notes: returnNotes.trim()
      });
      showToast({
        title: 'Supplier Return Initiated',
        message: 'Return record registered. Stock will be deducted upon confirmed dispatch.',
        type: 'success'
      });
      setIsCreateReturnOpen(false);
      setReturnBatchId('');
      setSupplierName('');
      setSupplierContact('');
      setReturnQuantity('');
      setReturnNotes('');
      fetchReturns();
      fetchSummary();
    } catch (err) {
      showToast({
        title: 'Initiate Return Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleUpdateReturnStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReturn) return;
    try {
      await updateSupplierReturnStatus(selectedReturn._id, {
        status: returnUpdateStatus,
        resolutionNotes: returnResolutionNotes.trim(),
        refundAmount: refundAmount !== '' ? Number(refundAmount) : undefined,
        creditNoteNumber: creditNoteNumber.trim() || undefined
      });
      showToast({
        title: 'Return Updated',
        message: `Return transitioned to ${returnUpdateStatus}.`,
        type: 'success'
      });
      setIsUpdateReturnOpen(false);
      setSelectedReturn(null);
      setReturnResolutionNotes('');
      setRefundAmount('');
      setCreditNoteNumber('');
      fetchReturns();
      fetchSummary();
      fetchBatchesList();
    } catch (err) {
      showToast({
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Quarantine & Disposal
  // ---------------------------------------------------------------------------

  const handleQuarantineSubmit = async (e) => {
    e.preventDefault();
    if (!quarantineBatchObj) {
      showToast({ title: 'Validation Error', message: 'Please select an inventory batch.', type: 'error' });
      return;
    }
    const qty = Number(quarantineQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast({ title: 'Validation Error', message: 'Quarantine quantity must be greater than 0.', type: 'error' });
      return;
    }
    if (qty > quarantineBatchObj.currentQuantity) {
      showToast({
        title: 'Validation Error',
        message: `Quarantine quantity exceeds available batch stock (${quarantineBatchObj.currentQuantity}).`,
        type: 'error'
      });
      return;
    }

    try {
      setIsSubmittingQuarantine(true);
      await quarantineStock({
        batchId: quarantineBatchObj._id,
        quantity: qty,
        reason: quarantineReason.trim(),
        notes: quarantineNotes.trim()
      });
      showToast({
        title: 'Stock Quarantined',
        message: `${qty} units segregated to quarantine and removed from FEFO rotation.`,
        type: 'success'
      });
      setIsQuarantineModalOpen(false);
      setQuarantineBatchId('');
      setQuarantineQuantity('');
      setQuarantineNotes('');
      fetchDispositions();
      fetchSummary();
      fetchBatchesList();
    } catch (err) {
      showToast({
        title: 'Quarantine Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSubmittingQuarantine(false);
    }
  };

  const handleDisposeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDisposition) return;
    try {
      setIsSubmittingDisposal(true);
      await disposeStock({
        dispositionId: selectedDisposition._id,
        disposalMethod,
        actionType: disposalActionType,
        reason: disposalReason.trim(),
        witness: disposalWitness.trim(),
        notes: disposalNotes.trim()
      });
      showToast({
        title: 'Disposal Confirmed',
        message: `Quarantined stock permanently written off / disposed.`,
        type: 'success'
      });
      setIsDisposeModalOpen(false);
      setSelectedDisposition(null);
      setDisposalWitness('');
      setDisposalNotes('');
      fetchDispositions();
      fetchSummary();
    } catch (err) {
      showToast({
        title: 'Disposal Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsSubmittingDisposal(false);
    }
  };

  const handleReleaseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDisposition) return;
    try {
      await releaseQuarantineStock(selectedDisposition._id, releaseReason.trim());
      showToast({
        title: 'Stock Released',
        message: `${selectedDisposition.quantity} units restored to active inventory.`,
        type: 'success'
      });
      setIsReleaseModalOpen(false);
      setSelectedDisposition(null);
      setReleaseReason('');
      fetchDispositions();
      fetchSummary();
      fetchBatchesList();
    } catch (err) {
      showToast({
        title: 'Release Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Status Badge Renderers
  // ---------------------------------------------------------------------------

  const renderMarkdownBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active Discount</Badge>;
      case 'PENDING_APPROVAL':
        return <Badge variant="warning">Pending Approval</Badge>;
      case 'APPROVED':
        return <Badge variant="info">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      case 'COMPLETED':
        return <Badge variant="primary">Completed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderReturnBadge = (status) => {
    switch (status) {
      case 'REQUESTED':
        return <Badge variant="warning">Requested</Badge>;
      case 'APPROVED':
        return <Badge variant="info">Supplier Approved</Badge>;
      case 'DISPATCHED':
        return <Badge variant="primary">Dispatched</Badge>;
      case 'REPLACEMENT_RECEIVED':
        return <Badge variant="success">Replacement Received</Badge>;
      case 'REFUNDED':
        return <Badge variant="success">Refunded</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Supplier Rejected</Badge>;
      case 'CLOSED':
        return <Badge variant="neutral">Closed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderDispositionBadge = (status) => {
    switch (status) {
      case 'QUARANTINED':
        return <Badge variant="warning">Quarantined</Badge>;
      case 'DISPOSED':
        return <Badge variant="danger">Disposed</Badge>;
      case 'WRITTEN_OFF':
        return <Badge variant="danger">Written Off</Badge>;
      case 'DONATED':
        return <Badge variant="info">Donated</Badge>;
      case 'RELEASED_FROM_QUARANTINE':
        return <Badge variant="success">Released</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================================= */}
      {/* 1. PAGE HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm shadow-emerald-600/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                Near-Expiry Action Management
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Turn expiry risk into decisive inventory actions: promotional markdowns, supplier returns, and quarantine disposal.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              fetchSummary();
              if (activeTab === 'markdowns') fetchMarkdowns();
              if (activeTab === 'returns') fetchReturns();
              if (activeTab === 'quarantine') fetchDispositions();
            }}
          >
            Refresh
          </Button>

          {activeTab === 'markdowns' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsCreateMarkdownOpen(true)}
            >
              Propose Markdown
            </Button>
          )}

          {activeTab === 'returns' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsCreateReturnOpen(true)}
            >
              Initiate Supplier Return
            </Button>
          )}

          {activeTab === 'quarantine' && (
            <Button
              variant="warning"
              size="sm"
              icon={ShieldAlert}
              onClick={() => setIsQuarantineModalOpen(true)}
            >
              Quarantine Stock
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUMMARY KPI OVERVIEW CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Markdowns Value */}
        <Card className="bg-gradient-to-br from-emerald-50/70 to-white border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Active Markdown Value
              </span>
              <div className="p-2 rounded-xl bg-emerald-100/70 text-emerald-700">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{summary?.markdowns?.activeMarkdownValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary?.markdowns?.activeCount || 0} active discount campaigns</span>
              {summary?.markdowns?.pendingApprovalsCount > 0 && (
                <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {summary.markdowns.pendingApprovalsCount} pending approval
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Pending Supplier Returns Value */}
        <Card className="bg-gradient-to-br from-blue-50/70 to-white border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                Pending Returns Value
              </span>
              <div className="p-2 rounded-xl bg-blue-100/70 text-blue-700">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{summary?.supplierReturns?.pendingReturnValue?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary?.supplierReturns?.pendingReturnsCount || 0} pending supplier returns</span>
              {summary?.supplierReturns?.overdueReturnsCount > 0 && (
                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {summary.supplierReturns.overdueReturnsCount} overdue
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Quarantined Inventory */}
        <Card className="bg-gradient-to-br from-amber-50/70 to-white border-amber-100 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Quarantined Units
              </span>
              <div className="p-2 rounded-xl bg-amber-100/70 text-amber-700">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-extrabold text-slate-900">
              {summary?.quarantine?.quarantinedUnits || 0} <span className="text-sm font-normal text-slate-500">units</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Segregated from sales floor</span>
              <span className="font-bold text-amber-700">
                {currencySymbol}{summary?.quarantine?.quarantinedCostLoss?.toFixed(2) || '0.00'} cost
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Disposals & Write-Off Loss */}
        <Card className="bg-gradient-to-br from-rose-50/70 to-white border-rose-100 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Disposal Cost Loss
              </span>
              <div className="p-2 rounded-xl bg-rose-100/70 text-rose-700">
                <Trash2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-2xl font-extrabold text-slate-900">
              {currencySymbol}{summary?.disposal?.disposedCostLoss?.toFixed(2) || '0.00'}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary?.disposal?.disposedUnits || 0} units written off</span>
              <span className="text-slate-400">{summary?.disposal?.disposedCount || 0} batches disposed</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN NAVIGATION TABS */}
      {/* ========================================================================= */}
      <div className="flex border-b border-slate-200/80 gap-2 sm:gap-4 overflow-x-auto pb-px">
        <button
          onClick={() => handleTabChange('markdowns')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'markdowns'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <TrendingDown className="w-4 h-4 text-emerald-600" />
          <span>Markdowns & Discounts</span>
          {summary?.markdowns?.pendingApprovalsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
              {summary.markdowns.pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('returns')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'returns'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <RotateCcw className="w-4 h-4 text-emerald-600" />
          <span>Supplier Returns & Replacements</span>
          {summary?.supplierReturns?.overdueReturnsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-100 text-rose-800">
              {summary.supplierReturns.overdueReturnsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('quarantine')}
          className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'quarantine'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-emerald-600" />
          <span>Quarantine & Disposal</span>
          {summary?.quarantine?.quarantinedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
              {summary.quarantine.quarantinedCount}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MARKDOWNS & DISCOUNTS */}
      {/* ========================================================================= */}
      {activeTab === 'markdowns' && (
        <div className="space-y-6">
          {/* Smart Markdown Suggestions Carousel / Grid */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white border border-emerald-200/80 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Smart Markdown Suggestions
                  </h3>
                  <p className="text-xs text-slate-600">
                    Automated clearance discount recommendations based on shelf life ({summary?.storeSettings?.markdownRules?.warningDiscountPercent || 15}% warning, {summary?.storeSettings?.markdownRules?.criticalDiscountPercent || 30}% critical, {summary?.storeSettings?.markdownRules?.todayDiscountPercent || 50}% today).
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-3 py-1 rounded-full border border-emerald-200 w-fit">
                {markdownSuggestions.length} candidates ready
              </span>
            </div>

            {markdownSuggestions.length === 0 ? (
              <div className="text-center py-6 bg-white/60 rounded-xl border border-dashed border-emerald-200/80">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-semibold text-slate-700">No approaching-expiry markdowns suggested right now.</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Inventory is fresh or already has active clearance markdowns.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {markdownSuggestions.map((sug) => (
                  <div
                    key={sug.batchId}
                    className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-sm hover:shadow transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold text-slate-900 line-clamp-1">
                            {sug.product?.name}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            Batch #{sug.batchNumber} • {sug.currentQuantity} {sug.unit}s in stock
                          </span>
                        </div>
                        <Badge
                          variant={sug.status === 'EXPIRING_TODAY' ? 'danger' : sug.status === 'CRITICAL' ? 'warning' : 'info'}
                          size="sm"
                        >
                          {sug.daysUntilExpiry === 0 ? 'Today!' : `${sug.daysUntilExpiry}d left`}
                        </Badge>
                      </div>

                      {/* Pricing Preview */}
                      <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Original</span>
                          <span className="line-through text-slate-400 font-medium">
                            {currencySymbol}{sug.originalPrice?.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] text-emerald-600 uppercase font-bold block">
                            Markdown
                          </span>
                          <span className="font-extrabold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full text-xs">
                            -{sug.suggestedPercent}%
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-600 uppercase font-bold block">New Price</span>
                          <span className="text-sm font-extrabold text-emerald-700">
                            {currencySymbol}{sug.discountedPrice?.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-600 mt-2 line-clamp-2">
                        {sug.reason}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Zap}
                        onClick={() => handleApplySuggestion(sug)}
                      >
                        Apply Markdown
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Markdowns Table Card */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-slate-900">
                  Markdowns & Promotional Campaigns
                </CardTitle>
                <Badge variant="neutral" size="sm">{markdowns.length} total</Badge>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select
                  value={markdownStatusFilter}
                  onChange={(e) => {
                    setMarkdownStatusFilter(e.target.value);
                    setMarkdownPage(1);
                  }}
                  className="w-full sm:w-48 text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="ACTIVE">Active Discount</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="COMPLETED">Completed</option>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isMarkdownsLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading markdowns...</div>
              ) : markdowns.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={TrendingDown}
                    title="No markdowns registered"
                    description="No discount markdowns match the selected filter. Propose a markdown above or apply a smart suggestion."
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Plus}
                        onClick={() => setIsCreateMarkdownOpen(true)}
                      >
                        Propose Markdown
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / Batch</TableHead>
                      <TableHead>Pricing Comparison</TableHead>
                      <TableHead>Units in Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {markdowns.map((md) => {
                      const isPending = md.status === 'PENDING_APPROVAL';
                      const isApproved = md.status === 'APPROVED';
                      const isActive = md.status === 'ACTIVE';

                      return (
                        <TableRow key={md._id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                {md.product?.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Batch #{md.batch?.batchNumber || 'Primary'} • {md.product?.brand || 'Unbranded'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="line-through text-xs text-slate-400 font-medium">
                                {currencySymbol}{md.originalPrice?.toFixed(2)}
                              </span>
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                -{md.discountPercent}%
                              </span>
                              <span className="text-xs font-extrabold text-slate-900">
                                {currencySymbol}{md.discountedPrice?.toFixed(2)}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-xs font-semibold text-slate-700">
                              {md.batch?.currentQuantity || 0} {md.product?.unit || 'units'}
                            </span>
                          </TableCell>

                          <TableCell>
                            {renderMarkdownBadge(md.status)}
                          </TableCell>

                          <TableCell>
                            <div className="text-[11px]">
                              <span className="font-semibold text-slate-800 block">{md.requestedBy?.fullName || 'User'}</span>
                              <span className="text-slate-400 capitalize">{md.requestedBy?.role || 'employee'}</span>
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Owner Actions */}
                              {isOwner && isPending && (
                                <>
                                  <Button
                                    variant="success"
                                    size="xs"
                                    icon={Check}
                                    onClick={() => handleApproveMarkdown(md._id)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="xs"
                                    icon={Ban}
                                    onClick={() => {
                                      setSelectedMarkdown(md);
                                      setIsRejectMarkdownOpen(true);
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}

                              {isOwner && isApproved && (
                                <Button
                                  variant="primary"
                                  size="xs"
                                  icon={Zap}
                                  onClick={() => handleActivateMarkdown(md._id)}
                                >
                                  Activate
                                </Button>
                              )}

                              {isActive && (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    icon={CheckCircle2}
                                    onClick={() => handleCompleteMarkdown(md._id)}
                                  >
                                    Complete
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    icon={XCircle}
                                    onClick={() => handleCancelMarkdown(md._id)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}

                              {(isPending || isApproved) && !isOwner && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleCancelMarkdown(md._id)}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SUPPLIER RETURNS */}
      {/* ========================================================================= */}
      {activeTab === 'returns' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-slate-900">
                  Supplier Returns & Replacements
                </CardTitle>
                <Badge variant="neutral" size="sm">{returns.length} records</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Overdue Checkbox */}
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overdueOnly}
                    onChange={(e) => {
                      setOverdueOnly(e.target.checked);
                      setReturnPage(1);
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Overdue Follow-ups Only</span>
                </label>

                {/* Status Filter */}
                <Select
                  value={returnStatusFilter}
                  onChange={(e) => {
                    setReturnStatusFilter(e.target.value);
                    setReturnPage(1);
                  }}
                  className="w-full sm:w-44 text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="REQUESTED">Requested</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DISPATCHED">Dispatched</option>
                  <option value="REPLACEMENT_RECEIVED">Replacement Received</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CLOSED">Closed</option>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isReturnsLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading supplier returns...</div>
              ) : returns.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={RotateCcw}
                    title="No supplier returns recorded"
                    description="No return records match the active criteria. Initiate a return to suppliers for near-expiry or damaged goods."
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Plus}
                        onClick={() => setIsCreateReturnOpen(true)}
                      >
                        Initiate Supplier Return
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / Batch</TableHead>
                      <TableHead>Supplier Details</TableHead>
                      <TableHead>Qty & Reason</TableHead>
                      <TableHead>Status & Inventory</TableHead>
                      <TableHead>Follow-up Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.map((ret) => {
                      const isOverdue = ret.followUpDate && new Date(ret.followUpDate) < new Date() && !['REPLACEMENT_RECEIVED', 'REFUNDED', 'CLOSED', 'REJECTED'].includes(ret.status);
                      const followUpFormatted = ret.followUpDate ? new Date(ret.followUpDate).toLocaleDateString() : 'None';

                      return (
                        <TableRow key={ret._id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                {ret.product?.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Batch #{ret.batch?.batchNumber || 'Primary'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">
                                {ret.supplierName}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {ret.supplierContact || 'No contact on file'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">
                                {ret.quantity} {ret.product?.unit || 'units'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Reason: {ret.reason?.replace('_', ' ')}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {renderReturnBadge(ret.status)}
                              <span className="text-[10px] text-slate-400">
                                {ret.stockDeducted ? (
                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Stock deducted on dispatch
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Stock in inventory until dispatch</span>
                                )}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-700">{followUpFormatted}</span>
                              {isOverdue && (
                                <Badge variant="danger" size="xs">Overdue</Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              variant="secondary"
                              size="xs"
                              icon={RotateCcw}
                              onClick={() => {
                                setSelectedReturn(ret);
                                setReturnUpdateStatus(ret.status);
                                setReturnResolutionNotes('');
                                setRefundAmount(ret.resolutionDetails?.refundAmount || '');
                                setCreditNoteNumber(ret.resolutionDetails?.creditNoteNumber || '');
                                setIsUpdateReturnOpen(true);
                              }}
                            >
                              Update Status
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: QUARANTINE & DISPOSAL */}
      {/* ========================================================================= */}
      {activeTab === 'quarantine' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-slate-900">
                  Quarantine Segregation & Stock Disposals
                </CardTitle>
                <Badge variant="neutral" size="sm">{dispositions.length} entries</Badge>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select
                  value={dispositionStatusFilter}
                  onChange={(e) => {
                    setDispositionStatusFilter(e.target.value);
                    setDispositionPage(1);
                  }}
                  className="w-full sm:w-48 text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="QUARANTINED">Currently Quarantined</option>
                  <option value="DISPOSED">Disposed</option>
                  <option value="WRITTEN_OFF">Written Off</option>
                  <option value="DONATED">Donated</option>
                  <option value="RELEASED_FROM_QUARANTINE">Released</option>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isDispositionsLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading stock dispositions...</div>
              ) : dispositions.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={ShieldAlert}
                    title="No quarantine or disposal records"
                    description="Quarantine damaged or expired items to isolate them from FEFO rotation and active store shelves."
                    action={
                      <Button
                        variant="warning"
                        size="sm"
                        icon={ShieldAlert}
                        onClick={() => setIsQuarantineModalOpen(true)}
                      >
                        Quarantine Stock
                      </Button>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product / Batch</TableHead>
                      <TableHead>Quantity & Cost Loss</TableHead>
                      <TableHead>Status & Type</TableHead>
                      <TableHead>Method & Reason</TableHead>
                      <TableHead>Handled By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispositions.map((disp) => {
                      const isQuarantined = disp.status === 'QUARANTINED';

                      return (
                        <TableRow key={disp._id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                {disp.product?.name}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Batch #{disp.batch?.batchNumber || 'Primary'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">
                                {disp.quantity} {disp.product?.unit || 'units'}
                              </span>
                              <span className="text-[11px] font-semibold text-rose-600">
                                Cost loss: {currencySymbol}{disp.costLoss?.toFixed(2) || '0.00'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {renderDispositionBadge(disp.status)}
                              <span className="text-[10px] text-slate-400 capitalize">
                                {disp.actionType?.toLowerCase()}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-800">
                                {disp.disposalMethod || 'Quarantine Area'}
                              </span>
                              <span className="text-[11px] text-slate-500 line-clamp-1">
                                {disp.reason}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="text-[11px]">
                              <span className="font-semibold text-slate-800 block">
                                {disp.responsibleEmployee?.fullName || 'User'}
                              </span>
                              <span className="text-slate-400 capitalize">
                                {disp.responsibleEmployee?.role || 'employee'}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            {isQuarantined && (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="danger"
                                  size="xs"
                                  icon={Trash2}
                                  onClick={() => {
                                    setSelectedDisposition(disp);
                                    setDisposalMethod('DISPOSED_TRASH');
                                    setDisposalActionType('DISPOSAL');
                                    setDisposalReason('Expired stock authorized write-off');
                                    setIsDisposeModalOpen(true);
                                  }}
                                >
                                  Dispose
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  icon={ShieldCheck}
                                  onClick={() => {
                                    setSelectedDisposition(disp);
                                    setReleaseReason('Inspection confirmed product intact');
                                    setIsReleaseModalOpen(true);
                                  }}
                                >
                                  Release
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PROPOSE CUSTOM MARKDOWN */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateMarkdownOpen}
        onClose={() => setIsCreateMarkdownOpen(false)}
        title="Propose Inventory Markdown"
      >
        <form onSubmit={handleProposeMarkdownSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Propose a percentage markdown to liquidate stock approaching expiry. Selling price is only updated after owner approval and activation.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Select Batch to Discount *
            </label>
            <Select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              required
              className="w-full text-xs"
            >
              <option value="">-- Choose active inventory batch --</option>
              {availableBatches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.product?.name} (Batch #{b.batchNumber || 'Primary'}) — {b.currentQuantity} in stock @ {currencySymbol}{b.sellingPrice}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase">
                Discount Percentage (%) *
              </label>
              <span className="text-sm font-extrabold text-emerald-700">
                {discountPercent}%
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="90"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>

          {/* Live Price Calculator */}
          {selectedBatchObj && (
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Current Price</span>
                <span className="line-through text-slate-400 font-bold">
                  {currencySymbol}{selectedBatchObj.sellingPrice?.toFixed(2)}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-600" />
              <div>
                <span className="text-[10px] text-emerald-800 uppercase block font-bold">Proposed Price</span>
                <span className="text-base font-extrabold text-emerald-700">
                  {currencySymbol}{(selectedBatchObj.sellingPrice * (1 - discountPercent / 100)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Markdown Rationale / Reason
            </label>
            <Input
              placeholder="e.g. Clearance promo for product expiring in 4 days"
              value={markdownReason}
              onChange={(e) => setMarkdownReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateMarkdownOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmittingMarkdown}
              icon={isSubmittingMarkdown ? RefreshCw : Zap}
            >
              {isSubmittingMarkdown ? 'Submitting...' : 'Submit Proposal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: REJECT MARKDOWN REASON */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isRejectMarkdownOpen}
        onClose={() => setIsRejectMarkdownOpen(false)}
        title="Reject Markdown Proposal"
      >
        <form onSubmit={handleRejectMarkdownSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Please provide a short explanation for rejecting this markdown proposal.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Rejection Reason
            </label>
            <Input
              placeholder="e.g. Expected footfall weekend sale is sufficient"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsRejectMarkdownOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
            >
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: INITIATE SUPPLIER RETURN */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateReturnOpen}
        onClose={() => setIsCreateReturnOpen(false)}
        title="Initiate Supplier Return"
      >
        <form onSubmit={handleInitiateReturnSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Create a formal return ticket. <strong>Note:</strong> Inventory stock is preserved in your store until the return is physically dispatched.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Batch to Return *
            </label>
            <Select
              value={returnBatchId}
              onChange={(e) => setReturnBatchId(e.target.value)}
              required
              className="w-full text-xs"
            >
              <option value="">-- Choose inventory batch --</option>
              {availableBatches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.product?.name} (Batch #{b.batchNumber || 'Primary'}) — {b.currentQuantity} units available
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Supplier Name *
              </label>
              <Input
                placeholder="e.g. Apex Wholesalers Ltd"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                required
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Supplier Contact / Rep
              </label>
              <Input
                placeholder="Phone or email"
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Quantity to Return *
              </label>
              <Input
                type="number"
                min="1"
                max={returnBatchObj?.currentQuantity || 9999}
                placeholder="Units count"
                value={returnQuantity}
                onChange={(e) => setReturnQuantity(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Return Reason *
              </label>
              <Select
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full text-xs"
              >
                <option value="NEAR_EXPIRY">Near Expiry</option>
                <option value="EXPIRED">Expired</option>
                <option value="DAMAGED">Damaged Goods</option>
                <option value="DEFECTIVE">Defective Packaging</option>
                <option value="RECALLED">Manufacturer Recall</option>
                <option value="OVERSTOCK">Overstock Agreement</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Expected Resolution *
              </label>
              <Select
                value={returnResolutionExpected}
                onChange={(e) => setReturnResolutionExpected(e.target.value)}
                className="w-full text-xs"
              >
                <option value="REPLACEMENT">Fresh Stock Replacement</option>
                <option value="CREDIT_NOTE">Credit Note</option>
                <option value="REFUND">Direct Refund</option>
                <option value="DISPOSAL_APPROVAL">Disposal Authorization</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Follow-up Target Date
              </label>
              <Input
                type="date"
                value={returnFollowUpDate}
                onChange={(e) => setReturnFollowUpDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Internal Notes
            </label>
            <Input
              placeholder="e.g. Spoke to rep Dave; courier collection expected Tuesday"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateReturnOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmittingReturn}
              icon={isSubmittingReturn ? RefreshCw : RotateCcw}
            >
              {isSubmittingReturn ? 'Submitting...' : 'Initiate Return'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: UPDATE RETURN STATUS */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isUpdateReturnOpen}
        onClose={() => setIsUpdateReturnOpen(false)}
        title="Update Supplier Return Status"
      >
        <form onSubmit={handleUpdateReturnStatusSubmit} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Item Summary</span>
            <span className="font-bold text-slate-900 block">{selectedReturn?.product?.name}</span>
            <span className="text-slate-600 block">
              {selectedReturn?.quantity} units to {selectedReturn?.supplierName}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              New Status *
            </label>
            <Select
              value={returnUpdateStatus}
              onChange={(e) => setReturnUpdateStatus(e.target.value)}
              className="w-full text-xs"
            >
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved by Supplier</option>
              <option value="DISPATCHED">Dispatched (Stock will be deducted!)</option>
              <option value="REPLACEMENT_RECEIVED">Replacement Received</option>
              <option value="REFUNDED">Refunded</option>
              <option value="REJECTED">Rejected by Supplier</option>
              <option value="CLOSED">Closed</option>
            </Select>
          </div>

          {returnUpdateStatus === 'DISPATCHED' && !selectedReturn?.stockDeducted && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Notice:</strong> Transitioning this record to <strong>DISPATCHED</strong> will atomically deduct {selectedReturn?.quantity} units from inventory batch #{selectedReturn?.batch?.batchNumber || 'Primary'}.
              </div>
            </div>
          )}

          {returnUpdateStatus === 'REFUNDED' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Refund Amount ({currencySymbol})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Credit Note Number
                </label>
                <Input
                  placeholder="e.g. CN-88219"
                  value={creditNoteNumber}
                  onChange={(e) => setCreditNoteNumber(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Resolution Notes
            </label>
            <Input
              placeholder="e.g. Goods collected by driver; tracking code #9817"
              value={returnResolutionNotes}
              onChange={(e) => setReturnResolutionNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsUpdateReturnOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
            >
              Update Status
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: QUARANTINE STOCK */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isQuarantineModalOpen}
        onClose={() => setIsQuarantineModalOpen(false)}
        title="Quarantine Stock"
      >
        <form onSubmit={handleQuarantineSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Segregate damaged, spoiled, or expired items to the store quarantine area. Quarantined units are <strong>immediately removed</strong> from saleable stock and excluded from FEFO recommendations.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Batch to Quarantine *
            </label>
            <Select
              value={quarantineBatchId}
              onChange={(e) => setQuarantineBatchId(e.target.value)}
              required
              className="w-full text-xs"
            >
              <option value="">-- Choose active inventory batch --</option>
              {availableBatches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.product?.name} (Batch #{b.batchNumber || 'Primary'}) — {b.currentQuantity} in stock
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Quantity to Segregate *
            </label>
            <Input
              type="number"
              min="1"
              max={quarantineBatchObj?.currentQuantity || 9999}
              placeholder="Units count"
              value={quarantineQuantity}
              onChange={(e) => setQuarantineQuantity(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Reason for Quarantine *
            </label>
            <Input
              placeholder="e.g. Expired date passed / Damaged container seals"
              value={quarantineReason}
              onChange={(e) => setQuarantineReason(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Location / Holding Notes
            </label>
            <Input
              placeholder="e.g. Backroom Shelf C - Yellow Bin #4"
              value={quarantineNotes}
              onChange={(e) => setQuarantineNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsQuarantineModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="warning"
              size="sm"
              disabled={isSubmittingQuarantine}
              icon={isSubmittingQuarantine ? RefreshCw : ShieldAlert}
            >
              {isSubmittingQuarantine ? 'Processing...' : 'Confirm Quarantine'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: DISPOSE STOCK */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDisposeModalOpen}
        onClose={() => setIsDisposeModalOpen(false)}
        title="Confirm Stock Disposal / Write-Off"
      >
        <form onSubmit={handleDisposeSubmit} className="space-y-4">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
            <span className="text-[10px] uppercase font-bold text-rose-700 block">Disposal Target</span>
            <span className="font-bold text-rose-950 block">{selectedDisposition?.product?.name}</span>
            <span className="block mt-0.5">
              {selectedDisposition?.quantity} units • Cost loss: {currencySymbol}{selectedDisposition?.costLoss?.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Action Type *
              </label>
              <Select
                value={disposalActionType}
                onChange={(e) => setDisposalActionType(e.target.value)}
                className="w-full text-xs"
              >
                <option value="DISPOSAL">Physical Disposal</option>
                <option value="WRITE_OFF">Accounting Write-Off</option>
                <option value="DONATION">Food Bank Donation</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Method *
              </label>
              <Select
                value={disposalMethod}
                onChange={(e) => setDisposalMethod(e.target.value)}
                className="w-full text-xs"
              >
                <option value="DISPOSED_TRASH">Commercial Waste Disposal</option>
                <option value="DESTROYED">Secure Destruction</option>
                <option value="DONATED">Donated to Charitable Pantry</option>
                <option value="RETURNED_TO_MANUFACTURER">Returned to Manufacturer</option>
                <option value="RECYCLED">Composted / Recycled</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Disposal Reason *
            </label>
            <Input
              value={disposalReason}
              onChange={(e) => setDisposalReason(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Witness / Verifying Manager
            </label>
            <Input
              placeholder="e.g. Jane Doe (Assistant Manager)"
              value={disposalWitness}
              onChange={(e) => setDisposalWitness(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsDisposeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={isSubmittingDisposal}
              icon={isSubmittingDisposal ? RefreshCw : Trash2}
            >
              {isSubmittingDisposal ? 'Processing...' : 'Authorize Disposal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 7: RELEASE QUARANTINE BACK TO ACTIVE INVENTORY */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        title="Release Stock from Quarantine"
      >
        <form onSubmit={handleReleaseSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Releasing will return {selectedDisposition?.quantity} units back into the active inventory batch and restore saleability.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Inspection / Safety Verification Reason *
            </label>
            <Input
              placeholder="e.g. Lab test cleared / Visual inspection verified packaging intact"
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              required
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsReleaseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="success"
              size="sm"
              icon={ShieldCheck}
            >
              Confirm Release
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

