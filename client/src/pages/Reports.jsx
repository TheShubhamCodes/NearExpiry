import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Download,
  Printer,
  Calendar,
  Search,
  Filter,
  DollarSign,
  TrendingDown,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Package,
  Layers,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  getReportData,
  downloadReportCSV,
  getProductCategories
} from '../services/api';

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { store } = useAuth();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';

  // Active Report Type
  const initialType = searchParams.get('type') || 'expiry';
  const [reportType, setReportType] = useState(initialType);

  // Filters
  const [period, setPeriod] = useState('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [categories, setCategories] = useState([]);

  // Data & Pagination
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const reportTabs = [
    { id: 'expiry', label: 'Expiry Risk', icon: Calendar },
    { id: 'valuation', label: 'Inventory Valuation', icon: DollarSign },
    { id: 'movement', label: 'Stock Movement Audit', icon: Layers },
    { id: 'markdowns', label: 'Markdowns & Promos', icon: TrendingDown },
    { id: 'returns', label: 'Supplier Returns', icon: RotateCcw },
    { id: 'disposal', label: 'Quarantine & Disposal', icon: ShieldAlert },
    { id: 'lowStock', label: 'Low Stock & Reorders', icon: Package }
  ];

  const handleTabChange = (type) => {
    setReportType(type);
    setPage(1);
    setStatus('ALL');
    setSearchParams({ type });
  };

  const fetchCategories = async () => {
    try {
      const res = await getProductCategories();
      if (res?.success) {
        setCategories(res.data || []);
      }
    } catch (err) {
      console.warn('Failed to load categories:', err);
    }
  };

  const fetchReport = async () => {
    try {
      setIsLoading(true);
      const params = {
        page,
        limit,
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        search: search.trim() || undefined,
        category: category !== 'ALL' ? category : undefined,
        status: status !== 'ALL' ? status : undefined
      };

      const res = await getReportData(reportType, params);
      if (res?.success) {
        setRows(res.data || []);
        if (res.pagination) {
          setTotalPages(res.pagination.totalPages || 1);
          setTotalRecords(res.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
      showToast({
        title: 'Report Load Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [reportType, page, limit, period, category, status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReport();
  };

  const handleCSVExport = async () => {
    try {
      setIsExporting(true);
      const params = {
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        search: search.trim() || undefined,
        category: category !== 'ALL' ? category : undefined,
        status: status !== 'ALL' ? status : undefined
      };
      await downloadReportCSV(reportType, params);
      showToast({
        title: 'Export Complete',
        message: `${reportType.toUpperCase()} report downloaded as CSV.`,
        type: 'success'
      });
    } catch (err) {
      showToast({
        title: 'Export Failed',
        message: err.response?.data?.message || err.message,
        type: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* ========================================================================= */}
      {/* 1. HEADER (HIDDEN IN PRINT VIEW) */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm shadow-emerald-600/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                Business Analytics & Audit Reports
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Generate and export granular operational audits across inventory valuation, expiry risk, and loss prevention.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleCSVExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={Printer}
            onClick={handlePrint}
          >
            Print Report
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REPORT TABS (HIDDEN IN PRINT VIEW) */}
      {/* ========================================================================= */}
      <div className="flex border-b border-slate-200/80 gap-2 sm:gap-3 overflow-x-auto pb-px print:hidden">
        {reportTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4 text-emerald-600" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 3. FILTER BAR (HIDDEN IN PRINT VIEW) */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period selector */}
          {['movement'].includes(reportType) && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <Select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="text-xs w-36"
              >
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
              </Select>
            </div>
          )}

          {/* Category filter */}
          {['expiry', 'valuation', 'lowStock'].includes(reportType) && (
            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="text-xs w-36"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}

          {/* Status filter */}
          {reportType === 'expiry' && (
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs w-36"
            >
              <option value="ALL">All Statuses</option>
              <option value="FRESH">Fresh</option>
              <option value="EXPIRING_SOON">Warning (4-7d)</option>
              <option value="CRITICAL">Critical (1-3d)</option>
              <option value="EXPIRING_TODAY">Expiring Today</option>
              <option value="EXPIRED">Expired</option>
            </Select>
          )}

          {reportType === 'markdowns' && (
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs w-36"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING_APPROVAL">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          )}

          {reportType === 'returns' && (
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs w-36"
            >
              <option value="ALL">All Statuses</option>
              <option value="REQUESTED">Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="REPLACEMENT_RECEIVED">Replacement Received</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CLOSED">Closed</option>
            </Select>
          )}

          {reportType === 'disposal' && (
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs w-36"
            >
              <option value="ALL">All Statuses</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="DISPOSED">Disposed</option>
              <option value="WRITTEN_OFF">Written Off</option>
              <option value="DONATED">Donated</option>
            </Select>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
          <Input
            placeholder="Search product or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs w-full md:w-48"
          />
          <Button type="submit" variant="secondary" size="xs">
            Search
          </Button>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* 4. PRINTABLE REPORT HEADER (VISIBLE ONLY IN PRINT / PDF) */}
      {/* ========================================================================= */}
      <div className="hidden print:block p-4 border-b border-slate-300 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{store?.storeName || 'NearExpiry Supermarket'}</h1>
            <p className="text-sm font-semibold text-emerald-700 capitalize">
              {reportType} Audit & Business Report
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Generated: {new Date().toLocaleString()}</p>
            <p>Store Timezone: {store?.timezone || 'Asia/Kolkata'}</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. DATA TABLE SECTION */}
      {/* ========================================================================= */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 capitalize">
              {reportTabs.find((t) => t.id === reportType)?.label} Data
            </CardTitle>
            <Badge variant="neutral" size="sm">{totalRecords} records</Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 print:hidden">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border-slate-200 text-xs py-1 px-2"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading report data...</div>
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={FileSpreadsheet}
                title="No records found"
                description="No database records matched the selected report filters and criteria."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                {/* 1. EXPIRY RISK REPORT TABLE */}
                {reportType === 'expiry' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Cost at Risk</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Days Left</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName}</TableCell>
                          <TableCell>#{r.batchNumber}</TableCell>
                          <TableCell>{r.category}</TableCell>
                          <TableCell>{r.quantity} {r.unit}</TableCell>
                          <TableCell className="font-extrabold text-rose-600">{currencySymbol}{r.costAtRisk?.toFixed(2)}</TableCell>
                          <TableCell>{r.expiryDate}</TableCell>
                          <TableCell>
                            <span className={r.daysUntilExpiry <= 3 ? 'font-bold text-rose-600' : 'text-slate-700'}>
                              {r.daysUntilExpiry < 0 ? `${Math.abs(r.daysUntilExpiry)}d ago` : `${r.daysUntilExpiry} days`}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.status === 'EXPIRED' ? 'danger' : r.status === 'CRITICAL' ? 'warning' : 'success'} size="sm">
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 2. VALUATION REPORT TABLE */}
                {reportType === 'valuation' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Batches</TableHead>
                        <TableHead>Stock Units</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Total Retail</TableHead>
                        <TableHead>Potential Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName}</TableCell>
                          <TableCell>{r.category}</TableCell>
                          <TableCell>{r.batchesCount}</TableCell>
                          <TableCell>{r.totalUnits} {r.unit}</TableCell>
                          <TableCell className="font-bold text-slate-800">{currencySymbol}{r.totalCost?.toFixed(2)}</TableCell>
                          <TableCell className="font-bold text-emerald-700">{currencySymbol}{r.totalRetail?.toFixed(2)}</TableCell>
                          <TableCell className="font-extrabold text-teal-800">{currencySymbol}{r.potentialMargin?.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 3. STOCK MOVEMENT REPORT TABLE */}
                {reportType === 'movement' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Product / Batch</TableHead>
                        <TableHead>Movement Type</TableHead>
                        <TableHead>Qty Changed</TableHead>
                        <TableHead>Before → After</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>User</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-slate-500 text-xs">{new Date(r.timestamp).toLocaleString()}</TableCell>
                          <TableCell className="font-bold text-slate-900">
                            {r.productName} <span className="text-slate-400 font-normal">#{r.batchNumber}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="neutral" size="sm">{r.movementType}</Badge>
                          </TableCell>
                          <TableCell className="font-bold text-slate-900">{r.quantityChanged}</TableCell>
                          <TableCell>{r.quantityBefore} → {r.quantityAfter}</TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-xs truncate">{r.reason}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-700">{r.user}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 4. MARKDOWNS REPORT TABLE */}
                {reportType === 'markdowns' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product / Batch</TableHead>
                        <TableHead>Original Price</TableHead>
                        <TableHead>Discount %</TableHead>
                        <TableHead>Discounted Price</TableHead>
                        <TableHead>Units in Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Requested By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName} #{r.batchNumber}</TableCell>
                          <TableCell className="line-through text-slate-400">{currencySymbol}{r.originalPrice?.toFixed(2)}</TableCell>
                          <TableCell className="font-bold text-emerald-700">-{r.discountPercent}%</TableCell>
                          <TableCell className="font-extrabold text-slate-900">{currencySymbol}{r.discountedPrice?.toFixed(2)}</TableCell>
                          <TableCell>{r.currentQuantity}</TableCell>
                          <TableCell><Badge variant="success" size="sm">{r.status}</Badge></TableCell>
                          <TableCell>{r.requestedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 5. SUPPLIER RETURNS REPORT TABLE */}
                {reportType === 'returns' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product / Batch</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Resolution</TableHead>
                        <TableHead>Recovery Value</TableHead>
                        <TableHead>Follow-up</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName} #{r.batchNumber}</TableCell>
                          <TableCell>{r.supplierName}</TableCell>
                          <TableCell>{r.quantity} {r.unit}</TableCell>
                          <TableCell><Badge variant="info" size="sm">{r.status}</Badge></TableCell>
                          <TableCell>{r.resolutionExpected}</TableCell>
                          <TableCell className="font-bold text-slate-900">{currencySymbol}{r.recoveryValue?.toFixed(2)}</TableCell>
                          <TableCell>{r.followUpDate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 6. DISPOSAL & QUARANTINE REPORT TABLE */}
                {reportType === 'disposal' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product / Batch</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Method / Type</TableHead>
                        <TableHead>Cost Loss</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Handled By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName} #{r.batchNumber}</TableCell>
                          <TableCell>{r.quantity} {r.unit}</TableCell>
                          <TableCell>{r.disposalMethod}</TableCell>
                          <TableCell className="font-extrabold text-rose-600">{currencySymbol}{r.costLoss?.toFixed(2)}</TableCell>
                          <TableCell><Badge variant="danger" size="sm">{r.status}</Badge></TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-xs truncate">{r.reason}</TableCell>
                          <TableCell>{r.responsibleEmployee}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}

                {/* 7. LOW STOCK REPORT TABLE */}
                {reportType === 'lowStock' && (
                  <>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Available Stock</TableHead>
                        <TableHead>Reorder Threshold</TableHead>
                        <TableHead>Stock Deficit</TableHead>
                        <TableHead>Alert Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-bold text-slate-900">{r.productName}</TableCell>
                          <TableCell>{r.category}</TableCell>
                          <TableCell className="font-bold text-slate-900">{r.availableStock} {r.unit}</TableCell>
                          <TableCell>{r.reorderPoint} {r.unit}</TableCell>
                          <TableCell className="font-extrabold text-rose-600">{r.stockDeficit} {r.unit}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === 'OUT_OF_STOCK' ? 'danger' : 'warning'} size="sm">
                              {r.status?.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </>
                )}
              </Table>
            </div>
          )}
        </CardContent>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 print:hidden">
            <span>
              Page {page} of {totalPages} ({totalRecords} records)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="xs"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="xs"
                icon={ChevronRight}
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
  );
}
