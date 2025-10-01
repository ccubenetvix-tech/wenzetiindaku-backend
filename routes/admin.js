const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { protect, authorize } = require('../middleware/auth');
const emailService = require('../utils/email');

const router = express.Router();

/**
 * Generate JWT token for admin
 */
const generateToken = (adminId) => {
  return jwt.sign(
    { adminId, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * @route   POST /api/admin/login
 * @desc    Admin login
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required'
        }
      });
    }

    // Check if it's the admin credentials
    if (email === 'wenzetiindaku@gmail.com' && password === 'wenzetiindaku') {
      // Generate token for admin
      const token = generateToken('admin');

      res.json({
        success: true,
        message: 'Admin login successful',
        data: {
          token,
          admin: {
            id: 'admin',
            email: 'wenzetiidnaku@gmail.com',
            role: 'admin'
          }
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid admin credentials'
        }
      });
    }

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/vendors
 * @desc    Get all vendors for admin approval
 * @access  Private (Admin only)
 */
router.get('/vendors', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'pending') {
      query = query.eq('approved', false);
    } else if (status === 'approved') {
      query = query.eq('approved', true);
    }

    const { data: vendors, error } = await query;

    if (error) {
      console.error('Error fetching vendors:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch vendors'
        }
      });
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error getting vendor count:', countError);
    }

    res.json({
      success: true,
      data: {
        vendors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/vendors/:vendorId
 * @desc    Get specific vendor details
 * @access  Private (Admin only)
 */
router.get('/vendors/:vendorId', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    res.json({
      success: true,
      data: { vendor }
    });

  } catch (error) {
    console.error('Get vendor details error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/admin/vendors/:vendorId/approve
 * @desc    Approve a vendor
 * @access  Private (Admin only)
 */
router.put('/vendors/:vendorId/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Get vendor details first
    const { data: vendor, error: fetchError } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (fetchError || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    if (vendor.approved) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Vendor is already approved'
        }
      });
    }

    // Update vendor approval status
    const { data: updatedVendor, error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (updateError) {
      console.error('Error approving vendor:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to approve vendor'
        }
      });
    }

    // Send approval email to vendor
    try {
      await emailService.sendVendorApprovalEmail(vendor.business_email, vendor.business_name);
    } catch (emailError) {
      console.error('Error sending approval email:', emailError);
      // Don't fail the approval if email fails
    }

    res.json({
      success: true,
      message: 'Vendor approved successfully',
      data: { vendor: updatedVendor }
    });

  } catch (error) {
    console.error('Approve vendor error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/admin/vendors/:vendorId/reject
 * @desc    Reject a vendor
 * @access  Private (Admin only)
 */
router.put('/vendors/:vendorId/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { reason } = req.body;

    // Get vendor details first
    const { data: vendor, error: fetchError } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (fetchError || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    if (vendor.approved) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot reject an already approved vendor'
        }
      });
    }

    // Update vendor status (you might want to add a 'rejected' status)
    const { data: updatedVendor, error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({
        approved: false,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason || 'Application rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (updateError) {
      console.error('Error rejecting vendor:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to reject vendor'
        }
      });
    }

    // Send rejection email to vendor
    try {
      await emailService.sendVendorRejectionEmail(vendor.business_email, vendor.business_name, reason);
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError);
      // Don't fail the rejection if email fails
    }

    res.json({
      success: true,
      message: 'Vendor rejected successfully',
      data: { vendor: updatedVendor }
    });

  } catch (error) {
    console.error('Reject vendor error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard stats
 * @access  Private (Admin only)
 */
router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  try {
    // Get total vendors count
    const { count: totalVendors, error: vendorsError } = await supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact', head: true });

    // Get pending vendors count
    const { count: pendingVendors, error: pendingError } = await supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact', head: true })
      .eq('approved', false);

    // Get approved vendors count
    const { count: approvedVendors, error: approvedError } = await supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact', head: true })
      .eq('approved', true);

    // Get total customers count
    const { count: totalCustomers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true });

    // Get total products count
    const { count: totalProducts, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Get flagged products count
    const { count: flaggedProducts, error: flaggedError } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'flagged');

    // Get total orders count
    const { count: totalOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // Get total sales (sum of all order totals)
    const { data: ordersData, error: salesError } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .eq('status', 'completed');

    const totalSales = ordersData ? ordersData.reduce((sum, order) => sum + (order.total_amount || 0), 0) : 0;

    res.json({
      success: true,
      data: {
        totalVendors: totalVendors || 0,
        totalProducts: totalProducts || 0,
        totalCustomers: totalCustomers || 0,
        totalOrders: totalOrders || 0,
        totalSales: totalSales || 0,
        pendingVendors: pendingVendors || 0,
        flaggedProducts: flaggedProducts || 0
      }
    });

  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/admin/vendors/:vendorId
 * @desc    Update vendor details
 * @access  Private (Admin only)
 */
router.put('/vendors/:vendorId', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      business_name, business_email, business_phone, business_website,
      business_address, city, state, country, postal_code, business_type,
      description, categories, verified, approved
    } = req.body;

    // Update vendor
    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .update({
        business_name,
        business_email,
        business_phone,
        business_website,
        business_address,
        city,
        state,
        country,
        postal_code,
        business_type,
        description,
        categories,
        verified,
        approved,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error) {
      console.error('Error updating vendor:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update vendor'
        }
      });
    }

    res.json({
      success: true,
      message: 'Vendor updated successfully',
      data: { vendor }
    });

  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/admin/vendors/:vendorId
 * @desc    Delete vendor and all associated data
 * @access  Private (Admin only)
 */
router.delete('/vendors/:vendorId', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;

    // 1. Delete order items for vendor's orders
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('vendor_id', vendorId);

    if (orders && orders.length > 0) {
      const orderIds = orders.map(order => order.id);
      await supabaseAdmin
        .from('order_items')
        .delete()
        .in('order_id', orderIds);
    }

    // 2. Delete orders
    await supabaseAdmin
      .from('orders')
      .delete()
      .eq('vendor_id', vendorId);

    // 3. Delete products
    await supabaseAdmin
      .from('products')
      .delete()
      .eq('vendor_id', vendorId);

    // 4. Delete vendor
    const { error } = await supabaseAdmin
      .from('vendors')
      .delete()
      .eq('id', vendorId);

    if (error) {
      console.error('Error deleting vendor:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete vendor'
        }
      });
    }

    res.json({
      success: true,
      message: 'Vendor and all associated data deleted successfully'
    });

  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/products
 * @desc    Get all products with vendor details
 * @access  Private (Admin only)
 */
router.get('/products', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', vendor_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          approved,
          verified
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id);
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
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0
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
 * @route   PUT /api/admin/products/:productId
 * @desc    Update product details
 * @access  Private (Admin only)
 */
router.put('/products/:productId', protect, authorize('admin'), async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      name, description, price, category, images, stock, status
    } = req.body;

    // Update product
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update({
        name,
        description,
        price,
        category,
        images,
        stock,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email
        )
      `)
      .single();

    if (error) {
      console.error('Error updating product:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update product'
        }
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/admin/products/:productId
 * @desc    Delete product
 * @access  Private (Admin only)
 */
router.delete('/products/:productId', protect, authorize('admin'), async (req, res) => {
  try {
    const { productId } = req.params;

    // Delete product
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete product'
        }
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/admin/products/:productId/red-mark
 * @desc    Red-mark a product (mark as flagged/problematic)
 * @access  Private (Admin only)
 */
router.put('/products/:productId/red-mark', protect, authorize('admin'), async (req, res) => {
  try {
    const { productId } = req.params;
    const { reason } = req.body;

    // Update product status to flagged
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update({
        status: 'flagged',
        flagged_reason: reason,
        flagged_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select(`
        *,
        vendor:vendors!inner(
          id,
          business_name,
          business_email
        )
      `)
      .single();

    if (error) {
      console.error('Error red-marking product:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to red-mark product'
        }
      });
    }

    res.json({
      success: true,
      message: 'Product red-marked successfully',
      data: { product }
    });

  } catch (error) {
    console.error('Red-mark product error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/customers
 * @desc    Get all customers
 * @access  Private (Admin only)
 */
router.get('/customers', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: customers, error, count } = await query;

    if (error) {
      console.error('Error fetching customers:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch customers'
        }
      });
    }

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0
        }
      }
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/customers/:customerId
 * @desc    Get customer details
 * @access  Private (Admin only)
 */
router.get('/customers/:customerId', protect, authorize('admin'), async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (error) {
      console.error('Error fetching customer:', error);
      return res.status(404).json({
        success: false,
        error: {
          message: 'Customer not found'
        }
      });
    }

    // Get customer's orders
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        vendor:vendors!inner(
          business_name,
          business_email
        ),
        order_items(
          *,
          product:products(
            name,
            price
          )
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      data: {
        customer,
        orders: orders || []
      }
    });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   DELETE /api/admin/customers/:customerId
 * @desc    Delete customer and all associated data
 * @access  Private (Admin only)
 */
router.delete('/customers/:customerId', protect, authorize('admin'), async (req, res) => {
  try {
    const { customerId } = req.params;

    // 1. Delete cart items
    await supabaseAdmin
      .from('cart')
      .delete()
      .eq('customer_id', customerId);

    // 2. Delete wishlist items
    await supabaseAdmin
      .from('wishlist')
      .delete()
      .eq('customer_id', customerId);

    // 3. Delete order items for customer's orders
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('customer_id', customerId);

    if (orders && orders.length > 0) {
      const orderIds = orders.map(order => order.id);
      await supabaseAdmin
        .from('order_items')
        .delete()
        .in('order_id', orderIds);
    }

    // 4. Delete orders
    await supabaseAdmin
      .from('orders')
      .delete()
      .eq('customer_id', customerId);

    // 5. Delete customer
    const { error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', customerId);

    if (error) {
      console.error('Error deleting customer:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete customer'
        }
      });
    }

    res.json({
      success: true,
      message: 'Customer and all associated data deleted successfully'
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;
