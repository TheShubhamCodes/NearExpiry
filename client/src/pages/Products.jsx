import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, 
  PlusCircle, 
  Search, 
  Filter, 
  ScanLine, 
  Layers, 
  Eye, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Table, { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { SkeletonTable } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { 
  getProducts, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  lookupBarcode,
  getProductCategories 
} from '../services/api';

import BarcodeScannerModal from '../components/products/BarcodeScannerModal';
import ProductFormModal from '../components/products/ProductFormModal';
import ProductDetailModal from '../components/products/ProductDetailModal';
import DeleteConfirmModal from '../components/products/DeleteConfirmModal';
import ReceiveStockModal from '../components/inventory/ReceiveStockModal';

export default function Products() {
  const { showToast } = useToast();

  // Data states
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });

  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialData, setFormInitialData] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isReceiveStockOpen, setIsReceiveStockOpen] = useState(false);

  // Load products list
  const fetchProducts = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getProducts({
        search: searchTerm,
        category: categoryFilter,
        page,
        limit: pagination.limit
      });

      if (response && response.data) {
        setProducts(response.data.products || []);
        setPagination({
          page: response.data.pagination.page,
          limit: response.data.pagination.limit,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to load products';
      setError(msg);
      showToast({
        title: 'Product Catalog Error',
        message: msg,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, categoryFilter, pagination.limit, showToast]);

  // Load distinct categories
  const fetchCategories = async () => {
    try {
      const response = await getProductCategories();
      if (response?.data?.categories) {
        setCategories(['All', ...response.data.categories]);
      }
    } catch (err) {
      console.warn('Failed to fetch categories:', err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Debounced search / filter trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, categoryFilter]);

  // Handle barcode detected from Camera Scanner Modal
  const handleBarcodeDetected = async (barcode) => {
    setIsScannerOpen(false);

    showToast({
      title: 'Barcode Captured',
      message: `Looking up barcode: ${barcode}...`,
      type: 'info'
    });

    try {
      const response = await lookupBarcode(barcode);
      const data = response.data;

      // 1. If exists in local store, open Product Detail Modal
      if (data.source === 'local' && data.product) {
        setSelectedProduct(data.product);
        setIsDetailOpen(true);
        showToast({
          title: 'Existing Product Found',
          message: `Loaded "${data.product.name}" from your store catalog.`,
          type: 'success'
        });
      }
      // 2. If found in Open Food Facts, open Form Modal with pre-filled details
      else if (data.source === 'openfoodfacts' && data.product) {
        setFormInitialData({
          name: data.product.name,
          brand: data.product.brand || '',
          barcode: data.product.barcode,
          category: data.product.category || 'General',
          unit: data.product.unit || 'piece',
          imageUrl: data.product.imageUrl || '',
          manufacturer: data.product.manufacturer || '',
          description: data.product.description || ''
        });
        setIsFormOpen(true);
        showToast({
          title: 'Product Found in Open Food Facts',
          message: `Pre-filled data for "${data.product.name}". Review and save.`,
          type: 'success'
        });
      }
      // 3. Not found, open blank Form Modal with barcode set
      else {
        setFormInitialData({
          name: '',
          brand: '',
          barcode,
          category: 'General',
          unit: 'piece',
          imageUrl: '',
          manufacturer: '',
          description: ''
        });
        setIsFormOpen(true);
        showToast({
          title: 'New Barcode Scanned',
          message: 'Barcode not in Open Food Facts. Please enter details manually.',
          type: 'info'
        });
      }
    } catch (err) {
      // Fallback: open form with scanned barcode
      setFormInitialData({ barcode });
      setIsFormOpen(true);
    }
  };

  // Create or Update submission
  const handleFormSubmit = async (formData) => {
    if (formInitialData && formInitialData._id) {
      // Update
      await updateProduct(formInitialData._id, formData);
      showToast({
        title: 'Product Updated',
        message: `"${formData.name}" was updated successfully.`,
        type: 'success'
      });
    } else {
      // Create
      await createProduct(formData);
      showToast({
        title: 'Product Created',
        message: `"${formData.name}" has been registered in the catalog.`,
        type: 'success'
      });
    }
    fetchProducts(pagination.page);
    fetchCategories();
  };

  // Open Edit modal from Details modal or Table action
  const handleOpenEdit = (product) => {
    setIsDetailOpen(false);
    setFormInitialData(product);
    setIsFormOpen(true);
  };

  // Open Delete confirmation
  const handleOpenDelete = (product) => {
    setIsDetailOpen(false);
    setProductToDelete(product);
    setIsDeleteOpen(true);
  };

  // Confirm product deletion
  const handleConfirmDelete = async (productId) => {
    try {
      await deleteProduct(productId);
      showToast({
        title: 'Product Deleted',
        message: 'Product SKU removed from store catalog.',
        type: 'success'
      });
      fetchProducts(pagination.page);
    } catch (err) {
      showToast({
        title: 'Deletion Failed',
        message: err.response?.data?.message || 'Could not delete product.',
        type: 'error'
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Package className="w-6 h-6 text-emerald-600" />
            <span>Product Catalog</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Maintain your supermarket's master item registry, SKU definitions, and category groupings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Scan Barcode Button */}
          <Button
            variant="secondary"
            size="sm"
            icon={ScanLine}
            onClick={() => setIsScannerOpen(true)}
            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          >
            Scan Barcode
          </Button>

          {/* Add Product Button */}
          <Button
            variant="primary"
            size="sm"
            icon={PlusCircle}
            onClick={() => {
              setFormInitialData(null);
              setIsFormOpen(true);
            }}
          >
            Add Product
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                placeholder="Search products by title, barcode, or brand..."
                icon={Search}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={categories.map(c => ({
                  value: c,
                  label: c === 'All' ? 'All Categories' : c
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Area / Empty State / Loading */}
      {isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <p className="font-semibold text-sm">{error}</p>
          <Button size="sm" variant="secondary" onClick={() => fetchProducts(1)}>
            Retry Connection
          </Button>
        </div>
      ) : products.length === 0 ? (
        <div className="space-y-3">
          <Card>
            <CardContent className="py-16 text-center">
              <EmptyState
                icon={Package}
                title={
                  searchTerm || categoryFilter !== 'All'
                    ? 'No Matching Products Found'
                    : 'No Products Registered'
                }
                description={
                  searchTerm || categoryFilter !== 'All'
                    ? 'Try adjusting your search criteria or clearing active category filters.'
                    : 'Your supermarket catalog currently has 0 items. Start logging your inventory by creating the first product record.'
                }
                actionLabel={
                  searchTerm || categoryFilter !== 'All'
                    ? 'Clear Filters'
                    : 'Register First Product'
                }
                actionIcon={searchTerm || categoryFilter !== 'All' ? RefreshCw : PlusCircle}
                onAction={() => {
                  if (searchTerm || categoryFilter !== 'All') {
                    setSearchTerm('');
                    setCategoryFilter('All');
                  } else {
                    setFormInitialData(null);
                    setIsFormOpen(true);
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow hover={false}>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Brand / Mfr</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product._id} className="group">
                  
                  {/* Product Name & Thumbnail */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsDetailOpen(true);
                          }}
                          className="font-bold text-slate-900 hover:text-emerald-700 text-left transition-colors text-sm line-clamp-1"
                        >
                          {product.name}
                        </button>
                        <p className="text-[11px] text-slate-400">
                          Added {new Date(product.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Barcode */}
                  <TableCell>
                    {product.barcode ? (
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200">
                        {product.barcode}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No barcode</span>
                    )}
                  </TableCell>

                  {/* Category */}
                  <TableCell>
                    <Badge variant="fresh" size="sm">
                      {product.category}
                    </Badge>
                  </TableCell>

                  {/* Unit */}
                  <TableCell>
                    <span className="text-xs font-medium text-slate-600 capitalize">
                      {product.unit}
                    </span>
                  </TableCell>

                  {/* Brand / Manufacturer */}
                  <TableCell>
                    <div className="text-xs text-slate-700">
                      <p className="font-medium">{product.brand || '—'}</p>
                      {product.manufacturer && (
                        <p className="text-[10px] text-slate-400 line-clamp-1">{product.manufacturer}</p>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsDetailOpen(true);
                        }}
                        title="View details"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Edit3}
                        onClick={() => handleOpenEdit(product)}
                        title="Edit product"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => handleOpenDelete(product)}
                        className="text-rose-600 hover:bg-rose-50"
                        title="Delete product"
                      />
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 px-2 pt-2">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-800">
                {products.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}
              </span>
              {' '}-{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>
              {' '}of{' '}
              <span className="font-semibold text-slate-800">{pagination.total}</span> products
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={ChevronLeft}
                disabled={pagination.page <= 1}
                onClick={() => fetchProducts(pagination.page - 1)}
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
                onClick={() => fetchProducts(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      {/* 2. Product Form Modal (Create & Edit) */}
      <ProductFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setFormInitialData(null);
        }}
        onSubmit={handleFormSubmit}
        onOpenScanner={() => {
          setIsFormOpen(false);
          setIsScannerOpen(true);
        }}
        initialData={formInitialData}
        onViewExistingProduct={(prod) => {
          setIsFormOpen(false);
          setSelectedProduct(prod);
          setIsDetailOpen(true);
        }}
      />

      {/* 3. Product Detail Modal */}
      <ProductDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        onEdit={handleOpenEdit}
        onDelete={handleOpenDelete}
        onReceiveStock={(prod) => {
          setSelectedProduct(prod);
          setIsReceiveStockOpen(true);
        }}
      />

      {/* 4. Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setProductToDelete(null);
        }}
        product={productToDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* 5. Quick Receive Stock Modal from Product Inspection */}
      <ReceiveStockModal
        isOpen={isReceiveStockOpen}
        onClose={() => setIsReceiveStockOpen(false)}
        preselectedProduct={selectedProduct}
        onSuccess={(msg) => {
          showToast({
            title: 'Stock Received',
            message: msg,
            type: 'success'
          });
        }}
      />

    </div>
  );
}
