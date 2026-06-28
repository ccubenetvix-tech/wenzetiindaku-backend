const express = require('express');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

/**
 * @route   GET /api/categories
 * @desc    Get distinct active product categories
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('category')
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching categories:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch categories'
        }
      });
    }

    const categories = [...new Set((data || []).map((item) => item.category).filter(Boolean))];

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;
