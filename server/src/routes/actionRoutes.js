const express = require('express');
const {
  getSummary,
  getMarkdownSuggestions,
  getMarkdowns,
  createMarkdown,
  approveMarkdown,
  activateMarkdown,
  rejectMarkdown,
  cancelMarkdown,
  completeMarkdown,
  getSupplierReturns,
  createSupplierReturn,
  updateSupplierReturnStatus,
  getStockDispositions,
  quarantineStock,
  disposeStock,
  releaseQuarantineStock
} = require('../controllers/actionController');
const { authenticate, requireOwner } = require('../middleware/authMiddleware');

const router = express.Router();

// All action routes require authenticated user
router.use(authenticate);

// Action dashboard summary & KPIs
router.get('/summary', getSummary);

// --- Markdown routes ---
router.get('/markdowns/suggestions', getMarkdownSuggestions);
router.get('/markdowns', getMarkdowns);
router.post('/markdowns', createMarkdown);
router.post('/markdowns/:id/approve', requireOwner, approveMarkdown);
router.post('/markdowns/:id/activate', requireOwner, activateMarkdown);
router.post('/markdowns/:id/reject', requireOwner, rejectMarkdown);
router.post('/markdowns/:id/cancel', cancelMarkdown);
router.post('/markdowns/:id/complete', completeMarkdown);

// --- Supplier Return routes ---
router.get('/returns', getSupplierReturns);
router.post('/returns', createSupplierReturn);
router.patch('/returns/:id/status', updateSupplierReturnStatus);

// --- Stock Disposition (Quarantine & Disposal) routes ---
router.get('/dispositions', getStockDispositions);
router.post('/quarantine', quarantineStock);
router.post('/dispose', disposeStock);
router.post('/quarantine/:id/release', releaseQuarantineStock);

module.exports = router;

