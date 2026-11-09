import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layers, 
  Search, 
  PlusCircle, 
  Filter, 
  ArrowDownUp, 
  AlertCircle, 
  AlertTriangle,
  Archive, 
  CheckCircle2, 
  RefreshCw, 
  Eye, 
  Edit3, 
  Package, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  TrendingDown,
  Clock
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import { SkeletonTable } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { 
  getBatches, 
  getInventorySummary, 
  getProductCategories 
} from '../services/api';

import ReceiveStockModal from '../components/inventory/ReceiveStockModal';
import AdjustStockModal from '../components/inventory/AdjustStockModal';
import BatchDetailModal from '../components/inventory/BatchDetailModal';
import EditBatchModal from '../components/inventory/EditBatchModal';
import ProductFormModal from '../components/products/ProductFormModal';
import { createProduct } from '../services/api';

export default function Inventory() {
  const { showToast } = useToast();

  // Data states
  const [batches, setBatches] = useState([]);
  const [summary, setSummary] = useState({
    distinctProductsWithStock: 0,
    totalUnitsInStock: 0,
    totalBatches: 0,
    activeBatches: 0,
    expiringSoonBatches: 0,
    expiredBatches: 0,
    expiredUnits: 0,
    lowStockProducts: 0
  });
  const [categories, setCategories] = useState(['All']);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });

  // Modals state
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isProductCreateOpen, setIsProductCreateOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState(null);

  // Load summary metrics
  const fetchSummary = async () => {
    try {
      const response = await getInventorySummary();
      if (response?.data) {
        setSummary(response.data);
      }
    } catch (err) {
      console.warn('Failed to load inventory summary:', err);
    }
  };

  // Load batches list
  const fetchBatches = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getBatches({
        search: searchTerm,
        category: categoryFilter,
        status: statusFilter,
        page,
        limit: pagination.limit
      });

      if (response?.data) {
        setBatches(response.data.batches || []);
        setPagination({
          page: response.data.pagination.page,
          limit: response.data.pagination.limit,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to load batches';
      setError(msg);
      showToast({
        title: 'Inventory Load Error',
        message: msg,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, categoryFilter, statusFilter, pagination.limit, showToast]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await getProductCategories();
        if (response?.data?.categories) {
          setCategories(['All', ...response.data.categories]);
        }
      } catch (err) {
        console.warn('Failed to load categories:', err);
      }
    };
    loadCategories();
    fetchSummary();
  }, []);

  // Debounced search / filter trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBatches(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, categoryFilter, statusFilter]);

  // Handle successful actions
  const handleActionSuccess = (msg) => {
    showToast({
      title: 'Inventory Updated',
      message: msg,
      type: 'success'
    });
    fetchBatches(pagination.page);
    fetchSummary();
  };

  // Handle creating a product from the Receive modal shortcut
  const handleProductCreate = async (productData) => {
    try {
      await createProduct(productData);
      showToast({
        title: 'Product Created',
        message: `Registered "${productData.name}". You can now receive stock for it.`,
        type: 'success'
      });
      setIsReceiveOpen(true);
    } catch (err) {
      showToast({
        title: 'Product Creation Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>Store Inventory & Batches</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Batch-wise stock management, purchase ledger, and FEFO expiry tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              fetchBatches(pagination.page);
              fetchSummary();
            }}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={PlusCircle}
            onClick={() => setIsReceiveOpen(true)}
          >
            Receive Stock Batch
          </Button>
        </div>
      </div>

      {/* 5 Real Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        
        {/* Total Available Units */}
        <Card hoverEffect>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">In-Stock Units</span>
              <Archive className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              <AnimatedCounter value={summary.totalUnitsInStock} />
            </div>
            <p className="text-[11px] text-slate-400">Saleable active stock</p>
          </CardContent>
        </Card>

        {/* Distinct Products with Stock */}
        <Card hoverEffect>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Stocked SKUs</span>
              <Package className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              <AnimatedCounter value={summary.distinctProductsWithStock} />
            </div>
            <p className="text-[11px] text-slate-400">Distinct catalog items</p>
          </CardContent>
        </Card>

        {/* Active Batches */}
        <Card hoverEffect>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Active Lots</span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              <AnimatedCounter value={summary.activeBatches} />
            </div>
            <p className="text-[11px] text-slate-400">Batches with units</p>
          </CardContent>
        </Card>

        {/* Low Stock Items */}
        <Card hoverEffect>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Low Stock</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 tracking-tight">
              <AnimatedCounter value={summary.lowStockProducts} />
            </div>
            <p className="text-[11px] text-slate-400">
              SKUs ≤ {summary.lowStockThreshold || 5} units left
            </p>
          </CardContent>
        </Card>

        {/* Expired Stock Units */}
        <Card hoverEffect className={summary.expiredUnits > 0 ? 'border-rose-200 bg-rose-50/20' : ''}>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-slate-500 pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Expired Units</span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 tracking-tight">
              <AnimatedCounter value={summary.expiredUnits} />
            </div>
            <p className="text-[11px] text-slate-400">
              {summary.expiredBatches} expired batch{summary.expiredBatches === 1 ? '' : 'es'}
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            
            {/* Search */}
            <div className="sm:col-span-2">
              <Input
                placeholder="Search by product, barcode, batch #, or supplier..."
                icon={Search}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category Filter */}
            <div>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={categories.map((c) => ({
                  value: c,
                  label: c === 'All' ? 'All Categories' : c
                }))}
              />
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All Batches' },
                  { value: 'active', label: 'Fresh / Active Stock' },
                  { value: 'expiringSoon', label: 'Expiring Soon (< 7 Days)' },
                  { value: 'expired', label: 'Expired Batches' },
                  { value: 'lowStock', label: `Low Stock (≤ ${summary.lowStockThreshold || 5} units)` },
                  { value: 'depleted', label: 'Depleted (0 Units)' },
                ]}
              />
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Batches Table / Empty State / Loading */}
      {isLoading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <p className="font-semibold text-sm">{error}</p>
          <Button size="sm" variant="secondary" onClick={() => fetchBatches(1)}>
            Retry Connection
          </Button>
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <EmptyState
              icon={Layers}
              title={
                searchTerm || categoryFilter !== 'All' || statusFilter !== 'all'
                  ? 'No Matching Batches'
                  : 'No Inventory Recorded'
              }
              description={
                searchTerm || categoryFilter !== 'All' || statusFilter !== 'all'
                  ? 'Try clearing active search terms or category/status filters.'
                  : 'There are currently zero inventory units logged in your store. Receive a stock batch to begin inventory tracking.'
              }
              actionLabel={
                searchTerm || categoryFilter !== 'All' || statusFilter !== 'all'
                  ? 'Clear Filters'
                  : 'Receive First Stock Batch'
              }
              actionIcon={PlusCircle}
              onAction={() => {
                if (searchTerm || categoryFilter !== 'All' || statusFilter !== 'all') {
                  setSearchTerm('');
                  setCategoryFilter('All');
                  setStatusFilter('all');
                } else {
                  setIsReceiveOpen(true);
                }
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Product</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Available Stock</TableHead>
                <TableHead>Cost / Unit</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const product = batch.product;
                const remainingPct = Math.round(
                  ((batch.currentQuantity || 0) / (batch.quantityReceived || 1)) * 100
                );

                return (
                  <TableRow key={batch._id} className="group">
                    
                    {/* Product Name & Category */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {product?.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <Package className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm line-clamp-1">
                            {product?.name || 'Unknown Product'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {product?.category} {product?.brand ? `• ${product.brand}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Batch Number */}
                    <TableCell>
                      {batch.batchNumber ? (
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {batch.batchNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No lot #</span>
                      )}
                    </TableCell>

                    {/* Available Stock & Progress Bar */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900">
                            {batch.currentQuantity} {product?.unit || 'units'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            of {batch.quantityReceived}
                          </span>
                        </div>
                        <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              batch.isExpired
                                ? 'bg-rose-500'
                                : batch.isExpiringSoon
                                ? 'bg-amber-500'
                                : batch.currentQuantity === 0
                                ? 'bg-slate-300'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(remainingPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Price */}
                    <TableCell>
                      <div className="text-xs">
                        <p className="font-bold text-slate-800">
                          ${batch.purchasePrice?.toFixed(2)}
                        </p>
                        {batch.sellingPrice && (
                          <p className="text-[10px] text-emerald-700 font-medium">
                            Sell: ${batch.sellingPrice.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Expiry Date & Countdown */}
                    <TableCell>
                      <div className="text-xs">
                        <p className="font-semibold text-slate-800">
                          {new Date(batch.expiryDate).toLocaleDateString()}
                        </p>
                        <p className={`text-[10px] font-medium ${
                          batch.isExpired
                            ? 'text-rose-600'
                            : batch.isExpiringSoon
                            ? 'text-amber-600'
                            : 'text-slate-400'
                        }`}>
                          {batch.isExpired
                            ? `Expired ${Math.abs(batch.daysUntilExpiry)}d ago`
                            : `${batch.daysUntilExpiry} days left`}
                        </p>
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      {batch.currentQuantity === 0 ? (
                        <Badge variant="neutral" size="sm">Depleted</Badge>
                      ) : batch.isExpired ? (
                        <Badge variant="danger" size="sm" dot>Expired</Badge>
                      ) : batch.isExpiringSoon ? (
                        <Badge variant="warning" size="sm" dot>Expiring Soon</Badge>
                      ) : (
                        <Badge variant="fresh" size="sm" dot>Fresh</Badge>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Eye}
                          onClick={() => {
                            setSelectedBatchId(batch._id);
                            setIsDetailOpen(true);
                          }}
                          title="View batch details & movement log"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={ArrowDownUp}
                          onClick={() => {
                            setSelectedBatch(batch);
                            setIsAdjustOpen(true);
                          }}
                          title="Adjust stock quantity"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Edit3}
                          onClick={() => {
                            setSelectedBatch(batch);
                            setIsEditOpen(true);
                          }}
                          title="Edit batch information"
                        />
                      </div>
                    </TableCell>

                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 px-2 pt-2">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {batches.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}
              </span>
              {' '}-{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>
              {' '}of{' '}
              <span className="font-semibold text-slate-800">{pagination.total}</span> batches
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronLeft}
                disabled={pagination.page <= 1}
                onClick={() => fetchBatches(pagination.page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs px-2 font-medium">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchBatches(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Receive Stock Batch Modal */}
      <ReceiveStockModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        onSuccess={handleActionSuccess}
        onOpenProductCreate={() => setIsProductCreateOpen(true)}
      />

      {/* 2. Adjust Stock Modal */}
      <AdjustStockModal
        isOpen={isAdjustOpen}
        onClose={() => {
          setIsAdjustOpen(false);
          setSelectedBatch(null);
        }}
        batch={selectedBatch}
        onSuccess={handleActionSuccess}
      />

      {/* 3. Batch Detail Modal */}
      <BatchDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedBatchId(null);
        }}
        batchId={selectedBatchId}
        onOpenAdjust={(b) => {
          setIsDetailOpen(false);
          setSelectedBatch(b);
          setIsAdjustOpen(true);
        }}
        onOpenEdit={(b) => {
          setIsDetailOpen(false);
          setSelectedBatch(b);
          setIsEditOpen(true);
        }}
      />

      {/* 4. Edit Batch Modal */}
      <EditBatchModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedBatch(null);
        }}
        batch={selectedBatch}
        onSuccess={handleActionSuccess}
      />

      {/* 5. Product Form Modal (Shortcut if product not found in catalog) */}
      <ProductFormModal
        isOpen={isProductCreateOpen}
        onClose={() => setIsProductCreateOpen(false)}
        onSubmit={handleProductCreate}
      />

    </div>
  );
}
