const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticateToken, protect, requireRole, requireVerification } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(requireRole(['customer']));

/**
 * @route   GET /api/customer/profile
 * @desc    Get customer profile
 * @access  Private
 */
router.get('/profile', protect, async (req, res) => {
  try {
    const { id } = req.user;

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !customer) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Customer not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          profilePhoto: customer.profile_photo,
          role: customer.role,
          verified: customer.verified,
          createdAt: customer.created_at,
          lastLogin: customer.last_login
        }
      }
    });

  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/customer/profile
 * @desc    Update customer profile
 * @access  Private
 */
router.put('/profile', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const { 
      firstName, 
      lastName, 
      profilePhoto, 
      gender, 
      address, 
      phoneNumber, 
      dateOfBirth 
    } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (firstName) updateData.first_name = firstName.trim();
    if (lastName) updateData.last_name = lastName.trim();
    if (profilePhoto) updateData.profile_photo = profilePhoto;
    if (gender) updateData.gender = gender;
    if (address) updateData.address = address.trim();
    if (phoneNumber) updateData.phone_number = phoneNumber.trim();
    if (dateOfBirth) updateData.date_of_birth = dateOfBirth;

    // Check if profile is being completed
    const isProfileCompletion = !req.user.profile_completed && 
      gender && 
      address && 
      phoneNumber && 
      dateOfBirth;

    if (isProfileCompletion) {
      updateData.profile_completed = true;
    }

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating customer profile:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update profile'
        }
      });
    }

    res.json({
      success: true,
      message: isProfileCompletion ? 'Profile completed successfully!' : 'Profile updated successfully',
      data: {
        customer: {
          id: customer.id,
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          profilePhoto: customer.profile_photo,
          role: customer.role,
          verified: customer.verified,
          updatedAt: customer.updated_at
        }
      }
    });

  } catch (error) {
    console.error('Update customer profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/customer/orders
 * @desc    Get customer orders
 * @access  Private
 */
router.get('/orders', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          product:products (*)
        )
      `)
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch orders'
        }
      });
    }

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: orders.length
        }
      }
    });

  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/customer/orders/:orderId
 * @desc    Get specific order details
 * @access  Private
 */
router.get('/orders/:orderId', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const { orderId } = req.params;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          product:products (*)
        )
      `)
      .eq('id', orderId)
      .eq('customer_id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Order not found'
        }
      });
    }

    res.json({
      success: true,
      data: { order }
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/customer/wishlist
 * @desc    Get customer wishlist
 * @access  Private
 */
router.get('/wishlist', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;

    const { data: wishlist, error } = await supabaseAdmin
      .from('wishlist')
      .select(`
        *,
        product:products (*)
      `)
      .eq('customer_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching wishlist:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch wishlist'
        }
      });
    }

    res.json({
      success: true,
      data: { wishlist }
    });

  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/customer/wishlist
 * @desc    Add item to wishlist
 * @access  Private
 */
router.post('/wishlist', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Product ID is required'
        }
      });
    }

    // Check if item already exists in wishlist
    const { data: existingItem } = await supabaseAdmin
      .from('wishlist')
      .select('id')
      .eq('customer_id', id)
      .eq('product_id', productId)
      .single();

    if (existingItem) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Item already in wishlist'
        }
      });
    }

    const { data: wishlistItem, error } = await supabaseAdmin
      .from('wishlist')
      .insert([{
        customer_id: id,
        product_id: productId,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding to wishlist:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to add item to wishlist'
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Item added to wishlist',
      data: { wishlistItem }
    });

  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/customer/wishlist/:productId
 * @desc    Remove item from wishlist
 * @access  Private
 */
router.delete('/wishlist/:productId', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const { productId } = req.params;

    const { error } = await supabaseAdmin
      .from('wishlist')
      .delete()
      .eq('customer_id', id)
      .eq('product_id', productId);

    if (error) {
      console.error('Error removing from wishlist:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to remove item from wishlist'
        }
      });
    }

    res.json({
      success: true,
      message: 'Item removed from wishlist'
    });

  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;

