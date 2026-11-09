const { z } = require('zod');

// Schema for initial owner and store setup
const setupSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(100),
  contactPhone: z.string().trim().optional(),
  currency: z.string().trim().optional().default('USD ($)'),
  address: z.object({
    street: z.string().optional().default(''),
    city: z.string().optional().default(''),
    state: z.string().optional().default(''),
    postalCode: z.string().optional().default(''),
    country: z.string().optional().default('')
  }).optional().default({})
});

// Schema for user login
const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required')
});

// Schema for creating an employee (only owner can invoke this)
const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.literal('employee').optional().default('employee')
});

// Schema for updating an employee
const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100).optional(),
  isActive: z.boolean().optional(),
  role: z.literal('employee').optional() // Employees cannot be promoted to owner
});

// Timezone validation helper
const isValidTimezone = (tz) => {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
};

// Schema for updating store settings
const updateStoreSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(100).optional(),
  contactEmail: z.string().trim().email('Invalid contact email address').toLowerCase().optional(),
  contactPhone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  expiryWarningDays: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().int('Expiry warning days must be an integer').min(0, 'Expiry warning days cannot be negative').optional()
  ),
  expiryCriticalDays: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().int('Expiry critical days must be an integer').min(0, 'Expiry critical days cannot be negative').optional()
  ),
  lowStockThreshold: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().int('Low stock threshold must be an integer').min(0, 'Low stock threshold cannot be negative').optional()
  ),
  timezone: z.string().trim().refine(isValidTimezone, 'Invalid IANA timezone identifier').optional(),
  notificationSettings: z.object({
    inAppEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    dailyDigestEnabled: z.boolean().optional(),
    dailyDigestTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').optional(),
    notifyExpiryWarning: z.boolean().optional(),
    notifyExpiryCritical: z.boolean().optional(),
    notifyExpiringToday: z.boolean().optional(),
    notifyExpired: z.boolean().optional(),
    notifyLowStock: z.boolean().optional(),
    notifyBatchDepleted: z.boolean().optional()
  }).optional(),
  markdownRules: z.object({
    warningDiscountPercent: z.preprocess((v) => (v !== undefined && v !== '' ? Number(v) : undefined), z.number().min(1).max(99).optional()),
    criticalDiscountPercent: z.preprocess((v) => (v !== undefined && v !== '' ? Number(v) : undefined), z.number().min(1).max(99).optional()),
    todayDiscountPercent: z.preprocess((v) => (v !== undefined && v !== '' ? Number(v) : undefined), z.number().min(1).max(99).optional()),
    autoSuggestEnabled: z.boolean().optional()
  }).optional()
}).refine(
  (data) => {
    if (data.expiryCriticalDays !== undefined && data.expiryWarningDays !== undefined) {
      return data.expiryCriticalDays <= data.expiryWarningDays;
    }
    return true;
  },
  {
    message: 'Expiry critical days cannot exceed expiry warning days',
    path: ['expiryCriticalDays']
  }
);

// Product unit enum values
const productUnits = [
  'piece',
  'kg',
  'g',
  'litre',
  'ml',
  'packet',
  'box',
  'can',
  'bottle',
  'bundle',
  'pack'
];

// Helper to sanitize/normalize barcode (empty string becomes null)
const sanitizeBarcode = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

// Helper to validate safe HTTP/HTTPS image URLs
const isValidImageUrl = (val) => {
  if (!val || val === '') return true;
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Schema for creating a product
const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters').max(200, 'Product name cannot exceed 200 characters'),
  brand: z.string().trim().max(100, 'Brand name cannot exceed 100 characters').optional().default(''),
  barcode: z.preprocess(
    sanitizeBarcode,
    z.string().min(3, 'Barcode must be at least 3 characters').max(50, 'Barcode cannot exceed 50 characters').nullable().optional()
  ),
  category: z.string().trim().min(1, 'Category is required').max(100, 'Category cannot exceed 100 characters').default('General'),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').optional().default(''),
  imageUrl: z.string().trim().max(1000).refine(isValidImageUrl, 'Image URL must start with http:// or https://').optional().default(''),
  unit: z.enum(productUnits, {
    errorMap: () => ({ message: `Unit must be one of: ${productUnits.join(', ')}` })
  }).default('piece'),
  manufacturer: z.string().trim().max(150, 'Manufacturer cannot exceed 150 characters').optional().default(''),
  reorderPoint: z.preprocess(
    (v) => (v !== undefined && v !== '' && v !== null ? Number(v) : null),
    z.number().min(0, 'Reorder point cannot be negative').nullable().optional()
  )
});

// Schema for updating a product
const updateProductSchema = z.object({
  name: z.string().trim().min(2, 'Product name must be at least 2 characters').max(200, 'Product name cannot exceed 200 characters').optional(),
  brand: z.string().trim().max(100, 'Brand name cannot exceed 100 characters').optional(),
  barcode: z.preprocess(
    sanitizeBarcode,
    z.string().min(3, 'Barcode must be at least 3 characters').max(50, 'Barcode cannot exceed 50 characters').nullable().optional()
  ),
  category: z.string().trim().min(1, 'Category is required').max(100, 'Category cannot exceed 100 characters').optional(),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').optional(),
  imageUrl: z.string().trim().max(1000).refine(isValidImageUrl, 'Image URL must start with http:// or https://').optional(),
  unit: z.enum(productUnits, {
    errorMap: () => ({ message: `Unit must be one of: ${productUnits.join(', ')}` })
  }).optional(),
  manufacturer: z.string().trim().max(150, 'Manufacturer cannot exceed 150 characters').optional(),
  reorderPoint: z.preprocess(
    (v) => (v !== undefined && v !== '' && v !== null ? Number(v) : null),
    z.number().min(0, 'Reorder point cannot be negative').nullable().optional()
  )
});

// Schema for product query / pagination
const productQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  page: z.preprocess((val) => (val ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 10), z.number().int().min(1).max(100).default(10)),
  sortBy: z.enum(['name', 'createdAt', 'category', 'brand']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

// --- Phase 5: Inventory Batch & Stock Validation Schemas ---

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Schema for receiving stock and creating a batch
const createBatchSchema = z.object({
  productId: z.string().trim().regex(objectIdRegex, 'Valid Product ID is required'),
  batchNumber: z.string().trim().max(100).optional().default(''),
  quantityReceived: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number({ required_error: 'Quantity received is required' }).positive('Quantity received must be greater than 0')
  ),
  purchasePrice: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number({ required_error: 'Purchase price is required' }).min(0, 'Purchase price cannot be negative')
  ),
  sellingPrice: z.preprocess(
    (v) => (v !== undefined && v !== '' && v !== null ? Number(v) : null),
    z.number().min(0, 'Selling price cannot be negative').nullable().optional()
  ),
  manufacturingDate: z.preprocess(
    (v) => (v && typeof v === 'string' && v.trim() ? new Date(v.trim()) : null),
    z.date().nullable().optional()
  ),
  expiryDate: z.preprocess(
    (v) => (v && typeof v === 'string' && v.trim() ? new Date(v.trim()) : v),
    z.date({ required_error: 'Valid expiry date is required' })
  ),
  receivedDate: z.preprocess(
    (v) => (v && typeof v === 'string' && v.trim() ? new Date(v.trim()) : undefined),
    z.date().optional()
  ),
  supplierName: z.string().trim().max(150).optional().default(''),
  supplierInvoiceNumber: z.string().trim().max(100).optional().default(''),
  notes: z.string().trim().max(1000).optional().default('')
}).refine(
  (data) => {
    if (data.manufacturingDate && data.expiryDate) {
      return data.expiryDate >= data.manufacturingDate;
    }
    return true;
  },
  {
    message: 'Expiry date cannot be earlier than manufacturing date',
    path: ['expiryDate']
  }
);

// Schema for updating batch details (does not directly modify currentQuantity)
const updateBatchSchema = z.object({
  batchNumber: z.string().trim().max(100).optional(),
  purchasePrice: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().min(0, 'Purchase price cannot be negative').optional()
  ),
  sellingPrice: z.preprocess(
    (v) => (v !== undefined && v !== '' && v !== null ? Number(v) : null),
    z.number().min(0, 'Selling price cannot be negative').nullable().optional()
  ),
  manufacturingDate: z.preprocess(
    (v) => (v && typeof v === 'string' && v.trim() ? new Date(v.trim()) : null),
    z.date().nullable().optional()
  ),
  expiryDate: z.preprocess(
    (v) => (v && typeof v === 'string' && v.trim() ? new Date(v.trim()) : undefined),
    z.date().optional()
  ),
  supplierName: z.string().trim().max(150).optional(),
  supplierInvoiceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional()
}).refine(
  (data) => {
    if (data.manufacturingDate && data.expiryDate) {
      return data.expiryDate >= data.manufacturingDate;
    }
    return true;
  },
  {
    message: 'Expiry date cannot be earlier than manufacturing date',
    path: ['expiryDate']
  }
);

// Schema for stock adjustments
const adjustStockSchema = z.object({
  adjustmentType: z.enum([
    'STOCK_ADJUSTED_INCREASE',
    'STOCK_ADJUSTED_DECREASE',
    'STOCK_DAMAGED',
    'STOCK_EXPIRED'
  ]).optional(),
  quantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().positive('Adjustment quantity must be greater than 0').optional()
  ),
  newQuantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().min(0, 'New stock quantity cannot be negative').optional()
  ),
  reason: z.string().trim().min(2, 'A detailed reason is required for stock adjustments').max(500)
}).refine(
  (data) => data.newQuantity !== undefined || (data.adjustmentType !== undefined && data.quantity !== undefined),
  {
    message: 'You must provide either newQuantity or both adjustmentType and quantity',
    path: ['quantity']
  }
);

// Schema for listing batches query
const batchQuerySchema = z.object({
  product: z.string().trim().optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: z.enum(['all', 'active', 'lowStock', 'expired', 'depleted', 'expiringSoon']).optional().default('all'),
  page: z.preprocess((val) => (val ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 10), z.number().int().min(1).max(100).default(10)),
  sortBy: z.enum(['expiryDate', 'createdAt', 'currentQuantity', 'batchNumber', 'purchasePrice']).optional().default('expiryDate'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc')
});

// --- Phase 7: Notification Validation Schemas ---
const notificationQuerySchema = z.object({
  isRead: z.preprocess((val) => (val === 'true' ? true : val === 'false' ? false : undefined), z.boolean().optional()),
  type: z.enum([
    'ALL',
    'EXPIRY_WARNING',
    'EXPIRY_CRITICAL',
    'EXPIRING_TODAY',
    'EXPIRED',
    'LOW_STOCK',
    'BATCH_DEPLETED',
    'STOCK_ADJUSTMENT',
    'DAILY_DIGEST',
    'AI_HIGH_EXPIRY_RISK',
    'AI_STOCKOUT_WARNING',
    'AI_REORDER_RECOMMENDED',
    'AI_INVENTORY_ANOMALY'
  ]).optional().default('ALL'),
  severity: z.enum(['ALL', 'info', 'warning', 'critical', 'danger']).optional().default('ALL'),
  page: z.preprocess((val) => (val ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 20), z.number().int().min(1).max(100).default(20))
});

const updateNotificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  browserNotificationsEnabled: z.boolean().optional(),
  notifyExpiryWarning: z.boolean().optional(),
  notifyExpiryCritical: z.boolean().optional(),
  notifyExpiringToday: z.boolean().optional(),
  notifyExpired: z.boolean().optional(),
  notifyLowStock: z.boolean().optional(),
  notifyBatchDepleted: z.boolean().optional()
});

// --- Phase 8: Action Management Validation Schemas ---
const createMarkdownSchema = z.object({
  batchId: z.string().trim().min(1, 'Batch ID is required'),
  discountPercent: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().min(1, 'Discount percent must be at least 1%').max(99, 'Discount percent cannot exceed 99%')
  ),
  reason: z.string().trim().max(500).optional()
});

const rejectMarkdownSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

const cancelMarkdownSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

const createSupplierReturnSchema = z.object({
  productId: z.string().trim().min(1, 'Product ID is required'),
  batchId: z.string().trim().min(1, 'Batch ID is required'),
  supplierName: z.string().trim().min(2, 'Supplier name is required').max(100),
  supplierContact: z.string().trim().max(200).optional(),
  quantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().positive('Quantity must be greater than 0')
  ),
  reason: z.enum(['NEAR_EXPIRY', 'EXPIRED', 'DAMAGED', 'DEFECTIVE', 'RECALLED', 'OVERSTOCK', 'OTHER']).default('NEAR_EXPIRY'),
  reasonDetails: z.string().trim().max(500).optional(),
  resolutionExpected: z.enum(['REPLACEMENT', 'CREDIT_NOTE', 'REFUND', 'DISPOSAL_APPROVAL', 'OTHER']).default('REPLACEMENT'),
  followUpDate: z.preprocess((val) => (val ? new Date(val) : undefined), z.date().optional()),
  notes: z.string().trim().max(1000).optional()
});

const updateSupplierReturnStatusSchema = z.object({
  status: z.enum(['DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'REPLACEMENT_RECEIVED', 'REFUNDED', 'CLOSED']),
  resolutionNotes: z.string().trim().max(1000).optional(),
  followUpDate: z.preprocess((val) => (val ? new Date(val) : undefined), z.date().optional()),
  replacementBatchId: z.string().trim().optional(),
  refundAmount: z.preprocess((v) => (v !== undefined && v !== '' ? Number(v) : undefined), z.number().min(0).optional()),
  creditNoteNumber: z.string().trim().max(100).optional()
});

const quarantineStockSchema = z.object({
  batchId: z.string().trim().min(1, 'Batch ID is required'),
  quantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().positive('Quantity must be greater than 0')
  ),
  reason: z.string().trim().min(2, 'Quarantine reason is required').max(500),
  notes: z.string().trim().max(1000).optional()
});

const disposeStockSchema = z.object({
  dispositionId: z.string().trim().optional(),
  batchId: z.string().trim().optional(),
  quantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().positive('Disposal quantity must be greater than 0').optional()
  ),
  disposalMethod: z.enum(['DISPOSED_TRASH', 'DESTROYED', 'DONATED', 'RETURNED_TO_MANUFACTURER', 'RECYCLED', 'OTHER']).default('DISPOSED_TRASH'),
  reason: z.string().trim().min(2, 'Disposal reason is required').max(500),
  witness: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional()
}).refine(
  (data) => data.dispositionId || (data.batchId && data.quantity !== undefined),
  {
    message: 'Must provide either an existing dispositionId or both batchId and quantity',
    path: ['dispositionId']
  }
);

const releaseQuarantineSchema = z.object({
  reason: z.string().trim().min(2, 'Release reason is required').max(500)
});

// --- Phase 9: Analytics & Reporting Validation Schemas ---
const dashboardQuerySchema = z.object({
  period: z.enum(['today', '7days', '30days', 'thisMonth', 'lastMonth', 'custom']).optional().default('30days'),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

const reportQuerySchema = z.object({
  period: z.enum(['today', '7days', '30days', 'thisMonth', 'lastMonth', 'custom']).optional().default('30days'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().trim().optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.preprocess((val) => (val ? parseInt(val, 10) : 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 50), z.number().int().min(1).max(500).default(50))
});

// --- Phase 10: AI & Predictive Analytics Validation Schemas ---
const recordSaleSchema = z.object({
  batchId: z.string().trim().min(1, 'Batch ID is required'),
  quantity: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().positive('Sale quantity must be greater than 0')
  ),
  unitPrice: z.preprocess(
    (v) => (v !== undefined && v !== '' ? Number(v) : undefined),
    z.number().min(0, 'Unit price cannot be negative').optional()
  ),
  notes: z.string().trim().max(500).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  saleDate: z.preprocess((val) => (val ? new Date(val) : undefined), z.date().optional())
});

const riskQueueQuerySchema = z.object({
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 20), z.number().int().min(1).max(100).default(20)),
  minRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).optional().default('MEDIUM')
});

const forecastQuerySchema = z.object({
  filter: z.enum(['ALL', 'REORDER_NEEDED', 'STOCKOUT_RISK']).optional().default('ALL'),
  limit: z.preprocess((val) => (val ? parseInt(val, 10) : 25), z.number().int().min(1).max(100).default(25)),
  horizonDays: z.preprocess((val) => (val ? parseInt(val, 10) : 14), z.number().int().min(1).max(90).default(14))
});

module.exports = {
  setupSchema,
  loginSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  updateStoreSchema,
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  productUnits,
  createBatchSchema,
  updateBatchSchema,
  adjustStockSchema,
  batchQuerySchema,
  notificationQuerySchema,
  updateNotificationPreferencesSchema,
  createMarkdownSchema,
  rejectMarkdownSchema,
  cancelMarkdownSchema,
  createSupplierReturnSchema,
  updateSupplierReturnStatusSchema,
  quarantineStockSchema,
  disposeStockSchema,
  releaseQuarantineSchema,
  dashboardQuerySchema,
  reportQuerySchema,
  recordSaleSchema,
  riskQueueQuerySchema,
  forecastQuerySchema
};
