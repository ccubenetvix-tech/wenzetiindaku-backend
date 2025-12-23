// Helper to finalize order (clear cart, send emails)
const finalizeOrder = async (orderId, customerId, reqUser) => {
    // 1. Fetch created order with items
    const { data: order, error: fetchError } = await supabaseAdmin
        .from('orders')
        .select(`
      *,
      order_items (
        *,
        product:products (
          *,
          vendor:vendors (*)
        )
      )
    `)
        .eq('id', orderId)
        .single();

    if (fetchError || !order) {
        console.error('Finalize Order: Failed to fetch order', fetchError);
        return false;
    }

    // 2. Group items by vendor for emails
    const itemsByVendor = {};
    const cartItemIds = [];

    order.order_items.forEach(item => {
        const vendorId = item.product.vendor_id;
        if (!itemsByVendor[vendorId]) itemsByVendor[vendorId] = [];
        itemsByVendor[vendorId].push(item);
        // We don't have cart item IDs here directly unless we stored them or query them.
        // For now, we'll query cart items for this customer and these products to delete them.
    });

    // 3. Clear Cart (More robust: delete all cart items for this customer that match purchased product IDs)
    const productIds = order.order_items.map(i => i.product_id);
    if (productIds.length > 0) {
        await supabaseAdmin
            .from('cart')
            .delete()
            .eq('customer_id', customerId)
            .in('product_id', productIds);
    }

    // 4. Send Emails
    const emailNotifications = [];
    const shippingAddress = order.shipping_address;

    // Vendor Emails
    for (const [vendorId, items] of Object.entries(itemsByVendor)) {
        const vendor = items[0].product.vendor;
        if (vendor && vendor.business_email) {
            const emailItems = items.map(item => ({
                name: item.product.name,
                quantity: item.quantity,
                price: item.price
            }));

            emailNotifications.push(
                emailService.sendVendorNewOrderEmail({
                    vendorEmail: vendor.business_email,
                    vendorName: vendor.business_name,
                    customerName: shippingAddress.fullName || 'Customer',
                    customerEmail: shippingAddress.email,
                    orderId: order.id,
                    totalAmount: order.total_amount, // slightly inaccurate if multi-vendor order split, but ok for now
                    paymentMethod: order.payment_method,
                    shippingAddress: shippingAddress,
                    items: emailItems
                }).catch(err => console.error('Vendor email failed', err))
            );
        }
    }

    // Customer Email
    if (shippingAddress.email) {
        emailNotifications.push(
            emailService.sendCustomerOrderConfirmation({
                customerEmail: shippingAddress.email,
                customerName: shippingAddress.fullName || 'Customer',
                orders: [order], // Passing single order as array to match existing structure
                paymentMethod: order.payment_method,
                shippingAddress: shippingAddress
            }).catch(err => console.error('Customer email failed', err))
        );
    }

    await Promise.allSettled(emailNotifications);
    return true;
};

// ... existing routes ...

/**
 * @route   POST /api/customer/orders/verify-payment
 * @desc    Verify Stripe payment and finalize order
 * @access  Private
 */
router.post('/orders/verify-payment', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const customerId = req.user.id;

        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Session ID required' });
        }

        // 1. Retrieve session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        // 2. Check payment status
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ success: false, message: 'Payment not completed' });
        }

        // 3. Find order associated with this session (metadata or verify by amount/time - assuming we stored session_id or just find pending order)
        // Ideally, we stored session_id in the order, or order_id in session metadata.
        // Let's assume we put order_id in session metadata.
        const orderId = session.metadata.orderId;

        if (!orderId) {
            return res.status(400).json({ success: false, message: 'No order attached to session' });
        }

        // 4. Update Order Status
        const { data: order, error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
                status: 'processing', // or 'confirmed'
                payment_status: 'paid',
                payment_details: { sessionId: session.id, paymentIntent: session.payment_intent }
            })
            .eq('id', orderId)
            .eq('customer_id', customerId) // Security check
            .select()
            .single();

        if (updateError || !order) {
            return res.status(400).json({ success: false, message: 'Order update failed or order not found' });
        }

        // 5. Finalize (Emails, Cart) - Only if not already finalized
        // We can check if emails were already sent or just rely on 'payment_status' transition.
        // Since we just updated to 'paid', we do it now.
        await finalizeOrder(orderId, customerId, req.user);

        res.json({ success: true, message: 'Payment verified and order confirmed', data: { order } });

    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});
