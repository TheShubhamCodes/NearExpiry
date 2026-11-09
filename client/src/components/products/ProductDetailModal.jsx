import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ScanLine, 
  Tag, 
  Layers, 
  Building2, 
  Calendar, 
  User, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  PlusCircle,
  Archive,
  AlertTriangle,
  Clock
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { getProductBatches } from '../../services/api';

export default function ProductDetailModal({
  isOpen,
  onClose,
  product,
  onEdit,
  onDelete,
  onReceiveStock
}) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchSummary, setBatchSummary] = useState(null);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  // Load product batches and real-time inventory
  useEffect(() => {
    if (isOpen && product?._id) {
      setIsLoadingBatches(true);
      getProductBatches(product._id)
        .then((res) => {
          if (res?.data) {
            setBatches(res.data.batches || []);
            setBatchSummary(res.data.summary || null);
          }
        })
        .catch((err) => {
          console.warn('Failed to load product batches:', err);
        })
        .finally(() => {
          setIsLoadingBatches(false);
        });
    } else {
      setBatches([]);
      setBatchSummary(null);
    }
  }, [isOpen, product?._id]);

  if (!isOpen || !product) return null;

  const handleCopyBarcode = () => {
    if (product.barcode) {
      navigator.clipboard.writeText(product.barcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const createdDate = product.createdAt
    ? new Date(product.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Unknown';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.name}
      description={`Master SKU record in ${product.category} catalog.`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => onDelete(product)}
          >
            Delete
          </Button>
          
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Edit3}
              onClick={() => onEdit(product)}
            >
              Edit Product
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        
        {/* Product Image & Top Identity Card */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70">
          
          {/* Product Thumbnail / Large Icon */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
            {product.imageUrl && !imgError ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain p-1"
                onError={() => setImgError(true)}
              />
            ) : (
              <Package className="w-10 h-10 text-emerald-500/70" />
            )}
          </div>

          {/* Core Info */}
          <div className="flex-1 space-y-1.5 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <Badge variant="fresh" size="sm">
                {product.category}
              </Badge>
              <Badge variant="neutral" size="sm">
                Unit: {product.unit}
              </Badge>
              {product.brand && (
                <Badge variant="outline" size="sm">
                  {product.brand}
                </Badge>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {product.name}
            </h2>

            {/* Barcode strip */}
            {product.barcode ? (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs font-mono text-xs text-slate-700">
                <ScanLine className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-semibold tracking-wider">{product.barcode}</span>
                <button
                  type="button"
                  onClick={handleCopyBarcode}
                  className="text-slate-400 hover:text-slate-700 transition-colors ml-1"
                  title="Copy barcode to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No barcode assigned (Non-barcoded item)</p>
            )}
          </div>
        </div>

        {/* Inventory Batches & Stock Section (Phase 5 Integration) */}
        <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Inventory Stock & Batches
              </h3>
            </div>

            {onReceiveStock && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReceiveStock(product);
                }}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-white border border-emerald-200/80 px-2.5 py-1 rounded-lg shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Receive Stock</span>
              </button>
            )}
          </div>

          {isLoadingBatches ? (
            <p className="text-xs text-slate-400 py-2">Loading batch ledger...</p>
          ) : batchSummary ? (
            <div className="space-y-2.5">
              
              {/* Summary Stats Strip */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Available Stock</span>
                  <p className="font-extrabold text-emerald-700 text-sm mt-0.5">
                    {batchSummary.totalAvailableUnits} {product.unit}
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Total Batches</span>
                  <p className="font-extrabold text-slate-800 text-sm mt-0.5">
                    {batchSummary.totalBatches} ({batchSummary.activeBatchesCount} active)
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Earliest Expiry</span>
                  <p className="font-bold text-slate-800 text-xs mt-1">
                    {batchSummary.earliestExpiry
                      ? new Date(batchSummary.earliestExpiry).toLocaleDateString()
                      : 'None'}
                  </p>
                </div>
              </div>

              {/* Batches Mini Table */}
              {batches.length > 0 ? (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200/80 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow hover={false}>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((b) => (
                        <TableRow key={b._id}>
                          <TableCell className="font-mono text-xs font-semibold text-slate-700">
                            {b.batchNumber || '—'}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-800">
                            {b.currentQuantity} / {b.quantityReceived}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {new Date(b.expiryDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {b.currentQuantity === 0 ? (
                              <Badge variant="neutral" size="sm">Depleted</Badge>
                            ) : b.isExpired ? (
                              <Badge variant="danger" size="sm">Expired</Badge>
                            ) : b.isExpiringSoon ? (
                              <Badge variant="warning" size="sm">Soon</Badge>
                            ) : (
                              <Badge variant="fresh" size="sm">Fresh</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                  0 active batches. Use "Receive Stock" to log incoming inventory.
                </div>
              )}

            </div>
          ) : null}
        </div>

        {/* Detailed Grid Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-400" />
              <span>Brand</span>
            </span>
            <p className="font-medium text-slate-800">
              {product.brand || '—'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              <span>Manufacturer / Supplier</span>
            </span>
            <p className="font-medium text-slate-800">
              {product.manufacturer || '—'}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>Date Added</span>
            </span>
            <p className="font-medium text-slate-800">
              {createdDate}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <User className="w-3 h-3 text-slate-400" />
              <span>Created By</span>
            </span>
            <p className="font-medium text-slate-800">
              {product.createdBy?.fullName || 'Store Staff'} {product.createdBy?.role ? `(${product.createdBy.role})` : ''}
            </p>
          </div>

        </div>

        {/* Description section */}
        {product.description && (
          <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-1 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Product Description / Notes
            </span>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {product.description}
            </p>
          </div>
        )}

      </div>
    </Modal>
  );
}
