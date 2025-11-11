const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const emailService = require('../utils/email');
const { authenticateToken, protect, requireRole, requireVerification } = require('../middleware/auth');

const router = express.Router();

// Handle OPTIONS requests for CORS preflight
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(requireRole(['customer']));

/**
 * @route   GET /api/customer/profile
 * @desc    Get customer profile
 * @access  Private
 */
router.get('/profile', async (req, res) => {
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

    // Determine registration method
    let registrationMethod = 'email';
    if (customer.google_id) {
      registrationMethod = 'google';
    } else if (customer.profile_photo && customer.verified && !customer.password) {
      // Fallback: If user has profile photo, is verified, and has no password, likely Google
      registrationMethod = 'google';
    }

    // Debug logging
    console.log('Customer profile data:', {
      id: customer.id,
      email: customer.email,
      google_id: customer.google_id,
      profile_photo: customer.profile_photo,
      verified: customer.verified,
      password: customer.password ? 'exists' : 'null',
      registrationMethod: registrationMethod
    });

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
          lastLogin: customer.last_login,
          registrationMethod: registrationMethod
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
router.put('/profile', async (req, res) => {
  try {
    const { id } = req.user;
    const {
      firstName,
      lastName,
      profilePhoto,
      gender,
      address,
      phoneNumber,
      dateOfBirth,
      currentPassword,
      newPassword
    } = req.body;

    const { data: existingCustomer, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingCustomer) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Customer not found'
        }
      });
    }

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

    // Handle password update
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Current password is required to change password'
          }
        });
      }

      if (!existingCustomer.password) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Password change is not available for Google sign-in accounts'
          }
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, existingCustomer.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Current password is incorrect'
          }
        });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedNewPassword;
    }

    // Check if profile is being completed
    const isProfileCompletion = !existingCustomer.profile_completed &&
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
          gender: customer.gender,
          address: customer.address,
          phoneNumber: customer.phone_number,
          dateOfBirth: customer.date_of_birth,
          role: customer.role,
          verified: customer.verified,
          profile_completed: customer.profile_completed,
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
 * @route   POST /api/customer/orders
 * @desc    Create new orders from cart items
 * @access  Private
 */
router.post('/orders', requireVerification, async (req, res) => {
  try {
    const customerId = req.user.id;
    const {
      paymentMethod,
      shippingAddress,
      saveAddressToProfile = false
    } = req.body || {};

    const paymentMethodMap = {
      cod: 'cod',
      'cash_on_delivery': 'cod',
      cash: 'cod',
      pod: 'cod',
      delivery: 'cod',
      online: 'online',
      card: 'online',
      stripe: 'online',
      upi: 'online'
    };

    const normalizedPaymentMethodKey = typeof paymentMethod === 'string'
      ? paymentMethodMap[paymentMethod.trim().toLowerCase()]
      : null;

    if (!normalizedPaymentMethodKey) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Unsupported payment method'
        }
      });
    }

    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Shipping address is required'
        }
      });
    }

    const requiredFields = ['fullName', 'email', 'phone', 'street1', 'city', 'state', 'postalCode', 'country'];
    for (const field of requiredFields) {
      const value = shippingAddress[field];
      if (typeof value !== 'string' || !value.trim()) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Missing or invalid shipping address field: ${field}`
          }
        });
      }
    }

    const sanitizeValue = (value) => (typeof value === 'string' ? value.trim() : '');

    const shippingAddressPayload = {
      fullName: sanitizeValue(shippingAddress.fullName),
      email: sanitizeValue(shippingAddress.email),
      phone: sanitizeValue(shippingAddress.phone),
      street1: sanitizeValue(shippingAddress.street1),
      ...(shippingAddress.street2 ? { street2: sanitizeValue(shippingAddress.street2) } : {}),
      city: sanitizeValue(shippingAddress.city),
      state: sanitizeValue(shippingAddress.state),
      postalCode: sanitizeValue(shippingAddress.postalCode),
      country: sanitizeValue(shippingAddress.country),
      ...(shippingAddress.label ? { label: sanitizeValue(shippingAddress.label) } : {}),
      createdAt: new Date().toISOString()
    };

    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from('cart')
      .select(`
        id,
        quantity,
        product_id,
        product:products (
          id,
          name,
          price,
          images,
          vendor_id,
          status,
          stock,
          vendor:vendors (
            id,
            business_name,
            business_email
          )
        )
      `)
      .eq('customer_id', customerId);

    if (cartError) {
      console.error('Order creation cart fetch error:', cartError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to retrieve cart items'
        }
      });
    }

    const validCartItems = (cartItems || []).filter((item) => item.product && item.product.vendor_id);

    if (validCartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cart is empty or contains invalid items'
        }
      });
    }

    const itemsGroupedByVendor = validCartItems.reduce((acc, item) => {
      const vendorId = item.product.vendor_id;
      if (!acc[vendorId]) {
        acc[vendorId] = [];
      }
      acc[vendorId].push(item);
      return acc;
    }, {});

    const ordersCreated = [];
    const cartItemIdsToDelete = [];
    const emailNotifications = [];

    for (const [vendorId, vendorItems] of Object.entries(itemsGroupedByVendor)) {
      const orderId = uuidv4();
      const vendorTotal = vendorItems.reduce((sum, item) => {
        const price = typeof item.product.price === 'number'
          ? item.product.price
          : Number.parseFloat(item.product.price);
        const safePrice = Number.isFinite(price) ? price : 0;
        return sum + safePrice * item.quantity;
      }, 0);

      const vendorInfo = vendorItems[0]?.product?.vendor ?? null;
      const orderPayload = {
        id: orderId,
        customer_id: customerId,
        vendor_id: vendorId,
        total_amount: Number.parseFloat(vendorTotal.toFixed(2)),
        status: normalizedPaymentMethodKey === 'cod' ? 'pending' : 'payment_pending',
        shipping_address: shippingAddressPayload,
        payment_method: normalizedPaymentMethodKey,
        payment_status: normalizedPaymentMethodKey === 'cod' ? 'pending' : 'pending'
      };

      const { data: order, error: orderInsertError } = await supabaseAdmin
        .from('orders')
        .insert([orderPayload])
        .select('*')
        .single();

      if (orderInsertError || !order) {
        console.error('Order insert error:', orderInsertError);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create order'
          }
        });
      }

      const orderItemsPayload = vendorItems.map((item) => {
        const price = typeof item.product.price === 'number'
          ? item.product.price
          : Number.parseFloat(item.product.price);
        return {
          id: uuidv4(),
          order_id: orderId,
          product_id: item.product.id,
          quantity: item.quantity,
          price: Number.isFinite(price) ? price : 0,
          created_at: new Date().toISOString()
        };
      });

      const { data: insertedItems, error: orderItemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItemsPayload)
        .select('*');

      if (orderItemsError) {
        console.error('Order items insert error:', orderItemsError);
        await supabaseAdmin.from('orders').delete().eq('id', orderId);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create order items'
          }
        });
      }

      ordersCreated.push({
        ...order,
        vendor: vendorInfo
          ? {
              id: vendorInfo.id,
              business_name: vendorInfo.business_name,
              business_email: vendorInfo.business_email
            }
          : null,
        order_items: insertedItems || []
      });

      cartItemIdsToDelete.push(...vendorItems.map((item) => item.id));

      const emailItems = vendorItems.map((item) => {
        const price = typeof item.product.price === 'number'
          ? item.product.price
          : Number.parseFloat(item.product.price);
        return {
          name: item.product.name,
          quantity: item.quantity,
          price: Number.isFinite(price) ? price : 0
        };
      });

      if (vendorInfo?.business_email) {
        emailNotifications.push(
          emailService.sendVendorNewOrderEmail({
            vendorEmail: vendorInfo.business_email,
            vendorName: vendorInfo.business_name,
            customerName: shippingAddressPayload.fullName || shippingAddressPayload.name || req.user.first_name || 'Customer',
            customerEmail: shippingAddressPayload.email || req.user.email,
            orderId,
            totalAmount: orderPayload.total_amount,
            paymentMethod: orderPayload.payment_method,
            shippingAddress: shippingAddressPayload,
            items: emailItems
          }).catch((error) => {
            console.error('Failed to send vendor new order email:', error);
          })
        );
      }
    }

    if (cartItemIdsToDelete.length > 0) {
      const { error: clearCartError } = await supabaseAdmin
        .from('cart')
        .delete()
        .in('id', cartItemIdsToDelete);

      if (clearCartError) {
        console.error('Failed to clear cart after order creation:', clearCartError);
      }
    }

    if (saveAddressToProfile) {
      const { error: updateProfileError } = await supabaseAdmin
        .from('customers')
        .update({
          address: shippingAddressPayload,
          phone_number: shippingAddressPayload.phone
        })
        .eq('id', customerId);

      if (updateProfileError) {
        console.error('Failed to update customer profile with new address:', updateProfileError);
      }
    }

    if (shippingAddressPayload.email) {
      emailNotifications.push(
        emailService.sendCustomerOrderConfirmation({
          customerEmail: shippingAddressPayload.email,
          customerName: shippingAddressPayload.fullName || req.user.first_name || 'Customer',
          orders: ordersCreated,
          paymentMethod: normalizedPaymentMethodKey,
          shippingAddress: shippingAddressPayload
        }).catch((error) => {
          console.error('Failed to send customer order confirmation email:', error);
        })
      );
    }

    if (emailNotifications.length > 0) {
      await Promise.allSettled(emailNotifications);
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        orders: ordersCreated,
        payment: {
          method: normalizedPaymentMethodKey,
          status: normalizedPaymentMethodKey === 'cod' ? 'pending' : 'pending'
        }
      }
    });
  } catch (error) {
    console.error('Create customer order error:', error);
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
router.get('/orders', requireVerification, async (req, res) => {
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
router.get('/orders/:orderId', requireVerification, async (req, res) => {
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
router.get('/wishlist', requireVerification, async (req, res) => {
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
router.post('/wishlist', requireVerification, async (req, res) => {
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
router.delete('/wishlist/:productId', requireVerification, async (req, res) => {
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

/**
 * @route   DELETE /api/customer/delete-account
 * @desc    Delete customer account and all associated data
 * @access  Private
 */
router.delete('/delete-account', async (req, res) => {
  try {
    const { id } = req.user;
    const { confirmation } = req.body;

    // Verify confirmation
    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid confirmation. Please type "DELETE" to confirm account deletion.'
        }
      });
    }

    // Delete customer from customers table
    const { error: customerError } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', id);

    if (customerError) {
      console.error('Delete customer error:', customerError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete customer account'
        }
      });
    }

    // Delete user from auth.users table
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (authError) {
      console.error('Delete auth user error:', authError);
      // Customer is already deleted, but auth user deletion failed
      // This is not critical as the customer data is gone
    }

    res.json({
      success: true,
      message: 'Account successfully deleted'
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

/**
 * @route   POST /api/customer/fix-registration-method
 * @desc    Fix registration method for users who registered with Google but don't have google_id
 * @access  Private
 */
router.post('/fix-registration-method', async (req, res) => {
  try {
    const { id } = req.user;
    const { registrationMethod } = req.body;

    if (!registrationMethod || !['google', 'email'].includes(registrationMethod)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid registration method'
        }
      });
    }

    const updateData = {};
    if (registrationMethod === 'google') {
      // Set a placeholder google_id to indicate Google registration
      updateData.google_id = `google_${id}`;
    }

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating registration method:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to update registration method'
        }
      });
    }

    res.json({
      success: true,
      message: 'Registration method updated successfully',
      data: {
        customer: {
          id: customer.id,
          registrationMethod: customer.google_id ? 'google' : 'email'
        }
      }
    });

  } catch (error) {
    console.error('Fix registration method error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;

