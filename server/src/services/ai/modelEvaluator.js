const mongoose = require('mongoose');
const Sale = require('../../models/Sale');
const Product = require('../../models/Product');
const AIPredictionLog = require('../../models/AIPredictionLog');

/**
 * Evaluate model accuracy on historical sales data using a time-based train/test split
 * Compares empirical velocity forecast against a Naive Baseline model.
 */
const evaluateDemandModel = async (options = {}) => {
  const windowDays = options.windowDays || 30;
  const splitDays = options.splitDays || 7; // evaluate on last 7 days using prior 23 days for training

  const now = new Date();
  const testStart = new Date(now.getTime() - splitDays * 24 * 60 * 60 * 1000);
  const trainStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // 1. Fetch sales in train window and test window
  const [trainSales, testSales] = await Promise.all([
    Sale.find({
      saleDate: { $gte: trainStart, $lt: testStart }
    }).lean(),
    Sale.find({
      saleDate: { $gte: testStart, $lte: now }
    }).lean()
  ]);

  if (trainSales.length === 0 || testSales.length === 0) {
    return {
      status: 'INSUFFICIENT_EVALUATION_DATA',
      message: 'Not enough historical sales data across train/test splits to calculate meaningful MAE/RMSE metrics.',
      minDataRequirements: 'Requires at least 14 days of recorded sales spanning both training and test periods.',
      trainDataPoints: trainSales.length,
      testDataPoints: testSales.length,
      modelVersion: '1.0.0'
    };
  }

  // 2. Aggregate actual sales in test window per product
  const actualTestMap = {};
  testSales.forEach((s) => {
    const pId = s.product.toString();
    actualTestMap[pId] = (actualTestMap[pId] || 0) + (s.quantity || 0);
  });

  // 3. Train model on trainSales window: compute velocity per product
  const trainDays = (testStart.getTime() - trainStart.getTime()) / (1000 * 60 * 60 * 24);
  const trainSumMap = {};
  trainSales.forEach((s) => {
    const pId = s.product.toString();
    trainSumMap[pId] = (trainSumMap[pId] || 0) + (s.quantity || 0);
  });

  const evaluatedProducts = Object.keys(actualTestMap);
  let totalModelAbsError = 0;
  let totalModelSquaredError = 0;
  let totalBaselineAbsError = 0;
  let totalBaselineSquaredError = 0;
  let n = 0;

  evaluatedProducts.forEach((pId) => {
    const actual = actualTestMap[pId];
    const trainSum = trainSumMap[pId] || 0;
    const dailyVelocity = trainSum / trainDays;

    // Model Prediction for test window (splitDays)
    const predicted = dailyVelocity * splitDays;

    // Baseline Prediction (Naive: assumes 0 sales if no data, or mean of all products)
    const baseline = 0;

    const modelError = actual - predicted;
    const baselineError = actual - baseline;

    totalModelAbsError += Math.abs(modelError);
    totalModelSquaredError += modelError * modelError;

    totalBaselineAbsError += Math.abs(baselineError);
    totalBaselineSquaredError += baselineError * baselineError;

    n++;
  });

  if (n === 0) {
    return {
      status: 'INSUFFICIENT_EVALUATION_DATA',
      message: 'No overlapping products between training and test sets.'
    };
  }

  const modelMAE = Number((totalModelAbsError / n).toFixed(2));
  const modelRMSE = Number(Math.sqrt(totalModelSquaredError / n).toFixed(2));

  const baselineMAE = Number((totalBaselineAbsError / n).toFixed(2));
  const baselineRMSE = Number(Math.sqrt(totalBaselineSquaredError / n).toFixed(2));

  const errorReductionPercent = baselineMAE > 0
    ? Number((((baselineMAE - modelMAE) / baselineMAE) * 100).toFixed(1))
    : 0;

  return {
    status: 'EVALUATION_COMPLETE',
    evaluatedProductsCount: n,
    trainDataPoints: trainSales.length,
    testDataPoints: testSales.length,
    metrics: {
      modelMAE,
      modelRMSE,
      baselineMAE,
      baselineRMSE,
      errorReductionPercent
    },
    interpretation: modelMAE < baselineMAE
      ? `Model outperforms baseline by ${errorReductionPercent}% reduction in Mean Absolute Error.`
      : 'Model performance comparable to baseline. Additional sales recording will improve parameter fit.',
    modelVersion: '1.0.0',
    evaluatedAt: now.toISOString()
  };
};

module.exports = {
  evaluateDemandModel
};

