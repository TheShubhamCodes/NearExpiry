import axios from 'axios';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const API_BASE_URL = rawApiUrl || '/api';

if (!import.meta.env.DEV && !rawApiUrl) {
  console.error(
    '[NearExpiry Config] VITE_API_URL is not configured for production. Set VITE_API_URL (e.g., https://your-backend.onrender.com/api) in your deployment environment variables.'
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Accommodates cloud cold starts (e.g. Render free tier wakeup)
  withCredentials: true, // Send and receive HTTP-only cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for transparent and environment-aware network errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      error.friendlyMessage = import.meta.env.DEV
        ? 'Request timed out waiting for the local backend server.'
        : 'The server is taking longer than expected to respond (it may be waking up from sleep). Please try again in a few seconds.';
    } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
      error.friendlyMessage = import.meta.env.DEV
        ? 'Unable to connect to the NearExpiry backend server. Please verify that the server is running on port 5000 and MongoDB is connected.'
        : 'Unable to reach the NearExpiry server. Please check your internet connection or wait a moment if the server is waking up.';
    } else if (error.response?.data?.message) {
      error.friendlyMessage = error.response.data.message;
    }
    return Promise.reject(error);
  }
);

// Health check
export const getHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

// Auth & Setup
export const getSetupStatus = async () => {
  const response = await api.get('/auth/setup-status');
  return response.data;
};

export const setupInitialOwner = async (setupData) => {
  const response = await api.post('/auth/setup', setupData);
  return response.data;
};

export const registerOwner = async (registrationData) => {
  const response = await api.post('/auth/setup', registrationData);
  return response.data;
};

export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

// Store Management
export const getStore = async () => {
  const response = await api.get('/store');
  return response.data;
};

export const updateStore = async (storeData) => {
  const response = await api.put('/store', storeData);
  return response.data;
};

// Employee Management (Owner only)
export const getEmployees = async () => {
  const response = await api.get('/employees');
  return response.data;
};

export const createEmployee = async (employeeData) => {
  const response = await api.post('/employees', employeeData);
  return response.data;
};

export const updateEmployee = async (id, employeeData) => {
  const response = await api.put(`/employees/${id}`, employeeData);
  return response.data;
};

export const toggleEmployeeStatus = async (id) => {
  const response = await api.patch(`/employees/${id}/status`);
  return response.data;
};

export const deleteEmployee = async (id) => {
  const response = await api.delete(`/employees/${id}`);
  return response.data;
};

// Product Management
export const getProducts = async (params = {}) => {
  const response = await api.get('/products', { params });
  return response.data;
};

export const getProductById = async (id) => {
  const response = await api.get(`/products/${id}`);
  return response.data;
};

export const createProduct = async (productData) => {
  const response = await api.post('/products', productData);
  return response.data;
};

export const updateProduct = async (id, productData) => {
  const response = await api.put(`/products/${id}`, productData);
  return response.data;
};

export const deleteProduct = async (id) => {
  const response = await api.delete(`/products/${id}`);
  return response.data;
};

export const lookupBarcode = async (barcode) => {
  const response = await api.get(`/products/lookup/${encodeURIComponent(barcode)}`);
  return response.data;
};

export const getProductCategories = async () => {
  const response = await api.get('/products/categories');
  return response.data;
};

export const uploadProductImage = async (imageDataUri) => {
  const response = await api.post('/products/upload-image', { image: imageDataUri }, { timeout: 35000 });
  return response.data;
};

// Inventory & Batch Management (Phase 5)
export const receiveStock = async (batchData) => {
  const response = await api.post('/inventory/receive', batchData);
  return response.data;
};

export const getBatches = async (params = {}) => {
  const response = await api.get('/inventory/batches', { params });
  return response.data;
};

export const getBatchById = async (id) => {
  const response = await api.get(`/inventory/batches/${id}`);
  return response.data;
};

export const updateBatch = async (id, batchData) => {
  const response = await api.put(`/inventory/batches/${id}`, batchData);
  return response.data;
};

export const adjustStock = async (id, adjustmentData) => {
  const response = await api.post(`/inventory/batches/${id}/adjust`, adjustmentData);
  return response.data;
};

export const getProductBatches = async (productId) => {
  const response = await api.get(`/inventory/products/${productId}/batches`);
  return response.data;
};

export const getInventorySummary = async () => {
  const response = await api.get('/inventory/summary');
  return response.data;
};

export const getLowStock = async (threshold = 5) => {
  const response = await api.get('/inventory/low-stock', { params: { threshold } });
  return response.data;
};

export const getStockMovements = async (params = {}) => {
  const response = await api.get('/inventory/movements', { params });
  return response.data;
};

// Expiry & FEFO Management (Phase 6)
export const getExpirySummary = async () => {
  const response = await api.get('/expiry/summary');
  return response.data;
};

export const getExpiryBatches = async (params = {}) => {
  const response = await api.get('/expiry/batches', { params });
  return response.data;
};

export const getFEFORecommendations = async () => {
  const response = await api.get('/expiry/fefo');
  return response.data;
};

export const getExpiryCalendar = async (params = {}) => {
  const response = await api.get('/expiry/calendar', { params });
  return response.data;
};

export const getExpiryRiskAssessment = async () => {
  const response = await api.get('/expiry/risk');
  return response.data;
};

// Notification & Alert Management (Phase 7)
export const getNotifications = async (params = {}) => {
  const response = await api.get('/notifications', { params });
  return response.data;
};

export const getUnreadNotificationCount = async () => {
  const response = await api.get('/notifications/unread-count');
  return response.data;
};

export const markNotificationRead = async (id) => {
  const response = await api.patch(`/notifications/${id}/read`);
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.patch('/notifications/mark-all-read');
  return response.data;
};

export const deleteNotification = async (id) => {
  const response = await api.delete(`/notifications/${id}`);
  return response.data;
};

export const getNotificationPreferences = async () => {
  const response = await api.get('/notifications/preferences');
  return response.data;
};

export const updateNotificationPreferences = async (data) => {
  const response = await api.put('/notifications/preferences', data);
  return response.data;
};

export const triggerManualNotificationCheck = async () => {
  const response = await api.post('/notifications/trigger-check');
  return response.data;
};

export const sendTestNotificationEmail = async () => {
  const response = await api.post('/notifications/test-email');
  return response.data;
};

// --- Action Management (Phase 8) ---
export const getActionsSummary = async () => {
  const response = await api.get('/actions/summary');
  return response.data;
};

export const getMarkdownSuggestions = async () => {
  const response = await api.get('/actions/markdowns/suggestions');
  return response.data;
};

export const getMarkdowns = async (params = {}) => {
  const response = await api.get('/actions/markdowns', { params });
  return response.data;
};

export const createMarkdown = async (markdownData) => {
  const response = await api.post('/actions/markdowns', markdownData);
  return response.data;
};

export const approveMarkdown = async (id) => {
  const response = await api.post(`/actions/markdowns/${id}/approve`);
  return response.data;
};

export const activateMarkdown = async (id) => {
  const response = await api.post(`/actions/markdowns/${id}/activate`);
  return response.data;
};

export const rejectMarkdown = async (id, reason) => {
  const response = await api.post(`/actions/markdowns/${id}/reject`, { reason });
  return response.data;
};

export const cancelMarkdown = async (id, reason) => {
  const response = await api.post(`/actions/markdowns/${id}/cancel`, { reason });
  return response.data;
};

export const completeMarkdown = async (id) => {
  const response = await api.post(`/actions/markdowns/${id}/complete`);
  return response.data;
};

export const getSupplierReturns = async (params = {}) => {
  const response = await api.get('/actions/returns', { params });
  return response.data;
};

export const createSupplierReturn = async (returnData) => {
  const response = await api.post('/actions/returns', returnData);
  return response.data;
};

export const updateSupplierReturnStatus = async (id, updateData) => {
  const response = await api.patch(`/actions/returns/${id}/status`, updateData);
  return response.data;
};

export const getStockDispositions = async (params = {}) => {
  const response = await api.get('/actions/dispositions', { params });
  return response.data;
};

export const quarantineStock = async (quarantineData) => {
  const response = await api.post('/actions/quarantine', quarantineData);
  return response.data;
};

export const disposeStock = async (disposalData) => {
  const response = await api.post('/actions/dispose', disposalData);
  return response.data;
};

export const releaseQuarantineStock = async (id, reason) => {
  const response = await api.post(`/actions/quarantine/${id}/release`, { reason });
  return response.data;
};

// --- Advanced Business Analytics & Reporting (Phase 9) ---
export const getDashboardAnalytics = async (params = {}) => {
  const response = await api.get('/analytics/dashboard', { params });
  return response.data;
};

export const getExpiryDistribution = async () => {
  const response = await api.get('/analytics/expiry-distribution');
  return response.data;
};

export const getCategoryValuation = async () => {
  const response = await api.get('/analytics/category-valuation');
  return response.data;
};

export const getStockAgeing = async () => {
  const response = await api.get('/analytics/stock-ageing');
  return response.data;
};

export const getMovementTrends = async (params = {}) => {
  const response = await api.get('/analytics/movement-trends', { params });
  return response.data;
};

export const getTopExpiryRiskProducts = async (params = {}) => {
  const response = await api.get('/analytics/risk-products', { params });
  return response.data;
};

export const getFEFOCompliance = async () => {
  const response = await api.get('/analytics/fefo-compliance');
  return response.data;
};

export const getReportData = async (reportType, params = {}) => {
  const response = await api.get(`/analytics/reports/${reportType}`, { params });
  return response.data;
};

export const downloadReportCSV = async (reportType, params = {}) => {
  const response = await api.get(`/analytics/reports/${reportType}/export`, {
    params,
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  const filename = `nearexpiry-${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// AI Intelligence & Predictive Analytics (Phase 10)
export const recordRetailSale = async (saleData) => {
  const response = await api.post('/ai/sales', saleData);
  return response.data;
};

export const getSalesHistory = async (params = {}) => {
  const response = await api.get('/ai/sales', { params });
  return response.data;
};

export const getAISummary = async () => {
  const response = await api.get('/ai/summary');
  return response.data;
};

export const getExpiryRiskQueue = async (params = {}) => {
  const response = await api.get('/ai/risk-queue', { params });
  return response.data;
};

export const getBatchRiskPrediction = async (batchId) => {
  const response = await api.get(`/ai/risk-queue/${batchId}`);
  return response.data;
};

export const getIntelligentDiscounts = async (params = {}) => {
  const response = await api.get('/ai/discounts', { params });
  return response.data;
};

export const getBatchDiscountRecommendation = async (batchId) => {
  const response = await api.get(`/ai/discounts/${batchId}`);
  return response.data;
};

export const getDemandForecasts = async (params = {}) => {
  const response = await api.get('/ai/demand', { params });
  return response.data;
};

export const getProductDemandForecast = async (productId, params = {}) => {
  const response = await api.get(`/ai/demand/${productId}`, { params });
  return response.data;
};

export const getAIStoreInsights = async () => {
  const response = await api.get('/ai/insights');
  return response.data;
};

export const getModelEvaluation = async () => {
  const response = await api.get('/ai/evaluation');
  return response.data;
};

export default api;
