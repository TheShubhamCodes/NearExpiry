/**
 * Open Food Facts API Integration Service
 * 
 * Provides automated metadata retrieval for supermarket barcodes.
 * Adheres to Open Food Facts usage policy:
 * - Proper User-Agent identifying the application
 * - Graceful timeout handling (5 seconds)
 * - Safe field extraction and normalization
 */

// Mapping helper to map Open Food Facts categories / tags to NearExpiry standard categories
const mapCategory = (rawCategoryString, categoriesTags = []) => {
  const combined = `${rawCategoryString || ''} ${(categoriesTags || []).join(' ')}`.toLowerCase();

  if (combined.includes('dairy') || combined.includes('milk') || combined.includes('cheese') || combined.includes('yogurt') || combined.includes('egg')) {
    return 'Dairy & Eggs';
  }
  if (combined.includes('bread') || combined.includes('bakery') || combined.includes('cake') || combined.includes('pastr')) {
    return 'Bakery & Bread';
  }
  if (combined.includes('fruit') || combined.includes('vegetable') || combined.includes('produce') || combined.includes('salad')) {
    return 'Fresh Produce';
  }
  if (combined.includes('meat') || combined.includes('chicken') || combined.includes('beef') || combined.includes('pork') || combined.includes('fish') || combined.includes('seafood')) {
    return 'Meat & Seafood';
  }
  if (combined.includes('beverage') || combined.includes('drink') || combined.includes('juice') || combined.includes('soda') || combined.includes('water') || combined.includes('coffee') || combined.includes('tea')) {
    return 'Beverages';
  }
  if (combined.includes('snack') || combined.includes('sweet') || combined.includes('chocolate') || combined.includes('biscuit') || combined.includes('cookie') || combined.includes('chip') || combined.includes('confection')) {
    return 'Snacks & Sweets';
  }
  if (combined.includes('frozen') || combined.includes('ice cream')) {
    return 'Frozen Foods';
  }
  if (combined.includes('cereal') || combined.includes('pasta') || combined.includes('rice') || combined.includes('canned') || combined.includes('sauce') || combined.includes('oil') || combined.includes('spread')) {
    return 'Pantry Staples';
  }
  if (combined.includes('cleaning') || combined.includes('detergent') || combined.includes('paper')) {
    return 'Household & Cleaning';
  }
  if (combined.includes('care') || combined.includes('hygiene') || combined.includes('cosmetic') || combined.includes('soap') || combined.includes('shampoo')) {
    return 'Personal Care';
  }

  // If first tag is available, capitalize nicely
  if (rawCategoryString && rawCategoryString.length > 0) {
    const firstCat = rawCategoryString.split(',')[0].trim();
    if (firstCat && firstCat.length <= 40) {
      return firstCat.charAt(0).toUpperCase() + firstCat.slice(1);
    }
  }

  return 'General';
};

// Helper to deduce unit of measurement from quantity string (e.g. "500 g", "1.5 L", "6 cans")
const deduceUnit = (quantityStr) => {
  if (!quantityStr || typeof quantityStr !== 'string') return 'piece';
  const q = quantityStr.toLowerCase();

  if (q.includes('kg') || q.includes('kilo')) return 'kg';
  if (q.includes('ml')) return 'ml';
  if (q.includes('l') || q.includes('litre') || q.includes('liter')) return 'litre';
  if (q.includes('can')) return 'can';
  if (q.includes('bottle')) return 'bottle';
  if (q.includes('box')) return 'box';
  if (q.includes('pack')) return 'pack';
  if (q.includes('packet')) return 'packet';
  if (q.match(/\b\d+\s*g\b/)) return 'g';
  return 'piece';
};

/**
 * Look up product details by barcode in Open Food Facts
 * @param {string} barcode 
 * @returns {Promise<{ found: boolean, product?: object, message?: string }>}
 */
const lookupBarcode = async (barcode) => {
  if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
    return { found: false, message: 'Valid barcode is required' };
  }

  const cleanBarcode = barcode.trim();
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanBarcode)}.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'NearExpiry - SupermarketInventoryApp/1.0 (contact: support@nearexpiry.local)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, message: 'Product not found in Open Food Facts' };
      }
      return { found: false, message: `Open Food Facts returned HTTP ${response.status}` };
    }

    const data = await response.json();

    // Open Food Facts uses data.status === 1 when the product is found
    if (data.status !== 1 || !data.product) {
      return {
        found: false,
        message: data.status_verbose || 'Product not found in Open Food Facts database'
      };
    }

    const p = data.product;

    // Extract product name
    const name = p.product_name || p.product_name_en || p.generic_name || '';
    if (!name || name.trim().length === 0) {
      return {
        found: false,
        message: 'Product record found in Open Food Facts but has no identifiable name'
      };
    }

    // Extract brand (handle multiple brands separated by commas)
    const brand = p.brands ? p.brands.split(',')[0].trim() : (p.brand_owner || '');

    // Extract image
    const imageUrl = p.image_front_url || p.image_url || p.image_front_small_url || '';

    // Extract category
    const category = mapCategory(p.categories, p.categories_tags);

    // Extract unit
    const unit = deduceUnit(p.quantity);

    // Extract manufacturer / origin
    const manufacturer = p.manufacturing_places || p.brand_owner || p.creator || '';

    // Description or generic name
    const description = p.generic_name || (p.ingredients_text ? `Ingredients: ${p.ingredients_text.slice(0, 200)}...` : '');

    return {
      found: true,
      product: {
        barcode: cleanBarcode,
        name: name.trim(),
        brand: brand.slice(0, 100),
        category,
        unit,
        imageUrl,
        manufacturer: manufacturer.slice(0, 150),
        description: description.slice(0, 500),
        rawQuantity: p.quantity || ''
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return {
        found: false,
        error: 'Open Food Facts request timed out. Please enter details manually.'
      };
    }
    return {
      found: false,
      error: `Network error reaching Open Food Facts: ${error.message}`
    };
  }
};

module.exports = {
  lookupBarcode,
  mapCategory,
  deduceUnit
};

