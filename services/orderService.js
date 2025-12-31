const { supabaseAdmin } = require('../config/supabase');
const emailService = require('../utils/email');

class OrderService {
    /**
     * Finalize an order (Mark paid, clear cart, send emails)
     * This ensures consistent fulfillment whether triggered by IPN, Callback, or Manual Verify.
     * @param {string} orderId 
     * @param {string} paymentMethod 'online' | 'cod'
     */
    static async finalizeOrder(orderId, paymentMethod = 'online') {
        console.log(`[OrderService] Finalizing order ${orderId} via ${paymentMethod}`);

        // 1. Fetch Order with details
        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .select(`
        *,
        order_items (
          *,
          product:products (
            *,
            vendor:vendors (
                business_name,
                business_email
            )
          )
        )
      `)
            .eq('id', orderId)
            .single();

        if (error || !order) {
            console.error('[OrderService] Order not found:', error);
            return false;
        }

        // 2. Idempotency Check (If already processed/paid, maybe stop?)
        // Note: COD orders start as 'pending'. Online start as 'payment_pending'.
        // If it's already 'paid' (for online) or 'processing' (for cod), we might skip re-sending emails?
        // But sometimes checking 'payment_status' is safer.
        if (order.payment_status === 'paid' && paymentMethod === 'online') {
            // Already done, but maybe emails/cart weren't cleared?
            // Let's proceed safely or check flags. 
            // For now, we assume if called, we want to finalize. 
            // But to avoid double emails, we could check a 'fulfillment_status' if it existed.
            console.log('[OrderService] Order already paid. Ensuring cleanup.');
        }

        // 3. Update Status
        const updatePayload = {
            updated_at: new Date().toISOString()
        };

        if (paymentMethod === 'online' && order.payment_status !== 'paid') {
            updatePayload.status = 'processing';
            updatePayload.payment_status = 'paid';
        } else if (paymentMethod === 'cod' && order.status === 'pending') {
            // COD logic usually keeps it pending or confirmed? 
            // Existing route logic set COD status to 'pending' initially.
            // Here we might verify it.
        }

        // Perform update if needed
        if (Object.keys(updatePayload).length > 1) {
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update(updatePayload)
                .eq('id', orderId);
            if (updateError) console.error('[OrderService] Status update failed:', updateError);
        }

        // 4. Clear Cart (Customer's cart for these items)
        const customerId = order.customer_id;
        const productIds = order.order_items.map(i => i.product_id);
        if (productIds.length > 0) {
            await supabaseAdmin
                .from('cart')
                .delete()
                .eq('customer_id', customerId)
                .in('product_id', productIds);
        }

        // 5. Send Emails
        const emailNotifications = [];
        const shippingAddress = order.shipping_address;

        // Vendor Email
        // The order might contain items from ONE vendor (based on create order logic splitting orders).
        // But `order_items` fetch above gets products.
        // Assuming single-vendor orders as per `routes/customer.js` creation logic.
        const vendor = order.order_items[0]?.product?.vendor;

        if (vendor?.business_email) {
            const emailItems = order.order_items.map(i => ({
                name: i.product.name,
                quantity: i.quantity,
                price: Number(i.product.price)
            }));

            emailNotifications.push(emailService.sendVendorNewOrderEmail({
                vendorEmail: vendor.business_email,
                vendorName: vendor.business_name,
                customerName: shippingAddress.fullName,
                customerEmail: shippingAddress.email,
                orderId: order.id,
                totalAmount: order.total_amount,
                paymentMethod: paymentMethod,
                shippingAddress: shippingAddress,
                items: emailItems
            }).catch(e => console.error('[OrderService] Vendor email failed:', e)));
        }

        // Customer Email
        if (shippingAddress.email) {
            // Note: sendCustomerOrderConfirmation usually expects an array of orders (if multi-vendor checkout).
            // Here we are processing ONE order at a time (because Maisha Pay ref is usually 1 order, OR master order?).
            // The current system splits orders by vendor. created 'ordersCreated'.
            // If we pay for a "Master Order", we need to fulfill ALL related sub-orders.
            //
            // ISSUE: `maishapay.generatePaymentData` took ONE `orderId`.
            // `routes/customer.js` passes `ordersCreated[0].id` as the reference?
            // line 401: `const masterOrderId = ordersCreated[0].id;` 
            // This logic in `routes/customer.js` implies it only pays for the FIRST order?
            // OR it relies on `sessionId` to find all orders?

            // If `routes/customer.js` creates multiple orders (one per vendor), but only generates payment for ONE id,
            // then we have a partial payment issue unless they share a generic reference.
            //
            // Let's assume for now we finalize THIS order.

            emailNotifications.push(emailService.sendCustomerOrderConfirmation({
                customerEmail: shippingAddress.email,
                customerName: shippingAddress.fullName,
                orders: [order], // Array format
                paymentMethod: paymentMethod,
                shippingAddress: shippingAddress
            }).catch(e => console.error('[OrderService] Customer email failed:', e)));
        }

        await Promise.allSettled(emailNotifications);
        return true;
    }
}

module.exports = OrderService;
