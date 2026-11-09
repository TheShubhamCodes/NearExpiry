import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ScanLine, 
  Sparkles, 
  AlertCircle, 
  Info, 
  ExternalLink, 
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  Search
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { lookupBarcode } from '../../services/api';

const DEFAULT_CATEGORIES = [
  'Dairy & Eggs',
  'Bakery & Bread',
  'Fresh Produce',
  'Meat & Seafood',
  'Pantry Staples',
  'Beverages',
  'Snacks & Sweets',
  'Frozen Foods',
  'Personal Care',
  'Household & Cleaning',
  'General'
];

const UNIT_OPTIONS = [
  { value: 'piece', label: 'Piece / Each (pc)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre (L)' },
  { value: 'ml', label: 'Millilitre (mL)' },
  { value: 'packet', label: 'Packet (pkt)' },
  { value: 'box', label: 'Box (bx)' },
  { value: 'can', label: 'Can / Tin' },
  { value: 'bottle', label: 'Bottle (btl)' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'pack', label: 'Pack / Multi-pack' }
];

export default function ProductFormModal({
  isOpen,
  onClose,
  onSubmit,
  onOpenScanner,
  initialData = null,
  onViewExistingProduct = null
}) {
  const isEditMode = Boolean(initialData && initialData._id);

  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    barcode: '',
    category: 'Dairy & Eggs',
    unit: 'piece',
    description: '',
    imageUrl: '',
    manufacturer: ''
  });

  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [lookupNotice, setLookupNotice] = useState(null); // { type: 'off' | 'local' | 'notfound' | 'error', message, existingProduct }
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);

  // Sync initialData when opening in Edit or Create mode
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        brand: initialData.brand || '',
        barcode: initialData.barcode || '',
        category: initialData.category || 'General',
        unit: initialData.unit || 'piece',
        description: initialData.description || '',
        imageUrl: initialData.imageUrl || '',
        manufacturer: initialData.manufacturer || ''
      });
      setLookupNotice(null);
      setErrors({});
      setImagePreviewError(false);
    } else {
      setFormData({
        name: '',
        brand: '',
        barcode: '',
        category: 'Dairy & Eggs',
        unit: 'piece',
        description: '',
        imageUrl: '',
        manufacturer: ''
      });
      setLookupNotice(null);
      setErrors({});
      setImagePreviewError(false);
    }
  }, [initialData, isOpen]);

  // Execute barcode lookup via backend (local store first, then Open Food Facts)
  const handlePerformBarcodeLookup = async (codeToLookup) => {
    const cleanCode = (codeToLookup || formData.barcode || '').trim();
    if (!cleanCode) return;

    setIsLookingUpBarcode(true);
    setLookupNotice(null);

    try {
      const response = await lookupBarcode(cleanCode);
      const data = response.data;

      // Case 1: Exists in local store
      if (data.source === 'local' && data.product) {
        // If we are editing THIS exact product, don't show conflict
        if (isEditMode && initialData._id === data.product._id) {
          setLookupNotice(null);
        } else {
          setLookupNotice({
            type: 'local',
            message: `A product with barcode "${cleanCode}" already exists in your store: "${data.product.name}"`,
            existingProduct: data.product
          });
        }
      }
      // Case 2: Found in Open Food Facts
      else if (data.source === 'openfoodfacts' && data.product) {
        setFormData(prev => ({
          ...prev,
          barcode: cleanCode,
          name: prev.name && prev.name.trim().length > 0 ? prev.name : data.product.name || prev.name,
          brand: data.product.brand || prev.brand,
          category: data.product.category || prev.category,
          unit: data.product.unit || prev.unit,
          imageUrl: data.product.imageUrl || prev.imageUrl,
          manufacturer: data.product.manufacturer || prev.manufacturer,
          description: data.product.description || prev.description
        }));
        setImagePreviewError(false);
        setLookupNotice({
          type: 'off',
          message: `✨ Pre-filled details from Open Food Facts for "${data.product.name}". You can review, adjust, or customize any field below before saving.`
        });
      }
      // Case 3: Not found in Open Food Facts
      else {
        setLookupNotice({
          type: 'notfound',
          message: `Barcode "${cleanCode}" not found in Open Food Facts. You can fill in the product details manually below.`
        });
      }
    } catch (err) {
      setLookupNotice({
        type: 'error',
        message: err.response?.data?.message || 'Could not verify barcode. You can continue manually.'
      });
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    if (field === 'imageUrl') {
      setImagePreviewError(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client validation
    const newErrors = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Product name must be at least 2 characters.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        barcode: formData.barcode.trim() || null,
        category: formData.category.trim(),
        unit: formData.unit,
        description: formData.description.trim(),
        imageUrl: formData.imageUrl.trim(),
        manufacturer: formData.manufacturer.trim()
      });
      onClose();
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.message || 'Failed to save product';
      setErrors({ server: serverMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Product Details' : 'Register New Product'}
      description={
        isEditMode
          ? 'Update master product information and specifications.'
          : 'Create a new master SKU record for your supermarket inventory.'
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Package}
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            {isEditMode ? 'Save Changes' : 'Create Product'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Server error alert */}
        {errors.server && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div className="font-medium">{errors.server}</div>
          </div>
        )}

        {/* Barcode Input & Optical Scanner Action */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Barcode (Optional, EAN/UPC/Code-128)
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="e.g. 3017620422003 (Leave blank if item has no barcode)"
                value={formData.barcode}
                onChange={(e) => handleChange('barcode', e.target.value)}
                icon={ScanLine}
                disabled={isLookingUpBarcode}
              />
            </div>
            
            {/* Lookup button */}
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={isLookingUpBarcode ? RefreshCw : Search}
              onClick={() => handlePerformBarcodeLookup(formData.barcode)}
              disabled={!formData.barcode.trim() || isLookingUpBarcode}
              title="Query local catalog and Open Food Facts"
            >
              {isLookingUpBarcode ? 'Checking...' : 'Lookup'}
            </Button>

            {/* Scan with Camera Button */}
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={ScanLine}
              onClick={onOpenScanner}
              title="Open camera barcode scanner"
              className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            >
              Scan
            </Button>
          </div>

          <p className="text-[11px] text-slate-400">
            Scanning or looking up an unknown barcode automatically imports product details from Open Food Facts.
          </p>
        </div>

        {/* Lookup Notice Banners */}
        {lookupNotice && (
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 border transition-all animate-fade-in ${
            lookupNotice.type === 'off'
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
              : lookupNotice.type === 'local'
              ? 'bg-amber-50/90 border-amber-200 text-amber-800'
              : lookupNotice.type === 'notfound'
              ? 'bg-slate-50 border-slate-200 text-slate-600'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            {lookupNotice.type === 'off' && <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
            {lookupNotice.type === 'local' && <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />}
            {lookupNotice.type === 'notfound' && <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />}
            {lookupNotice.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}

            <div className="flex-1 space-y-1">
              <p className="leading-relaxed font-medium">{lookupNotice.message}</p>
              {lookupNotice.type === 'local' && onViewExistingProduct && lookupNotice.existingProduct && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onViewExistingProduct(lookupNotice.existingProduct)}
                  className="mt-1 text-xs"
                >
                  View Existing Product
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Product Name */}
        <Input
          label="Product Name *"
          placeholder="e.g. Nutella Hazelnut Spread 400g"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          error={errors.name}
          required
        />

        {/* Brand & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Input
            label="Brand"
            placeholder="e.g. Ferrero / Nestle / Farm Fresh"
            value={formData.brand}
            onChange={(e) => handleChange('brand', e.target.value)}
          />

          <Select
            label="Category *"
            value={formData.category}
            onChange={(e) => handleChange('category', e.target.value)}
            options={DEFAULT_CATEGORIES.map(c => ({ value: c, label: c }))}
          />
        </div>

        {/* Unit of Measurement & Manufacturer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Select
            label="Unit of Measurement *"
            value={formData.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
            options={UNIT_OPTIONS}
            helperText="Base physical unit for inventory tracking"
          />

          <Input
            label="Manufacturer / Supplier"
            placeholder="e.g. Ferrero SpA"
            value={formData.manufacturer}
            onChange={(e) => handleChange('manufacturer', e.target.value)}
          />
        </div>

        {/* Product Image URL with Live Thumbnail Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              Product Image URL (Optional)
            </label>
            {formData.imageUrl && (
              <span className="text-[10px] text-slate-400">
                Image preview active
              </span>
            )}
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <Input
                placeholder="https://images.example.com/product.jpg"
                value={formData.imageUrl}
                onChange={(e) => handleChange('imageUrl', e.target.value)}
                icon={ImageIcon}
              />
            </div>
            
            {/* Thumbnail Box */}
            <div className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
              {formData.imageUrl && !imagePreviewError ? (
                <img
                  src={formData.imageUrl}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                  onError={() => setImagePreviewError(true)}
                />
              ) : (
                <Package className="w-5 h-5 text-slate-300" />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Description / Product Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Additional product details, allergen notes, or packaging notes..."
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
          />
        </div>

      </form>
    </Modal>
  );
}

