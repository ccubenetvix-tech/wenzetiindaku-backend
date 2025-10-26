const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authenticateToken, protect, requireRole, requireVerification } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(requireRole(['vendor']));

/**
 * @route   POST /api/vendor/profile/photo
 * @desc    Upload vendor profile photo to Supabase Storage and save URL
 * @access  Private
 */
router.post('/profile/photo', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { fileBase64, fileName } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({
        success: false,
        error: { message: 'fileBase64 and fileName are required' }
      });
    }

    // Parse base64
    const matches = fileBase64.match(/^data:(.*);base64,(.*)$/);
    const mimeType = matches ? matches[1] : 'image/jpeg';
    const base64Data = matches ? matches[2] : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = fileName.split('.').pop() || 'jpg';
    const path = `vendors/${id}/profile.${ext}`;

    // Upload to Supabase Storage (public bucket)
    const { error: uploadError } = await supabaseAdmin.storage
      .from('public-images')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ success: false, error: { message: 'Failed to upload image' } });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('public-images')
      .getPublicUrl(path);

    const publicUrl = publicUrlData?.publicUrl;

    // Save to DB
    const { data: vendor, error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({ profile_photo: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error saving profile photo URL:', updateError);
      return res.status(500).json({ success: false, error: { message: 'Failed to save image URL' } });
    }

    return res.json({ success: true, data: { url: publicUrl, vendor } });
  } catch (error) {
    console.error('Upload vendor profile photo error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});

/**
 * @route   POST /api/vendor/products/:productId/image
 * @desc    Upload a product image to Supabase Storage and push URL into products.images
 * @access  Private
 */
router.post('/products/:productId/image', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { productId } = req.params;
    const { fileBase64, fileName } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ success: false, error: { message: 'fileBase64 and fileName are required' } });
    }

    // Verify ownership
    const { data: product, error: findError } = await supabaseAdmin
      .from('products')
      .select('id, images')
      .eq('id', productId)
      .eq('vendor_id', id)
      .single();

    if (findError || !product) {
      return res.status(404).json({ success: false, error: { message: 'Product not found' } });
    }

    const matches = fileBase64.match(/^data:(.*);base64,(.*)$/);
    const mimeType = matches ? matches[1] : 'image/jpeg';
    const base64Data = matches ? matches[2] : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = fileName.split('.').pop() || 'jpg';
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `products/${id}/${productId}/${key}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('public-images')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ success: false, error: { message: 'Failed to upload image' } });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('public-images')
      .getPublicUrl(path);
    const url = publicUrlData?.publicUrl;

    const nextImages = Array.isArray(product.images) ? [...product.images, url] : [url];

    const { data: updated, error: saveError } = await supabaseAdmin
      .from('products')
      .update({ images: nextImages, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('vendor_id', id)
      .select()
      .single();

    if (saveError) {
      console.error('Save product images error:', saveError);
      return res.status(500).json({ success: false, error: { message: 'Failed to save image URL' } });
    }

    return res.json({ success: true, data: { url, product: updated } });
  } catch (error) {
    console.error('Upload product image error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});
/**
 * @route   GET /api/vendor/profile
 * @desc    Get vendor profile
 * @access  Private
 */
router.get('/profile', protect, async (req, res) => {
  try {
    const { id } = req.user;

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', id)
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
      data: {
        vendor: {
          id: vendor.id,
          businessName: vendor.business_name,
          businessEmail: vendor.business_email,
          businessPhone: vendor.business_phone,
          businessWebsite: vendor.business_website,
          businessAddress: vendor.business_address,
          city: vendor.city,
          state: vendor.state,
          country: vendor.country,
          postalCode: vendor.postal_code,
          businessType: vendor.business_type,
          description: vendor.description,
          categories: vendor.categories,
          role: vendor.role,
          verified: vendor.verified,
          approved: vendor.approved,
          createdAt: vendor.created_at,
          lastLogin: vendor.last_login,
          registrationMethod: 'email' // Vendors can only register via email
        }
      }
    });

  } catch (error) {
    console.error('Get vendor profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/vendor/profile
 * @desc    Update vendor profile
 * @access  Private
 */
router.put('/profile', protect, requireVerification, async (req, res) => {
  try {
    const { id } = req.user;
    const {
      businessName, businessPhone, businessWebsite, businessAddress,
      city, state, country, postalCode, businessType, description, categories,
      currentPassword, newPassword
    } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (businessName) updateData.business_name = businessName.trim();
    if (businessPhone) updateData.business_phone = businessPhone;
    if (businessWebsite) updateData.business_website = businessWebsite;
    if (businessAddress) updateData.business_address = businessAddress.trim();
    if (city) updateData.city = city.trim();
    if (state) updateData.state = state.trim();
    if (country) updateData.country = country.trim();
    if (postalCode) updateData.postal_code = postalCode.trim();
    if (businessType) updateData.business_type = businessType.trim();
    if (description) updateData.description = description.trim();
    if (categories) updateData.categories = categories;

    // Handle password change
    if (newPassword && currentPassword) {
      // Get current vendor data to verify current password
      const { data: currentVendor, error: fetchError } = await supabaseAdmin
        .from('vendors')
        .select('password')
        .eq('id', id)
        .single();

      if (fetchError || !currentVendor) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Vendor not found'
          }
        });
      }

      // Verify current password
      const bcrypt = require('bcryptjs');
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentVendor.password);
      
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Current password is incorrect'
          }
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
      updateData.password = hashedNewPassword;
    }

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating vendor profile:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update profile'
        }
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        vendor: {
          id: vendor.id,
          businessName: vendor.business_name,
          businessEmail: vendor.business_email,
          businessPhone: vendor.business_phone,
          businessWebsite: vendor.business_website,
          businessAddress: vendor.business_address,
          city: vendor.city,
          state: vendor.state,
          country: vendor.country,
          postalCode: vendor.postal_code,
          businessType: vendor.business_type,
          description: vendor.description,
          categories: vendor.categories,
          role: vendor.role,
          verified: vendor.verified,
          approved: vendor.approved,
          updatedAt: vendor.updated_at
        }
      }
    });

  } catch (error) {
    console.error('Update vendor profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/vendor/dashboard
 * @desc    Get vendor dashboard data 
 * @access  Private
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const { id } = req.user;

    // Get vendor info
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    // Get dashboard statistics
    const [
      { data: products, error: productsError },
      { data: orders, error: ordersError },
      { data: customers, error: customersError }
    ] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('id, price, stock, status, created_at')
        .eq('vendor_id', id),
      supabaseAdmin
        .from('orders')
        .select('id, total_amount, status, created_at')
        .eq('vendor_id', id),
      supabaseAdmin
        .from('orders')
        .select('customer_id')
        .eq('vendor_id', id)
        .not('customer_id', 'is', null)
    ]);

    // Get order items after we have the orders
    let orderItems = [];
    if (orders && orders.length > 0) {
      const { data: orderItemsData, error: orderItemsError } = await supabaseAdmin
        .from('order_items')
        .select('quantity, price, order_id')
        .in('order_id', orders.map(o => o.id));
      
      if (orderItemsError) {
        console.error('Order items fetch error:', orderItemsError);
      } else {
        orderItems = orderItemsData || [];
      }
    }

    if (productsError || ordersError || customersError) {
      console.error('Dashboard data fetch errors:', { productsError, ordersError, customersError });
    }

    // Calculate statistics
    const totalProducts = products?.length || 0;
    const totalOrders = orders?.length || 0;
    const totalSales = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const uniqueCustomers = new Set(customers?.map(c => c.customer_id)).size || 0;
    
    console.log('Dashboard statistics:', {
      vendorId: id,
      totalProducts,
      totalOrders,
      totalSales,
      uniqueCustomers,
      productsCount: products?.length,
      ordersCount: orders?.length,
      customersCount: customers?.length
    });
    
    // Calculate growth (compare with previous month)
    const currentMonth = new Date();
    const previousMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    
    const { data: currentMonthOrders } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .eq('vendor_id', id)
      .gte('created_at', currentMonthStart.toISOString());
    
    const { data: previousMonthOrders } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .eq('vendor_id', id)
      .gte('created_at', previousMonth.toISOString())
      .lt('created_at', currentMonthStart.toISOString());
    
    const currentMonthSales = currentMonthOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const previousMonthSales = previousMonthOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const growth = previousMonthSales > 0 ? ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100 : 0;

    // Get recent orders with customer details
    const { data: recentOrders, error: recentOrdersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        total_amount,
        status,
        created_at,
        customers!inner(first_name, last_name)
      `)
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get top products
    const { data: topProducts, error: topProductsError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        name,
        price,
        stock,
        status,
        image_url,
        created_at
      `)
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    const dashboardData = {
      stats: {
        totalSales: totalSales,
        totalOrders: totalOrders,
        totalProducts: totalProducts,
        totalCustomers: uniqueCustomers,
        growth: Math.round(growth * 100) / 100,
        conversionRate: totalOrders > 0 ? Math.round((totalOrders / Math.max(uniqueCustomers, 1)) * 100) / 100 : 0
      },
      recentOrders: recentOrders?.map(order => ({
        id: order.id,
        customer: order.customers ? `${order.customers.first_name} ${order.customers.last_name}` : 'Unknown',
        date: order.created_at,
        status: order.status,
        total: order.total_amount,
        items: 1, // This would need to be calculated from order_items
        payment: 'Paid' // This would need to be determined from payment status
      })) || [],
      topProducts: topProducts?.map(product => ({
        id: product.id,
        name: product.name,
        image: product.image_url || '/marketplace.jpeg',
        price: product.price,
        sales: 0, // This would need to be calculated from order_items
        revenue: 0, // This would need to be calculated from order_items
        rating: 4.5, // This would need to be calculated from reviews
        stock: product.stock
      })) || [],
      vendor: {
        businessName: vendor.business_name,
        businessEmail: vendor.business_email,
        approved: vendor.approved,
        verified: vendor.verified
      }
    };

    console.log('Dashboard data being sent:', dashboardData);
    
    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get vendor dashboard error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/vendor/products
 * @desc    Get vendor products
 * @access  Private
 */
router.get('/products', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('products')
      .select('*')
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: products, error } = await query;

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
          total: products.length
        }
      }
    });

  } catch (error) {
    console.error('Get vendor products error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/vendor/products
 * @desc    Create new product
 * @access  Private
 */
router.post('/products', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const {
      name, description, price, category, images, stock, status = 'active'
    } = req.body;

    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name, description, price, and category are required'
        }
      });
    }

    const productData = {
      id: require('uuid').v4(),
      vendor_id: id,
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      category,
      images: images || [],
      stock: parseInt(stock) || 0,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create product'
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/vendor/products/:productId
 * @desc    Update product
 * @access  Private
 */
router.put('/products/:productId', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { productId } = req.params;
    const {
      name, description, price, category, images, stock, status
    } = req.body;

    // Check if product belongs to vendor
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('vendor_id', id)
      .single();

    if (checkError || !existingProduct) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Product not found or access denied'
        }
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name) updateData.name = name.trim();
    if (description) updateData.description = description.trim();
    if (price) updateData.price = parseFloat(price);
    if (category) updateData.category = category;
    if (images) updateData.images = images;
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (status) updateData.status = status;

    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .eq('vendor_id', id)
      .select()
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
 * @route   DELETE /api/vendor/products/:productId
 * @desc    Delete product
 * @access  Private
 */
router.delete('/products/:productId', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { productId } = req.params;

    // Check if product belongs to vendor
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('vendor_id', id)
      .single();

    if (checkError || !existingProduct) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Product not found or access denied'
        }
      });
    }

    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('vendor_id', id);

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
 * @route   GET /api/vendor/orders
 * @desc    Get vendor orders
 * @access  Private
 */
router.get('/orders', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers (first_name, last_name, email),
        order_items (
          *,
          product:products (name, price)
        )
      `)
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error } = await query;

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
    console.error('Get vendor orders error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   PUT /api/vendor/orders/:orderId/status
 * @desc    Update order status
 * @access  Private
 */
router.put('/orders/:orderId/status', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Status is required'
        }
      });
    }

    // Check if order belongs to vendor
    const { data: existingOrder, error: checkError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('vendor_id', id)
      .single();

    if (checkError || !existingOrder) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Order not found or access denied'
        }
      });
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('vendor_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating order status:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update order status'
        }
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
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
 * @route   DELETE /api/vendor/delete-account
 * @desc    Delete vendor account and all associated data
 * @access  Private
 */
router.delete('/delete-account', protect, async (req, res) => {
  try {
    const { id } = req.user;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid confirmation. Please type "DELETE" to confirm.'
        }
      });
    }

    // Delete all associated data in the correct order (due to foreign key constraints)
    
    // 1. Delete order items (through orders)
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('vendor_id', id);

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
      .eq('vendor_id', id);

    // 3. Delete products
    await supabaseAdmin
      .from('products')
      .delete()
      .eq('vendor_id', id);

    // 4. Finally, delete the vendor
    const { error } = await supabaseAdmin
      .from('vendors')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting vendor:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete account'
        }
      });
    }

    res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;

