const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { protect, requireVerification } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

/**
 * @route   POST /api/reviews
 * @desc    Create a product review (only if customer ordered the product)
 * @access  Private (Customer)
 */
router.post('/', protect, requireVerification, async (req, res) => {
  try {
    const { id: customerId } = req.user;
    const { productId, rating, comment, orderId } = req.body;

    if (!productId || !rating) {
      return res.status(400).json({
        success: false,
        error: { message: 'Product ID and rating are required' },
      });
    }

    // Validate rating - convert to number if string
    const ratingNum = typeof rating === 'string' ? parseInt(rating, 10) : Number(rating);
    if (isNaN(ratingNum) || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        error: { message: 'Rating must be an integer between 1 and 5' },
      });
    }

    // Get product and vendor info
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, vendor_id, name')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('Product fetch error:', productError);
      return res.status(404).json({
        success: false,
        error: { message: 'Product not found' },
      });
    }

    if (!product.vendor_id) {
      console.error('Product missing vendor_id:', product);
      return res.status(500).json({
        success: false,
        error: { message: 'Product is missing vendor information' },
      });
    }

    // Check if customer has ordered this product
    let hasOrdered = false;
    let validOrderId = null;

    if (orderId) {
      // If orderId provided, verify it belongs to customer and contains this product
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, customer_id, status')
        .eq('id', orderId)
        .eq('customer_id', customerId)
        .eq('status', 'delivered')
        .single();

      if (!orderError && order) {
        // Check if order contains this product
        const { data: orderItem, error: itemError } = await supabaseAdmin
          .from('order_items')
          .select('order_id')
          .eq('order_id', orderId)
          .eq('product_id', productId)
          .single();

        if (!itemError && orderItem) {
          hasOrdered = true;
          validOrderId = orderId;
        }
      }
    } else {
      // Check if customer has any order containing this product
      // First get all orders for this customer with DELIVERED status only
      const { data: customerOrders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('customer_id', customerId)
        .eq('status', 'delivered');

      if (!ordersError && customerOrders && customerOrders.length > 0) {
        // Check if any of these orders contain the product
        const orderIds = customerOrders.map(o => o.id);
        const { data: orderItems, error: itemsError } = await supabaseAdmin
          .from('order_items')
          .select('order_id')
          .in('order_id', orderIds)
          .eq('product_id', productId)
          .limit(1);

        if (!itemsError && orderItems && orderItems.length > 0) {
          hasOrdered = true;
          validOrderId = orderItems[0].order_id;
        }
      }
    }

    if (!hasOrdered) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You can only review products you have ordered. Please place an order first.',
        },
      });
    }

    // Check if customer already reviewed this product
    const { data: existingReview, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine
      console.error('Error checking existing review:', checkError);
    }

    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: { message: 'You have already reviewed this product. You can update your existing review.' },
      });
    }

    // Create review
    const reviewData = {
      id: uuidv4(),
      product_id: productId,
      customer_id: customerId,
      vendor_id: product.vendor_id,
      order_id: validOrderId || null,
      rating: ratingNum,
      comment: comment ? comment.trim() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('Creating review with data:', {
      product_id: reviewData.product_id,
      customer_id: reviewData.customer_id,
      vendor_id: reviewData.vendor_id,
      order_id: reviewData.order_id,
      rating: reviewData.rating,
      has_comment: !!reviewData.comment,
    });

    const { data: review, error: insertError } = await supabaseAdmin
      .from('reviews')
      .insert([reviewData])
      .select(`
        *,
        customer:customers (id, first_name, last_name, email, profile_photo),
        product:products (id, name)
      `)
      .single();

    if (insertError) {
      console.error('Error creating review:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        fullError: JSON.stringify(insertError, null, 2),
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to create review';
      if (insertError.code === '23505') { // Unique violation
        errorMessage = 'You have already reviewed this product';
      } else if (insertError.code === '23503') { // Foreign key violation
        errorMessage = 'Invalid product, customer, or vendor reference';
      } else if (insertError.message) {
        errorMessage = insertError.message;
      }
      
      return res.status(500).json({
        success: false,
        error: { 
          message: errorMessage,
          details: insertError.details || insertError.hint || insertError.message,
          code: insertError.code,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: { review },
    });
  } catch (error) {
    console.error('Create review error:', {
      message: error.message,
      stack: error.stack,
      fullError: error,
    });
    res.status(500).json({
      success: false,
      error: { 
        message: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    });
  }
});

/**
 * @route   PUT /api/reviews/:reviewId
 * @desc    Update a review
 * @access  Private (Customer - own reviews only)
 */
router.put('/:reviewId', protect, requireVerification, async (req, res) => {
  try {
    const { id: customerId } = req.user;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Rating must be between 1 and 5' },
      });
    }

    // Check if review exists and belongs to customer
    const { data: existingReview, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id, product_id')
      .eq('id', reviewId)
      .eq('customer_id', customerId)
      .single();

    if (checkError || !existingReview) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found or access denied' },
      });
    }

    // Update review
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (rating !== undefined) {
      updateData.rating = parseInt(rating, 10);
    }

    if (comment !== undefined) {
      updateData.comment = comment ? comment.trim() : null;
    }

    const { data: review, error: updateError } = await supabaseAdmin
      .from('reviews')
      .update(updateData)
      .eq('id', reviewId)
      .eq('customer_id', customerId)
      .select(`
        *,
        customer:customers (id, first_name, last_name, email, profile_photo),
        product:products (id, name)
      `)
      .single();

    if (updateError) {
      console.error('Error updating review:', updateError);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to update review' },
      });
    }

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: { review },
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

/**
 * @route   DELETE /api/reviews/:reviewId
 * @desc    Delete a review
 * @access  Private (Customer - own reviews only)
 */
router.delete('/:reviewId', protect, requireVerification, async (req, res) => {
  try {
    const { id: customerId } = req.user;
    const { reviewId } = req.params;

    // Check if review exists and belongs to customer
    const { data: existingReview, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('id', reviewId)
      .eq('customer_id', customerId)
      .single();

    if (checkError || !existingReview) {
      return res.status(404).json({
        success: false,
        error: { message: 'Review not found or access denied' },
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', reviewId)
      .eq('customer_id', customerId);

    if (deleteError) {
      console.error('Error deleting review:', deleteError);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to delete review' },
      });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

/**
 * @route   GET /api/reviews/product/:productId
 * @desc    Get all reviews for a product
 * @access  Public
 */
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 20, sort = 'newest' } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 20;
    const offset = (pageNumber - 1) * pageSize;

    let query = supabaseAdmin
      .from('reviews')
      .select(`
        *,
        customer:customers (id, first_name, last_name, email, profile_photo),
        product:products (id, name)
      `)
      .eq('product_id', productId);

    // Sort by
    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'highest') {
      query = query.order('rating', { ascending: false });
    } else if (sort === 'lowest') {
      query = query.order('rating', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data: reviews, error } = await query;

    if (error) {
      console.error('Error fetching reviews:', error);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch reviews' },
      });
    }

    // Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);

    // Get average rating
    const { data: ratingData, error: ratingError } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('product_id', productId);

    let averageRating = 0;
    if (!ratingError && ratingData && ratingData.length > 0) {
      const sum = ratingData.reduce((acc, r) => acc + (r.rating || 0), 0);
      averageRating = sum / ratingData.length;
    }

    res.json({
      success: true,
      data: {
        reviews: reviews || [],
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: count || 0,
        },
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: count || 0,
      },
    });
  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

/**
 * @route   GET /api/reviews/customer
 * @desc    Get all reviews by the authenticated customer
 * @access  Private (Customer)
 */
router.get('/customer', protect, requireVerification, async (req, res) => {
  try {
    const { id: customerId } = req.user;
    const { page = 1, limit = 100 } = req.query; // Increased default limit to 100

    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = Math.min(parseInt(limit, 10) || 100, 1000); // Cap at 1000, default 100
    const offset = (pageNumber - 1) * pageSize;

    const { data: reviews, error } = await supabaseAdmin
      .from('reviews')
      .select(`
        *,
        product:products (id, name, images, price, status),
        vendor:vendors (id, business_name)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching customer reviews:', error);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch reviews' },
      });
    }

    const { count, error: countError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId);

    res.json({
      success: true,
      data: {
        reviews: reviews || [],
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: count || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get customer reviews error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

/**
 * @route   GET /api/reviews/vendor
 * @desc    Get all reviews for vendor's products
 * @access  Private (Vendor)
 */
router.get('/vendor', protect, async (req, res) => {
  try {
    const { id: vendorId } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 20;
    const offset = (pageNumber - 1) * pageSize;

    const { data: reviews, error } = await supabaseAdmin
      .from('reviews')
      .select(`
        *,
        customer:customers (id, first_name, last_name, email, profile_photo),
        product:products (id, name, images, status)
      `)
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching vendor reviews:', error);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to fetch reviews' },
      });
    }

    const { count, error: countError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendorId);

    res.json({
      success: true,
      data: {
        reviews: reviews || [],
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: count || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get vendor reviews error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

/**
 * @route   GET /api/reviews/can-review/:productId
 * @desc    Check if customer can review a product (has ordered it)
 * @access  Private (Customer)
 */
router.get('/can-review/:productId', protect, requireVerification, async (req, res) => {
  try {
    const { id: customerId } = req.user;
    const { productId } = req.params;

    // Check if customer has ordered this product
    // First get all orders for this customer with DELIVERED status only
    const { data: customerOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('customer_id', customerId)
      .eq('status', 'delivered');

    let hasOrdered = false;
    
    if (!ordersError && customerOrders && customerOrders.length > 0) {
      // Check if any of these orders contain the product
      const orderIds = customerOrders.map(o => o.id);
      const { data: orderItems, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('order_id')
        .in('order_id', orderIds)
        .eq('product_id', productId)
        .limit(1);

      hasOrdered = !itemsError && orderItems && orderItems.length > 0;
    }

    // Check if customer already reviewed
    const { data: existingReview, error: reviewError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('customer_id', customerId)
      .eq('product_id', productId)
      .single();

    const hasReviewed = !reviewError && existingReview;

    res.json({
      success: true,
      data: {
        canReview: hasOrdered && !hasReviewed,
        hasOrdered,
        hasReviewed,
        existingReviewId: existingReview?.id || null,
      },
    });
  } catch (error) {
    console.error('Check can review error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Internal server error' },
    });
  }
});

module.exports = router;

