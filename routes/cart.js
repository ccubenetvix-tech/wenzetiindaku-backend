const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const CartService = require('../services/cartService');
const { addToCartSchema, updateCartItemSchema } = require('../validators/cartValidator');

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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await CartService.getCart(id, page, limit);

    res.json({
      success: true,
      data: {
        cartItems: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          pages: Math.ceil(result.total / result.limit)
        }
      }
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/cart
 * @desc    Add item to cart
 * @access  Private
 */
router.post('/', validateRequest(addToCartSchema), async (req, res) => {
  try {
    const { id } = req.user;
    const { productId, quantity } = req.body;

    const cartItem = await CartService.addToCart(id, productId, quantity);

    res.status(201).json({
      success: true,
      message: 'Item added to cart',
      data: { cartItem }
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/cart/:itemId
 * @desc    Update cart item quantity
 * @access  Private
 */
router.put('/:itemId', validateRequest(updateCartItemSchema), async (req, res) => {
  try {
    const { id } = req.user;
    const { itemId } = req.params;
    const { quantity } = req.body;

    const cartItem = await CartService.updateCartItem(id, itemId, quantity);

    res.json({
      success: true,
      message: 'Cart item updated',
      data: { cartItem }
    });

  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
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

    await CartService.removeFromCart(id, itemId);

    res.json({
      success: true,
      message: 'Item removed from cart'
    });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
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
    await CartService.clearCart(id);

    res.json({
      success: true,
      message: 'Cart cleared'
    });

  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        message: error.message || 'Internal server error'
      }
    });
  }
});

module.exports = router;
