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
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      if (status === 'pending') {
        query = query.eq('approved', false).is('rejected_at', null);
      } else if (status === 'approved') {
        query = query.eq('approved', true);
      } else if (status === 'rejected') {
        query = query.not('rejected_at', 'is', null);
      }
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`business_name.ilike.${searchTerm},business_email.ilike.${searchTerm},business_phone.ilike.${searchTerm}`);
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
        vendors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
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

    // Get total sales (sum of delivered/completed orders only)
    const { data: ordersData, error: salesError } = await supabaseAdmin
      .from('orders')
      .select('total_amount, status');

    const totalSales = ordersData ? ordersData.reduce((sum, order) => {
      if (order.status === 'delivered' || order.status === 'completed') {
        return sum + (Number(order.total_amount) || 0);
      }
      return sum;
    }, 0) : 0;

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

    // When search is provided, fetch matching products and vendors, then filter in memory
    if (search) {
      let baseQuery = supabaseAdmin
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
        .order('created_at', { ascending: false });

      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      if (vendor_id) {
        baseQuery = baseQuery.eq('vendor_id', vendor_id);
      }

      const { data: allProducts, error } = await baseQuery;

      if (error) {
        console.error('Error fetching products with search:', error);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to fetch products'
          }
        });
      }

      const searchLower = String(search).toLowerCase();

      const filtered = (allProducts || []).filter((product) => {
        const name = (product.name || '').toLowerCase();
        const vendorName = (product.vendor?.business_name || '').toLowerCase();
        const vendorEmail = (product.vendor?.business_email || '').toLowerCase();

        return (
          name.includes(searchLower) ||
          vendorName.includes(searchLower) ||
          vendorEmail.includes(searchLower)
        );
      });

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + Number(limit));

      return res.json({
        success: true,
        data: {
          products: paginated,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total
          }
        }
      });
    }

    // Default path (no search): use database-level pagination
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
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

/**
 * @route   GET /api/admin/orders
 * @desc    Get all orders with filters and pagination
 * @access  Private (Admin only)
 */
router.get('/orders', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '', dateFrom = '', dateTo = '' } = req.query;
    const pageNumber = Number.parseInt(page, 10) || 1;
    const pageSize = Number.parseInt(limit, 10) || 20;
    const offset = (pageNumber - 1) * pageSize;

    // Base query with joins
    let baseQuery = supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers!inner(
          id,
          first_name,
          last_name,
          email,
          phone_number
        ),
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          business_phone
        ),
        order_items(
          id,
          quantity,
          price,
          product:products(
            id,
            name,
            images,
            price
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Apply status and date filters at DB level first (efficiency)
    if (status) {
      baseQuery = baseQuery.eq('status', status);
    }
    if (dateFrom) {
      baseQuery = baseQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      baseQuery = baseQuery.lte('created_at', dateTo);
    }

    // Determine verification strategy based on search presence
    if (search) {
      // STRATEGY: Fetch all matching date/status, then filter in memory for search
      // This avoids UUID casting errors when searching "Order ID" with partial text
      const { data: allOrders, error } = await baseQuery;

      if (error) {
        console.error('Error fetching orders for search:', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to fetch orders' }
        });
      }

      const searchLower = String(search).toLowerCase();

      // In-memory filtering
      const filteredOrders = (allOrders || []).filter(order => {
        const orderId = (order.id || '').toLowerCase();
        const custFirstName = (order.customer?.first_name || '').toLowerCase();
        const custLastName = (order.customer?.last_name || '').toLowerCase();
        const custEmail = (order.customer?.email || '').toLowerCase();
        const vendorName = (order.vendor?.business_name || '').toLowerCase();

        return (
          orderId.includes(searchLower) ||
          custFirstName.includes(searchLower) ||
          custLastName.includes(searchLower) ||
          custEmail.includes(searchLower) ||
          vendorName.includes(searchLower)
        );
      });

      const totalCount = filteredOrders.length;
      const paginatedOrders = filteredOrders.slice(offset, offset + pageSize);

      // Transform data
      const transformedOrders = paginatedOrders.map(order => ({
        id: order.id,
        orderId: order.id,
        customer: {
          id: order.customer?.id,
          name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || order.customer.email : 'Unknown',
          email: order.customer?.email,
          phone: order.customer?.phone_number
        },
        vendor: {
          id: order.vendor?.id,
          name: order.vendor?.business_name || 'Unknown',
          email: order.vendor?.business_email,
          phone: order.vendor?.business_phone
        },
        totalAmount: Number(order.total_amount) || 0,
        status: order.status || 'pending',
        paymentMethod: order.payment_method || 'N/A',
        paymentStatus: order.payment_status || 'pending',
        shippingAddress: order.shipping_address || null,
        cancellationReason: order.cancellation_reason || null,
        items: (order.order_items || []).map(item => ({
          id: item.id,
          productId: item.product?.id,
          productName: item.product?.name || 'Unknown Product',
          productImage: item.product?.images?.[0] || null,
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          subtotal: (Number(item.quantity) || 0) * (Number(item.price) || 0)
        })),
        itemsCount: order.order_items?.length || 0,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      return res.json({
        success: true,
        data: {
          orders: transformedOrders,
          pagination: {
            page: pageNumber,
            limit: pageSize,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / pageSize)
          }
        }
      });

    } else {
      // DEFAULT STRATEGY: Database-level pagination (no search term)
      // Apply pagination to query
      baseQuery = baseQuery.range(offset, offset + pageSize - 1);

      const { data: orders, error, count } = await baseQuery; // count won't be exact here naturally without extra query or config, but we deal with it below

      if (error) {
        console.error('Error fetching orders:', error);
        return res.status(500).json({
          success: false,
          error: { message: 'Failed to fetch orders' }
        });
      }

      // Get accurate count for pagination
      let countQuery = supabaseAdmin
        .from('orders')
        .select('*', { count: 'exact', head: true });

      if (status) countQuery = countQuery.eq('status', status);
      if (dateFrom) countQuery = countQuery.gte('created_at', dateFrom);
      if (dateTo) countQuery = countQuery.lte('created_at', dateTo);

      const { count: totalCount } = await countQuery;

      // Transform data
      const transformedOrders = (orders || []).map(order => ({
        id: order.id,
        orderId: order.id,
        customer: {
          id: order.customer?.id,
          name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || order.customer.email : 'Unknown',
          email: order.customer?.email,
          phone: order.customer?.phone_number
        },
        vendor: {
          id: order.vendor?.id,
          name: order.vendor?.business_name || 'Unknown',
          email: order.vendor?.business_email,
          phone: order.vendor?.business_phone
        },
        totalAmount: Number(order.total_amount) || 0,
        status: order.status || 'pending',
        paymentMethod: order.payment_method || 'N/A',
        paymentStatus: order.payment_status || 'pending',
        shippingAddress: order.shipping_address || null,
        cancellationReason: order.cancellation_reason || null,
        items: (order.order_items || []).map(item => ({
          id: item.id,
          productId: item.product?.id,
          productName: item.product?.name || 'Unknown Product',
          productImage: item.product?.images?.[0] || null,
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
          subtotal: (Number(item.quantity) || 0) * (Number(item.price) || 0)
        })),
        itemsCount: order.order_items?.length || 0,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }));

      res.json({
        success: true,
        data: {
          orders: transformedOrders,
          pagination: {
            page: pageNumber,
            limit: pageSize,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / pageSize)
          }
        }
      });
    }

  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/orders/:orderId
 * @desc    Get specific order details
 * @access  Private (Admin only)
 */
router.get('/orders/:orderId', protect, authorize('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers!inner(
          id,
          first_name,
          last_name,
          email,
          phone_number,
          address
        ),
        vendor:vendors!inner(
          id,
          business_name,
          business_email,
          business_phone,
          business_address,
          city,
          state,
          country
        ),
        order_items(
          id,
          quantity,
          price,
          product:products(
            id,
            name,
            description,
            images,
            price,
            category
          )
        )
      `)
      .eq('id', orderId)
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
 * @route   PUT /api/admin/orders/:orderId/status
 * @desc    Update order status
 * @access  Private (Admin only)
 */
router.put('/orders/:orderId/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Status is required'
        }
      });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid status'
        }
      });
    }

    // Get existing order
    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !existingOrder) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Order not found'
        }
      });
    }

    // Update order status
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    if (notes) {
      updateData.admin_notes = notes;
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select(`
        *,
        customer:customers!inner(
          id,
          first_name,
          last_name,
          email
        ),
        vendor:vendors!inner(
          id,
          business_name,
          business_email
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating order status:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update order status'
        }
      });
    }

    // TODO: Send email notifications if needed

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order: updatedOrder }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/admin/orders/:orderId/payment-status
 * @desc    Update order payment status
 * @access  Private (Admin only)
 */
router.put('/orders/:orderId/payment-status', protect, authorize('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Payment status is required'
        }
      });
    }

    const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid payment status'
        }
      });
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating payment status:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update payment status'
        }
      });
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: { order: updatedOrder }
    });

  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/admin/orders/stats
 * @desc    Get order statistics for admin dashboard
 * @access  Private (Admin only)
 */
router.get('/orders/stats', protect, authorize('admin'), async (req, res) => {
  try {
    // Get orders by status
    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('status, total_amount, created_at');

    const stats = {
      total: allOrders?.length || 0,
      pending: allOrders?.filter(o => o.status === 'pending').length || 0,
      processing: allOrders?.filter(o => o.status === 'processing').length || 0,
      shipped: allOrders?.filter(o => o.status === 'shipped').length || 0,
      delivered: allOrders?.filter(o => o.status === 'delivered' || o.status === 'completed').length || 0,
      cancelled: allOrders?.filter(o => o.status === 'cancelled').length || 0,
      totalRevenue: allOrders?.reduce((sum, order) => {
        if (order.status === 'delivered' || order.status === 'completed') {
          return sum + (Number(order.total_amount) || 0);
        }
        return sum;
      }, 0) || 0,
      pendingRevenue: allOrders?.reduce((sum, order) => {
        if (order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'completed') {
          return sum + (Number(order.total_amount) || 0);
        }
        return sum;
      }, 0) || 0
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});


/**
 * @route   GET /api/admin/vendors/:vendorId/revenue
 * @desc    Get vendor revenue and performance details
 * @access  Private (Admin only)
 */
router.get('/vendors/:vendorId/revenue', protect, authorize('admin'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify vendor exists
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from('vendors')
      .select('business_name')
      .eq('id', vendorId)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        success: false,
        error: { message: 'Vendor not found' }
      });
    }

    // Get full product inventory for this vendor
    let storeInventory = [];
    let totalProducts = 0;
    try {
      const { data: inventoryData, error: inventoryError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('vendor_id', vendorId);

      if (inventoryError) {
        console.error('Error fetching inventory:', inventoryError);
        // Don't throw, just have empty inventory
      } else if (inventoryData) {
        storeInventory = inventoryData.map(item => ({
          ...item,
          // Handle potential different column names for stock
          quantity: item.quantity !== undefined ? item.quantity : (item.stock !== undefined ? item.stock : 0)
        }));
        totalProducts = storeInventory.length;
      }
    } catch (err) {
      console.error('Unexpected error fetching inventory:', err);
    }

    // Build query for orders
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id,
        total_amount,
        status,
        created_at,
        order_items (
            quantity,
            price,
            product:products (
                id,
                name,
                price,
                images
            )
        )
      `)
      .eq('vendor_id', vendorId);

    // Apply date filters if present
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      throw ordersError;
    }

    // Calculate details
    let totalRevenue = 0;
    let totalSalesVolume = 0;
    let productStats = {};

    if (orders) {
      orders.forEach(order => {
        // Only count completed/delivered sales for revenue
        if (order.status === 'delivered' || order.status === 'completed') {
          const orderAmount = Number(order.total_amount) || 0;
          totalRevenue += orderAmount;
          totalSalesVolume += 1; // Count number of orders
        }

        // Process product breakdown
        if (order.status === 'delivered' || order.status === 'completed') {
          if (order.order_items && Array.isArray(order.order_items)) {
            order.order_items.forEach(item => {
              const productId = item.product?.id;
              const productName = item.product?.name || 'Unknown Product';
              const productImage = item.product?.images?.[0] || null;
              const quantity = item.quantity || 0;
              const price = Number(item.price) || 0;
              const earnings = quantity * price;

              if (productId) {
                if (!productStats[productId]) {
                  productStats[productId] = {
                    id: productId,
                    name: productName,
                    image: productImage,
                    unitsSold: 0,
                    earnings: 0
                  };
                }
                productStats[productId].unitsSold += quantity;
                productStats[productId].earnings += earnings;
              }
            });
          }
        }
      });
    }

    const productBreakdown = Object.values(productStats);

    // Calculate Top Selling (Sort by unitsSold desc)
    const topSelling = [...productBreakdown]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    const totalProfit = totalRevenue;

    // Average Gain = Total Revenue / Total Orders (Sales Volume)
    const avgGain = totalSalesVolume > 0 ? (totalRevenue / totalSalesVolume) : 0;

    res.json({
      success: true,
      data: {
        vendorName: vendor.business_name,
        totalRevenue,
        totalSalesVolume,
        totalProfit,
        avgGain,
        totalProducts,
        productBreakdown,
        topSelling,
        storeInventory
      }
    });

  } catch (error) {
    console.error('Get vendor revenue error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
});

/**
 * @route   GET /api/admin/customers/:customerId/orders
 * @desc    Get customer purchase history
 * @access  Private (Admin only)
 */
router.get('/customers/:customerId/orders', protect, authorize('admin'), async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        created_at,
        total_amount,
        status,
        order_items (
          quantity,
          price,
          product:products (
            name,
            images,
            vendor:vendors (
              business_name
            )
          )
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Process orders to readable format
    const formattedOrders = orders.map(order => {
      const items = order.order_items.map(item => ({
        productName: item.product?.name || 'Unknown',
        storeName: item.product?.vendor?.business_name || 'N/A',
        quantity: item.quantity,
        price: item.price,
        image: item.product?.images?.[0] || null
      }));

      return {
        id: order.id,
        date: order.created_at,
        totalAmount: order.total_amount,
        status: order.status,
        items
      };
    });

    // Calculate total spent
    const totalSpent = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);

    res.json({
      success: true,
      data: {
        totalSpent,
        orders: formattedOrders
      }
    });

  } catch (error) {
    console.error('Get customer history error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
});

/**
 * @route   GET /api/admin/customers/:customerId/reviews
 * @desc    Get customer reviews
 * @access  Private (Admin only)
 */
router.get('/customers/:customerId/reviews', protect, authorize('admin'), async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data: reviews, error } = await supabaseAdmin
      .from('reviews')
      .select(`
        id,
        rating,
        comment,
        created_at,
        product:products (
          id,
          name,
          images
        ),
        customer:customers (
          first_name,
          last_name,
          email
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        reviews
      }
    });

  } catch (error) {
    console.error('Get customer reviews error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error' }
    });
  }
});

module.exports = router;
