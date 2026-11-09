import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Package, 
  Calendar, 
  Tag, 
  DollarSign, 
  Building2, 
  FileText, 
  PlusCircle, 
  Search, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { getProducts, receiveStock } from '../../services/api';

export default function ReceiveStockModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedProduct = null,
  onOpenProductCreate = null
}) {
  const [productsList, setProductsList] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    batchNumber: '',
    quantityReceived: '',
    purchasePrice: '',
    sellingPrice: '',
    manufacturingDate: '',
    expiryDate: '',
    receivedDate: new Date().toISOString().split('T')[0],
    supplierName: '',
    supplierInvoiceNumber: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available products
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const response = await getProducts({ limit: 100 });
        if (isMounted && response?.data?.products) {
          setProductsList(response.data.products);
          if (preselectedProduct?._id) {
            setSelectedProductId(preselectedProduct._id);
          } else if (response.data.products.length > 0 && !selectedProductId) {
            setSelectedProductId(response.data.products[0]._id);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch products for receiving stock:', err);
      } finally {
        if (isMounted) setIsLoadingProducts(false);
      }
    };

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, [isOpen, preselectedProduct]);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setFormData({
        batchNumber: '',
        quantityReceived: '',
        purchasePrice: '',
        sellingPrice: '',
        manufacturingDate: '',
        expiryDate: '',
        receivedDate: new Date().toISOString().split('T')[0],
        supplierName: '',
        supplierInvoiceNumber: '',
        notes: ''
      });
      setErrors({});
      if (preselectedProduct?._id) {
        setSelectedProductId(preselectedProduct._id);
      }
    }
  }, [isOpen, preselectedProduct]);

  const selectedProduct = productsList.find((p) => p._id === selectedProductId) || preselectedProduct;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  // Helper quick buttons to set expiry date relative to today
  const handleQuickExpiry = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    handleChange('expiryDate', d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!selectedProductId) {
      newErrors.product = 'Please select a product from the catalog.';
    }
    if (!formData.quantityReceived || Number(formData.quantityReceived) <= 0) {
      newErrors.quantityReceived = 'Quantity received must be greater than 0.';
    }
    if (formData.purchasePrice === '' || Number(formData.purchasePrice) < 0) {
      newErrors.purchasePrice = 'Purchase cost cannot be negative.';
    }
    if (!formData.expiryDate) {
      newErrors.expiryDate = 'Expiry date is required for inventory tracking.';
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
      await receiveStock({
        productId: selectedProductId,
        batchNumber: formData.batchNumber.trim(),
        quantityReceived: Number(formData.quantityReceived),
        purchasePrice: Number(formData.purchasePrice),
        sellingPrice: formData.sellingPrice !== '' ? Number(formData.sellingPrice) : null,
        manufacturingDate: formData.manufacturingDate || null,
        expiryDate: formData.expiryDate,
        receivedDate: formData.receivedDate || new Date(),
        supplierName: formData.supplierName.trim(),
        supplierInvoiceNumber: formData.supplierInvoiceNumber.trim(),
        notes: formData.notes.trim()
      });

      onSuccess(`Stock batch received for "${selectedProduct?.name || 'Product'}".`);
      onClose();
    } catch (err) {
      setErrors({
        server: err.response?.data?.message || err.message || 'Failed to record stock receipt'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Filter products for dropdown
  const filteredProducts = productsList.filter((p) => {
    if (!productSearchTerm) return true;
    const term = productSearchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.barcode && p.barcode.toLowerCase().includes(term)) ||
      (p.brand && p.brand.toLowerCase().includes(term))
    );
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Receive Stock Batch"
      description="Record incoming purchase batch with separate lot numbers, costs, and expiry dates."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Layers}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            Log Stock Receipt
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Server error */}
        {errors.server && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div className="font-medium">{errors.server}</div>
          </div>
        )}

        {/* 1. Product Selection */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Select Supermarket Product *</span>
            </label>
            {onOpenProductCreate && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProductCreate();
                }}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New SKU</span>
              </button>
            )}
          </div>

          {productsList.length > 5 && (
            <Input
              placeholder="Filter product list by name or barcode..."
              icon={Search}
              value={productSearchTerm}
              onChange={(e) => setProductSearchTerm(e.target.value)}
              className="mb-2"
            />
          )}

          <Select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            options={
              filteredProducts.length > 0
                ? filteredProducts.map((p) => ({
                    value: p._id,
                    label: `${p.name} ${p.brand ? `(${p.brand})` : ''} — [Unit: ${p.unit}]`
                  }))
                : [{ value: '', label: 'No products in catalog. Add product first.' }]
            }
            error={errors.product}
          />

          {/* Selected Product Pill */}
          {selectedProduct && (
            <div className="flex items-center gap-3 pt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Unit of Measure:</span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-emerald-700 capitalize">
                {selectedProduct.unit}
              </span>
              {selectedProduct.barcode && (
                <>
                  <span className="font-semibold text-slate-800">Barcode:</span>
                  <span className="font-mono text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {selectedProduct.barcode}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 2. Batch Number & Quantities */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Input
            label="Batch / Lot Number"
            placeholder="e.g. LOT-2026-B10 (Optional)"
            value={formData.batchNumber}
            onChange={(e) => handleChange('batchNumber', e.target.value)}
            helperText="Identifier provided by manufacturer"
          />

          <Input
            label={`Quantity Received (${selectedProduct?.unit || 'units'}) *`}
            type="number"
            step="any"
            min="0.001"
            placeholder="e.g. 50"
            value={formData.quantityReceived}
            onChange={(e) => handleChange('quantityReceived', e.target.value)}
            error={errors.quantityReceived}
            required
          />
        </div>

        {/* 3. Prices */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Input
            label="Purchase Cost Per Unit ($) *"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 1.75"
            value={formData.purchasePrice}
            onChange={(e) => handleChange('purchasePrice', e.target.value)}
            error={errors.purchasePrice}
            required
          />

          <Input
            label="Selling Price Per Unit ($)"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 2.99 (Optional)"
            value={formData.sellingPrice}
            onChange={(e) => handleChange('sellingPrice', e.target.value)}
            helperText="Shelf retail price target"
          />
        </div>

        {/* 4. Dates & Quick Presets */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Manufacturing Date (Optional)"
              type="date"
              value={formData.manufacturingDate}
              onChange={(e) => handleChange('manufacturingDate', e.target.value)}
            />

            <div>
              <Input
                label="Expiry Date *"
                type="date"
                value={formData.expiryDate}
                onChange={(e) => handleChange('expiryDate', e.target.value)}
                error={errors.expiryDate}
                required
              />
              
              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Presets:</span>
                <button
                  type="button"
                  onClick={() => handleQuickExpiry(1)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  +1 Mo
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExpiry(3)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  +3 Mo
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExpiry(6)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  +6 Mo
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExpiry(12)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
                >
                  +1 Year
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Supplier Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Input
            label="Supplier / Distributor Name"
            placeholder="e.g. Metro Wholesale Foods"
            value={formData.supplierName}
            onChange={(e) => handleChange('supplierName', e.target.value)}
            icon={Building2}
          />

          <Input
            label="Supplier Invoice / PO Number"
            placeholder="e.g. INV-2026-908"
            value={formData.supplierInvoiceNumber}
            onChange={(e) => handleChange('supplierInvoiceNumber', e.target.value)}
            icon={FileText}
          />
        </div>

        {/* 6. Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Batch Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Delivery condition, pallet location, or temperature storage notes..."
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
          />
        </div>

      </form>
    </Modal>
  );
}

