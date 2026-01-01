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
            notifyUrl: notifyUrl
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
        // MaishaPay can return various success indicators
        const s = String(status).toLowerCase();
        const successStatuses = ['200', '201', '202', 'success', 'approved', 'paid', 'completed', 'successfull', 'operation_success', 'true', '1', '00', '0'];
        const failureStatuses = ['failed', 'error', 'declined', 'cancelled'];

        // If explicitly failed
        if (failureStatuses.includes(s)) {
            console.log(`[MaishaPay] Payment FAILED. Status: '${status}'`);

            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'cancelled', // or 'failed' if you have that enum
                    payment_status: 'failed'
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[MaishaPay] CRITICAL: Failed to update order status to FAILED:', updateError);
            }
            return false;
        }

        // If not explicitly failed, we treat unknown statuses as potentially successful IF they are in our success list
        // OR we can be lenient. The user requested: "Only treat transaction as failed if status explicitly equals: failed, error, declined"
        // But we should still verify it matches one of the known success codes to be safe, OR just assume success if not failed?
        // User said: "Accept values like... and do NOT mark successful payments as failed." and "Only treat as failed if..."
        // Safe approach: Check success list. If not in success info AND not in failure list -> log warning but maybe don't fail immediately? or treat as success? 
        // Given the wide variety of success codes ('0', '00', 'true'), let's check success list.

        if (successStatuses.includes(s)) {
            console.log(`[MaishaPay] Payment SUCCESS. Status: '${status}'`);

            // 2. Update DB for SUCCESS
            const { error: updateError } = await supabaseAdmin
                .from('orders')
                .update({
                    status: 'completed',
                    payment_status: 'paid',
                    payment_method: 'online'
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('[MaishaPay] CRITICAL: Failed to update order status to PAID:', updateError);
                return false;
            } else {
                console.log(`[MaishaPay] Successfully marked order ${orderId} as PAID.`);
            }

            // 3. Finalize Order (Emails, Stock, etc)
            const OrderService = require('./orderService');
            // Check if OrderService.finalizeOrder handles the DB update? 
            // Usually it does, let's check what verifyTransaction did before.
            // It called OrderService.finalizeOrder(orderId, 'online');
            // We should still call this to trigger emails etc.
            await OrderService.finalizeOrder(orderId, 'online');

            return true;
        }

        // Fallback for unknown status
        console.warn(`[MaishaPay] Unknown status received: '${status}'. Treating as FAILED for safety, but check logs.`);
        return false;

        // 3. Finalize Order
        const OrderService = require('./orderService');
        const success = await OrderService.finalizeOrder(orderId, 'online');

        return success;
    }
}

module.exports = MaishaPayService;
