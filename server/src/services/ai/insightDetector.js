const mongoose = require('mongoose');
const Product = require('../../models/Product');
const InventoryBatch = require('../../models/InventoryBatch');
const StockMovement = require('../../models/StockMovement');
const StockDisposition = require('../../models/StockDisposition');
const Markdown = require('../../models/Markdown');
const Sale = require('../../models/Sale');
const Store = require('../../models/Store');

/**
 * Run statistical & anomaly detection across store history to discover actionable patterns
 */
const detectStoreInsights = async () => {
  const store = await Store.getStore();
  const currencySymbol = store?.currency?.split(' ')?.[0] || '$';
  const now = new Date();
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const insights = [];

  // 1. RECURRING EXPIRY CULPRITS
  // Products that have repeated write-offs or expired batches
  const expiredBatches = await InventoryBatch.find({
    expiryDate: { $lt: now }
  }).populate('product').lean();

  const productExpiryMap = {};
  expiredBatches.forEach((b) => {
    if (!b.product) return;
    const pId = b.product._id.toString();
    if (!productExpiryMap[pId]) {
      productExpiryMap[pId] = {
        product: b.product,
        count: 0,
        totalQuantity: 0,
        totalLoss: 0
      };
    }
    productExpiryMap[pId].count++;
    productExpiryMap[pId].totalQuantity += (b.currentQuantity || 0);
    productExpiryMap[pId].totalLoss += (b.currentQuantity || 0) * (b.purchasePrice || 0);
  });

  Object.values(productExpiryMap).forEach((item) => {
    if (item.count >= 2 || item.totalLoss >= 25) {
      insights.push({
        type: 'RECURRING_EXPIRY_CULPRIT',
        severity: item.totalLoss >= 50 ? 'CRITICAL' : 'WARNING',
        title: `Recurring Expiry Wastage: ${item.product.name}`,
        message: `${item.product.name} has had ${item.count} expired batches totaling ${item.totalQuantity} units (${currencySymbol}${item.totalLoss.toFixed(2)} cost loss).`,
        recommendation: 'Reduce purchase order batch sizes or negotiate shorter replenishment cycles with the vendor.',
        evidence: `${item.count} expired batches recorded in database.`,
        relatedProduct: item.product._id
      });
    }
  });

  // 2. HIGH-LOSS CATEGORIES
  const disposals = await StockDisposition.find({
    status: { $in: ['DISPOSED', 'WRITTEN_OFF'] }
  }).populate('product').lean();

  const categoryLossMap = {};
  let totalDisposalLoss = 0;

  disposals.forEach((d) => {
    const cat = d.product?.category || 'General';
    const loss = d.costLoss || 0;
    categoryLossMap[cat] = (categoryLossMap[cat] || 0) + loss;
    totalDisposalLoss += loss;
  });

  if (totalDisposalLoss > 0) {
    Object.entries(categoryLossMap).forEach(([cat, loss]) => {
      const share = (loss / totalDisposalLoss) * 100;
      if (share >= 40 && loss >= 20) {
        insights.push({
          type: 'HIGH_LOSS_CATEGORY',
          severity: 'WARNING',
          title: `Category Wastage Concentration: ${cat}`,
          message: `The ${cat} department accounts for ${share.toFixed(1)}% of total store disposal write-offs (${currencySymbol}${loss.toFixed(2)} out of ${currencySymbol}${totalDisposalLoss.toFixed(2)}).`,
          recommendation: `Conduct a department shelf audit in ${cat} and tighten reorder points to reduce overstocking.`,
          evidence: `${currencySymbol}${loss.toFixed(2)} disposal losses logged across ${disposals.length} events.`
        });
      }
    });
  }

  // 3. VELOCITY ANOMALY: STAGNANT STOCK
  // Products with current inventory > 10 units but 0 sales over last 14 days
  const activeBatches = await InventoryBatch.find({
    isQuarantined: false,
    currentQuantity: { $gte: 10 }
  }).populate('product').lean();

  const day14Ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const checkedProductIds = new Set();

  for (const b of activeBatches) {
    if (!b.product || checkedProductIds.has(b.product._id.toString())) continue;
    checkedProductIds.add(b.product._id.toString());

    const recentSales = await Sale.countDocuments({
      product: b.product._id,
      saleDate: { $gte: day14Ago }
    });

    if (recentSales === 0) {
      insights.push({
        type: 'STAGNANT_STOCK_ANOMALY',
        severity: 'INFO',
        title: `Stagnant Inventory Detected: ${b.product.name}`,
        message: `${b.product.name} currently holds ${b.currentQuantity} units in stock with 0 recorded retail sales over the past 14 days.`,
        recommendation: 'Evaluate end-cap promotional placement or introduce a multi-buy offer to kickstart velocity.',
        evidence: `0 sales logged between ${day14Ago.toISOString().slice(0, 10)} and ${now.toISOString().slice(0, 10)}.`,
        relatedProduct: b.product._id,
        relatedBatch: b._id
      });
    }
  }

  // 4. FEFO ROTATION OPPORTUNITY
  // Check recent movements where earlier expiring batch was skipped
  const auditMovements = await StockMovement.find({
    movementType: { $in: ['STOCK_SOLD', 'STOCK_ADJUSTED_DECREASE', 'STOCK_DAMAGED'] }
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('batch product')
    .lean();

  for (const m of auditMovements) {
    if (!m.batch || !m.product) continue;

    const earlierBatch = await InventoryBatch.findOne({
      product: m.product._id,
      _id: { $ne: m.batch._id },
      expiryDate: { $lt: m.batch.expiryDate },
      createdAt: { $lte: m.createdAt },
      currentQuantity: { $gt: 0 }
    }).lean();

    if (earlierBatch) {
      insights.push({
        type: 'FEFO_ROTATION_OPPORTUNITY',
        severity: 'WARNING',
        title: `FEFO Picking Deviation: ${m.product.name}`,
        message: `Batch #${m.batch.batchNumber || 'Primary'} was dispatched while Batch #${earlierBatch.batchNumber || 'Earlier'} had an earlier expiry date and was still in stock.`,
        recommendation: 'Train floor staff to pull stock from the front using the FEFO picking queue.',
        evidence: `Movement logged at ${new Date(m.createdAt).toLocaleDateString()} for batch #${m.batch.batchNumber || 'Primary'}.`,
        relatedProduct: m.product._id
      });
      break; // Report 1 clear instance
    }
  }

  return {
    insights,
    totalInsights: insights.length,
    generatedAt: now.toISOString()
  };
};

module.exports = {
  detectStoreInsights
};

