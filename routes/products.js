const express = require('express');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

/**
 * @route   GET /api/products
 * @desc    Get all products with filtering and pagination
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      sortBy = 'created_at', 
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      location,
      vendor_id
    } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          city,
          state,
          country,
          approved,
          verified
        )
      `, { count: 'exact' })
      .eq('status', 'active')
      .eq('vendor.approved', true)
      .eq('vendor.verified', true)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (minPrice) {
      query = query.gte('price', parseFloat(minPrice));
    }

    if (maxPrice) {
      query = query.lte('price', parseFloat(maxPrice));
    }

    if (location) {
      query = query.or(`vendor.city.ilike.%${location}%,vendor.state.ilike.%${location}%,vendor.country.ilike.%${location}%`);
    }

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch products'
        }
      });
    }

    res.json({
      success: true,
      data: {
        products: products || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/products/vendors
 * @desc    Get all approved and verified vendors
 * @access  Public
 */
router.get('/vendors', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact' })
      .eq('approved', true)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply search filter
    if (search) {
      query = query.or(`business_name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: vendors, error, count } = await query;

    if (error) {
      console.error('Error fetching vendors:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch vendors'
        }
      });
    }

    res.json({
      success: true,
      data: {
        vendors: vendors || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error in /vendors route:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/products/vendors/:vendorId
 * @desc    Get vendor details by ID
 * @access  Public
 */
router.get('/vendors/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .eq('approved', true)
      .eq('verified', true)
      .single();

    if (error) {
      console.error('Error fetching vendor:', error);
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        vendor
      }
    });
  } catch (error) {
    console.error('Error in /vendors/:vendorId route:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/products/featured
 * @desc    Get featured products
 * @access  Public
 */
router.get('/featured', async (req, res) => {
  try {
    const { limit = 12, location } = req.query;

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          city,
          state,
          country,
          approved,
          verified
        )
      `)
      .eq('status', 'active')
      .eq('vendor.approved', true)
      .eq('vendor.verified', true)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (location) {
      query = query.or(`vendor.city.ilike.%${location}%,vendor.state.ilike.%${location}%,vendor.country.ilike.%${location}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error('Error fetching featured products:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch featured products'
        }
      });
    }

    res.json({
      success: true,
      data: {
        products: products || []
      }
    });

  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/products/:productId
 * @desc    Get product by ID
 * @access  Public
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          business_phone,
          business_website,
          city,
          state,
          country,
          approved,
          verified
        )
      `)
      .eq('id', productId)
      .eq('status', 'active')
      .eq('vendor.approved', true)
      .eq('vendor.verified', true)
      .single();

    if (error || !product) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Product not found'
        }
      });
    }

    res.json({
      success: true,
      data: { product }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;
