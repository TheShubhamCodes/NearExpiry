import React, { useState, useEffect } from 'react';
import { Edit3, AlertCircle, Calendar, Building2, FileText } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { updateBatch } from '../../services/api';

export default function EditBatchModal({
  isOpen,
  onClose,
  batch,
  onSuccess
}) {
  const [formData, setFormData] = useState({
    batchNumber: '',
    purchasePrice: '',
    sellingPrice: '',
    manufacturingDate: '',
    expiryDate: '',
    supplierName: '',
    supplierInvoiceNumber: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && batch) {
      setFormData({
        batchNumber: batch.batchNumber || '',
        purchasePrice: batch.purchasePrice ?? '',
        sellingPrice: batch.sellingPrice ?? '',
        manufacturingDate: batch.manufacturingDate ? new Date(batch.manufacturingDate).toISOString().split('T')[0] : '',
        expiryDate: batch.expiryDate ? new Date(batch.expiryDate).toISOString().split('T')[0] : '',
        supplierName: batch.supplierName || '',
        supplierInvoiceNumber: batch.supplierInvoiceNumber || '',
        notes: batch.notes || ''
      });
      setErrors({});
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (formData.purchasePrice === '' || Number(formData.purchasePrice) < 0) {
      newErrors.purchasePrice = 'Purchase cost cannot be negative.';
    }
    if (!formData.expiryDate) {
      newErrors.expiryDate = 'Expiry date is required.';
    }
    if (formData.manufacturingDate && formData.expiryDate) {
      if (new Date(formData.expiryDate) < new Date(formData.manufacturingDate)) {
        newErrors.expiryDate = 'Expiry date cannot precede manufacturing date.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateBatch(batch._id, {
        batchNumber: formData.batchNumber.trim(),
        purchasePrice: Number(formData.purchasePrice),
        sellingPrice: formData.sellingPrice !== '' ? Number(formData.sellingPrice) : null,
        manufacturingDate: formData.manufacturingDate || null,
        expiryDate: formData.expiryDate,
        supplierName: formData.supplierName.trim(),
        supplierInvoiceNumber: formData.supplierInvoiceNumber.trim(),
        notes: formData.notes.trim()
      });

      onSuccess('Batch details updated successfully.');
      onClose();
    } catch (err) {
      setErrors({
        server: err.response?.data?.message || err.message || 'Failed to update batch'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Batch Information"
      description={`Update specifications for ${batch.product?.name || 'Product'} (Batch ${batch.batchNumber || 'Unassigned'})`}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Edit3}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            Save Changes
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.server && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div className="font-medium">{errors.server}</div>
          </div>
        )}

        <Input
          label="Batch / Lot Number"
          value={formData.batchNumber}
          onChange={(e) => handleChange('batchNumber', e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Purchase Cost ($) *"
            type="number"
            step="0.01"
            min="0"
            value={formData.purchasePrice}
            onChange={(e) => handleChange('purchasePrice', e.target.value)}
            error={errors.purchasePrice}
            required
          />

          <Input
            label="Selling Price ($)"
            type="number"
            step="0.01"
            min="0"
            value={formData.sellingPrice}
            onChange={(e) => handleChange('sellingPrice', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Manufacturing Date"
            type="date"
            value={formData.manufacturingDate}
            onChange={(e) => handleChange('manufacturingDate', e.target.value)}
          />

          <Input
            label="Expiry Date *"
            type="date"
            value={formData.expiryDate}
            onChange={(e) => handleChange('expiryDate', e.target.value)}
            error={errors.expiryDate}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Supplier Name"
            value={formData.supplierName}
            onChange={(e) => handleChange('supplierName', e.target.value)}
            icon={Building2}
          />

          <Input
            label="Invoice / PO #"
            value={formData.supplierInvoiceNumber}
            onChange={(e) => handleChange('supplierInvoiceNumber', e.target.value)}
            icon={FileText}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">Notes</label>
          <textarea
            rows={2}
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
          />
        </div>
      </form>
    </Modal>
  );
}

