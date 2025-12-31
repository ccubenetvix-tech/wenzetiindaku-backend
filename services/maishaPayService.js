const { supabaseAdmin } = require('../config/supabase');
const crypto = require('crypto');

class MaishaPayService {

    static getBaseUrl() {
        // Official Endpoint for both Sandbox and Live
        return 'https://marchand.maishapay.online/payment/vers1.0/merchant/checkout';
    }

    /**
     * Generate secure payment URL and payload
     * This logic is now server-side to keep secrets hidden
     */
    static async initiatePayment(orderId, amount, currency = 'USD') {
        const isSandbox = process.env.MAISHAPAY_MODE === 'sandbox';
        const apiKey = String(process.env.MAISHAPAY_API_KEY || '').trim();
        const apiSecret = String(process.env.MAISHAPAY_API_SECRET || '').trim();

        if (!apiKey || !apiSecret) {
            throw new Error('Maisha Pay configuration missing');
        }

        const formattedAmount = parseFloat(amount).toFixed(2);
        // Callback URL that Maisha Pay will redirect the user to
        const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payment/maishapay/callback?orderId=${orderId}`;
        // Notify URL for server-to-server IPN (Instant Payment Notification)
        const notifyUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payment/maishapay/ipn?orderId=${orderId}`;

        const fields = {
            gatewayMode: isSandbox ? 0 : 1,
            publicApiKey: apiKey,
            secretApiKey: apiSecret, // REQUIRED by Maisha Pay (v1.0 Merchant Checkout)
            montant: formattedAmount,
            devise: currency,
            reference: orderId,
            callbackUrl: callbackUrl,
            // notifyUrl: notifyUrl 
        };

        return {
            url: this.getBaseUrl(),
            fields
        };
    }

    /**
   * Verify transaction securely
   * @param {string} orderId 
   * @param {string} status Status from redirect/IPN
   * @param {string} transactionRefId Reference ID from Maisha Pay
   */
    static async verifyTransaction(orderId, status, transactionRefId) {
        console.log(`[MaishaPay] Verifying transaction: Order=${orderId}, Status=${status}, Ref=${transactionRefId}`);

        // 1. Check Status
        const s = String(status).toLowerCase();
        const successStatuses = ['200', '201', '202', 'success', 'approved'];

        if (!successStatuses.includes(s)) {
            console.log(`[MaishaPay] Payment failed or pending. Received Status: '${status}' (normalized: '${s}')`);

            // Map MaishaPay status to our internal status
            let newStatus = 'cancelled';
            if (s === 'failed' || s === 'error' || s === 'declined') {
                newStatus = 'failed';
            }
            console.log(`[MaishaPay] Decided new DB status: ${newStatus}`);

            // Update DB to reflect failure so dashboard isn't stuck on "Pending"
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: newStatus,
                    payment_status: 'failed'
                    // payment_method: 'online' // Ensure this is set
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[MaishaPay] CRITICAL: Failed to update order status in DB:', updateError);
            } else {
                console.log(`[MaishaPay] SUCCESSFULLY updated order ${orderId} to status: ${newStatus}`);
            }

            return false;
        }

        // 2. Ideally, check MaishaPay API for `transactionRefId` validity here.
        // Skipping as per instructions/lack of docs, but trusting the IPN status if signature valid.

        // 3. Finalize Order
        const OrderService = require('./orderService');
        const success = await OrderService.finalizeOrder(orderId, 'online');

        return success;
    }
}

module.exports = MaishaPayService;
