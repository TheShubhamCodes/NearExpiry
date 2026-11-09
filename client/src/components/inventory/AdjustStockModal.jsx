import React, { useState, useEffect } from 'react';
import { 
  ArrowDownUp, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Package, 
  CalendarClock 
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { adjustStock } from '../../services/api';

const ADJUSTMENT_OPTIONS = [
  { value: 'STOCK_ADJUSTED_DECREASE', label: 'Decrease Stock (Discrepancy / Wastage)' },
  { value: 'STOCK_DAMAGED', label: 'Damaged / Broken / Spoiled Stock' },
  { value: 'STOCK_EXPIRED', label: 'Expired Stock Removal' },
  { value: 'STOCK_ADJUSTED_INCREASE', label: 'Increase Stock (Recount / Return)' }
];

export default function AdjustStockModal({
  isOpen,
  onClose,
  batch,
  onSuccess
}) {
  const [adjustmentType, setAdjustmentType] = useState('STOCK_ADJUSTED_DECREASE');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAdjustmentType('STOCK_ADJUSTED_DECREASE');
      setQuantity('');
      setReason('');
      setError('');
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const currentQty = batch.currentQuantity ?? 0;
  const receivedQty = batch.quantityReceived ?? currentQty;
  const numQty = Number(quantity) || 0;
  const isIncrease = adjustmentType === 'STOCK_ADJUSTED_INCREASE';
  const newQty = isIncrease ? currentQty + numQty : currentQty - numQty;
  const maxIncrease = Math.max(0, receivedQty - currentQty);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!quantity || numQty <= 0) {
      setError('Adjustment quantity must be greater than 0.');
      return;
    }

    if (!isIncrease && newQty < 0) {
      setError(`Cannot reduce by ${numQty}. Only ${currentQty} units are available.`);
      return;
    }

    if (isIncrease && newQty > receivedQty) {
      setError(
        `Cannot increase stock to ${newQty}. Current quantity cannot exceed original received quantity (${receivedQty}) for this batch. Maximum allowed increase is ${maxIncrease}.`
      );
      return;
    }

    if (!reason.trim() || reason.trim().length < 2) {
      setError('Please provide a mandatory explanation for this stock adjustment.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await adjustStock(batch._id, {
        adjustmentType,
        quantity: numQty,
        reason: reason.trim()
      });

      onSuccess(response.message || 'Stock adjusted successfully.');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to adjust stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Stock Quantity"
      description="Record an auditable inventory change with a mandatory reason."
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={isIncrease ? 'primary' : 'danger'}
            size="sm"
            icon={ArrowDownUp}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            Apply Adjustment
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Current Batch Status Banner */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm">
              {batch.product?.name || 'Product'}
            </span>
            <span className="font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md text-[11px]">
              {batch.batchNumber || 'No Batch #'}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-500 pt-1">
            <span>Available Stock:</span>
            <span className="font-extrabold text-slate-900 text-sm">
              {currentQty} of {receivedQty} {batch.product?.unit || 'units'}
            </span>
          </div>
          {isIncrease && (
            <div className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
              Maximum allowable increase: +{maxIncrease} {batch.product?.unit || 'units'}
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div className="font-medium">{error}</div>
          </div>
        )}

        {/* Adjustment Type */}
        <Select
          label="Adjustment Reason Category *"
          value={adjustmentType}
          onChange={(e) => setAdjustmentType(e.target.value)}
          options={ADJUSTMENT_OPTIONS}
        />

        {/* Quantity */}
        <div className="space-y-1.5">
          <Input
            label={`Quantity to ${isIncrease ? 'Add' : 'Deduct'} (${batch.product?.unit || 'units'}) *`}
            type="number"
            step="any"
            min="0.001"
            placeholder={isIncrease ? `Up to ${maxIncrease}` : `Up to ${currentQty}`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />

          {/* Live Preview of resulting quantity */}
          {numQty > 0 && (
            <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
              newQty < 0 || (isIncrease && newQty > receivedQty)
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <span className="font-medium">
                {newQty < 0 || (isIncrease && newQty > receivedQty) ? 'Invalid Stock Level:' : 'Projected New Stock:'}
              </span>
              <span className="font-extrabold text-sm">
                {currentQty} → {newQty} {batch.product?.unit || 'units'}
              </span>
            </div>
          )}
        </div>

        {/* Mandatory Reason */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Audit Reason / Justification *
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide required context (e.g., carton dropped during restock, supplier credit note, physical inventory recount)..."
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
            required
          />
          <p className="text-[11px] text-slate-400">
            This reason will be permanently recorded in the immutable stock movement audit trail.
          </p>
        </div>

      </form>
    </Modal>
  );
}

