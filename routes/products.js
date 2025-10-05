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
      location
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
      `)
      .eq('status', 'active')
      .eq('vendor.approved', true)
      .eq('vendor.verified', true)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (category) {
      query = query.eq('category', category);
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
