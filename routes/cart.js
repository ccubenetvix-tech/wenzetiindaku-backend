const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @route   GET /api/cart
 * @desc    Get customer cart
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { id } = req.user;

    const { data: cartItems, error } = await supabaseAdmin
      .from('cart')
      .select(`
        *,
        product:products (
          id,
          name,
          price,
          images,
          stock,
          status,
          vendor:vendors (
            id,
            business_name,
            approved,
            verified
          )
        )
      `)
      .eq('customer_id', id)
      .eq('product.status', 'active')
      .eq('product.vendor.approved', true)
      .eq('product.vendor.verified', true);

    if (error) {
      console.error('Error fetching cart:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch cart'
        }
      });
    }

    res.json({
      success: true,
      data: { cartItems: cartItems || [] }
    });

  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/cart
 * @desc    Add item to cart
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { id } = req.user;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Product ID is required'
        }
      });
    }

    // Check if item already exists in cart
    const { data: existingItem } = await supabaseAdmin
      .from('cart')
      .select('id, quantity')
      .eq('customer_id', id)
      .eq('product_id', productId)
      .single();

    if (existingItem) {
      // Update quantity
      const { data: updatedItem, error } = await supabaseAdmin
        .from('cart')
        .update({ 
          quantity: existingItem.quantity + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating cart item:', error);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to update cart item'
          }
        });
      }

      return res.json({
        success: true,
        message: 'Cart item updated',
        data: { cartItem: updatedItem }
      });
    } else {
      // Add new item
      const { data: newItem, error } = await supabaseAdmin
        .from('cart')
        .insert([{
          customer_id: id,
          product_id: productId,
          quantity,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to add item to cart'
          }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Item added to cart',
        data: { cartItem: newItem }
      });
    }

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/cart/:itemId
 * @desc    Update cart item quantity
 * @access  Private
 */
router.put('/:itemId', async (req, res) => {
  try {
    const { id } = req.user;
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Valid quantity is required'
        }
      });
    }

    const { data: updatedItem, error } = await supabaseAdmin
      .from('cart')
      .update({ 
        quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('customer_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating cart item:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update cart item'
        }
      });
    }

    res.json({
      success: true,
      message: 'Cart item updated',
      data: { cartItem: updatedItem }
    });

  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/cart/:itemId
 * @desc    Remove item from cart
 * @access  Private
 */
router.delete('/:itemId', async (req, res) => {
  try {
    const { id } = req.user;
    const { itemId } = req.params;

    const { error } = await supabaseAdmin
      .from('cart')
      .delete()
      .eq('id', itemId)
      .eq('customer_id', id);

    if (error) {
      console.error('Error removing from cart:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to remove item from cart'
        }
      });
    }

    res.json({
      success: true,
      message: 'Item removed from cart'
    });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/cart
 * @desc    Clear entire cart
 * @access  Private
 */
router.delete('/', async (req, res) => {
  try {
    const { id } = req.user;

    const { error } = await supabaseAdmin
      .from('cart')
      .delete()
      .eq('customer_id', id);

    if (error) {
      console.error('Error clearing cart:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to clear cart'
        }
      });
    }

    res.json({
      success: true,
      message: 'Cart cleared'
    });

  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;
