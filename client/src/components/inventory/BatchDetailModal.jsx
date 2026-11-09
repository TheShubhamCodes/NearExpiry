import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Package, 
  Calendar, 
  Clock, 
  Tag, 
  Building2, 
  FileText, 
  ArrowDownUp, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  History 
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { getBatchById } from '../../services/api';

export default function BatchDetailModal({
  isOpen,
  onClose,
  batchId,
  onOpenAdjust,
  onOpenEdit
}) {
  const [batchData, setBatchData] = useState(null);
  const [movements, setMovements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'history'

  const loadBatchDetails = async () => {
    if (!batchId) return;
    setIsLoading(true);
    try {
      const response = await getBatchById(batchId);
      if (response?.data) {
        setBatchData(response.data.batch);
        setMovements(response.data.movements || []);
      }
    } catch (err) {
      console.warn('Failed to load batch details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && batchId) {
      loadBatchDetails();
      setActiveTab('details');
    }
  }, [isOpen, batchId]);

  if (!isOpen) return null;

  const b = batchData;
  const product = b?.product;

  const current = b?.currentQuantity ?? 0;
  const received = b?.quantityReceived ?? 1;
  const remainingPct = Math.round((current / received) * 100);

  const getStatusBadge = () => {
    if (!b) return null;
    if (b.currentQuantity === 0) {
      return <Badge variant="neutral" size="sm">Depleted (0 Stock)</Badge>;
    }
    if (b.isExpired) {
      return <Badge variant="danger" size="sm" dot>Expired Stock</Badge>;
    }
    if (b.isExpiringSoon) {
      return <Badge variant="warning" size="sm" dot>Expiring Soon</Badge>;
    }
    return <Badge variant="fresh" size="sm" dot>Fresh Stock</Badge>;
  };

  const getMovementTypeBadge = (type) => {
    switch (type) {
      case 'STOCK_RECEIVED':
        return <Badge variant="fresh" size="sm">Received</Badge>;
      case 'STOCK_ADJUSTED_INCREASE':
        return <Badge variant="fresh" size="sm">Increase (+)</Badge>;
      case 'STOCK_ADJUSTED_DECREASE':
        return <Badge variant="warning" size="sm">Adjustment (-)</Badge>;
      case 'STOCK_DAMAGED':
        return <Badge variant="danger" size="sm">Damaged</Badge>;
      case 'STOCK_EXPIRED':
        return <Badge variant="danger" size="sm">Expired Removal</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={b ? `Batch: ${b.batchNumber || 'Unassigned Lot'}` : 'Batch Details'}
      description={product ? `${product.name} — ${product.category}` : 'Inventory batch tracking record'}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Edit3}
              onClick={() => onOpenEdit(b)}
            >
              Edit Batch
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ArrowDownUp}
              onClick={() => onOpenAdjust(b)}
            >
              Adjust Stock
            </Button>
          </div>
        </div>
      }
    >
      {isLoading || !b ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading batch details...</div>
      ) : (
        <div className="space-y-4">

          {/* Top Status Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-2xs">
                {product?.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{product?.name}</h3>
                <p className="text-xs text-slate-500">
                  {product?.brand ? `${product.brand} • ` : ''}
                  {product?.barcode ? `Barcode: ${product.barcode}` : 'Non-barcoded item'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {getStatusBadge()}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'details'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Information</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Stock Movement Log ({movements.length})</span>
            </button>
          </div>

          {/* Tab 1: Detailed Batch Information */}
          {activeTab === 'details' ? (
            <div className="space-y-3.5 text-xs">
              
              {/* Stock Level Progress */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">
                    Available Batch Stock
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    {b.currentQuantity} / {b.quantityReceived} {product?.unit || 'units'} ({remainingPct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      b.isExpired
                        ? 'bg-rose-500'
                        : b.isExpiringSoon
                        ? 'bg-amber-500'
                        : b.currentQuantity === 0
                        ? 'bg-slate-300'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(remainingPct, 100)}%` }}
                  />
                </div>
              </div>

              {/* Grid Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Purchase Cost</span>
                  <p className="font-bold text-slate-800">${b.purchasePrice?.toFixed(2)}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Selling Price</span>
                  <p className="font-bold text-slate-800">
                    {b.sellingPrice ? `$${b.sellingPrice.toFixed(2)}` : '—'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Expiry Date</span>
                  <p className="font-bold text-slate-800">
                    {new Date(b.expiryDate).toLocaleDateString()}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Shelf Life</span>
                  <p className={`font-bold ${
                    b.isExpired ? 'text-rose-600' : b.isExpiringSoon ? 'text-amber-600' : 'text-emerald-700'
                  }`}>
                    {b.isExpired
                      ? `Expired ${Math.abs(b.daysUntilExpiry)}d ago`
                      : `${b.daysUntilExpiry} days left`}
                  </p>
                </div>
              </div>

              {/* Supplier & Logistics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>Supplier Name</span>
                  </span>
                  <p className="font-medium text-slate-800">{b.supplierName || '—'}</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Invoice / PO #</span>
                  </span>
                  <p className="font-medium text-slate-800">{b.supplierInvoiceNumber || '—'}</p>
                </div>
              </div>

              {/* Manufacturing & Received Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Manufacturing Date</span>
                  </span>
                  <p className="font-medium text-slate-800">
                    {b.manufacturingDate ? new Date(b.manufacturingDate).toLocaleDateString() : 'Not provided'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Received Date</span>
                  </span>
                  <p className="font-medium text-slate-800">
                    {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {b.notes && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Batch Notes</span>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{b.notes}</p>
                </div>
              )}

            </div>
          ) : (
            /* Tab 2: Stock Movement Audit Log */
            <div className="space-y-3">
              {movements.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No movement records found for this batch.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow hover={false}>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Delta</TableHead>
                        <TableHead>Transition</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m._id}>
                          <TableCell className="text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell>
                            {getMovementTypeBadge(m.movementType)}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-slate-800">
                            {m.movementType === 'STOCK_RECEIVED' || m.movementType === 'STOCK_ADJUSTED_INCREASE'
                              ? `+${m.quantityChanged}`
                              : `-${m.quantityChanged}`}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-600 font-mono">
                            {m.quantityBefore} → {m.quantityAfter}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 max-w-xs truncate" title={m.reason}>
                            {m.reason}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-500">
                            {m.user?.fullName || 'Staff'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </Modal>
  );
}

