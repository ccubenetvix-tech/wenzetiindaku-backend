const crypto = require('crypto');

/**
 * Maisha Pay Utility
 * Handles interaction with Maisha Pay Gateway
 */

// Configuration
// Configuration
const getBaseUrl = () => {
    // Official Endpoint for both Sandbox and Live
    return 'https://marchand.maishapay.online/payment/vers1.0/merchant/checkout';
};

const getPublicApiKey = () => process.env.MAISHAPAY_API_KEY;
const getSecretApiKey = () => process.env.MAISHAPAY_API_SECRET;
const getGatewayMode = () => {
    const mode = process.env.MAISHAPAY_MODE || 'sandbox';
    return mode === 'live' ? 1 : 0;
};

/**
 * Generate Payment Data for Maisha Pay
 * @param {Object} order - The order object
 * @param {string} order.id - Unique Order ID
 * @param {number} order.total_amount - Total amount
 * @param {string} customerEmail - Customer email
 * @returns {Object} { url, fields } - The target URL and the form fields to submit
 */
const generatePaymentData = (order, customerEmail) => {
    // Field names must match Maisha Pay documentation exactly:
    // gatewayMode: 0 (Sandbox) or 1 (Live)
    // publicApiKey: Public API Key
    // secretApiKey: Secret API Key
    // montant: Amount
    // devise: Currency (USD, CDF, FCFA, EURO)
    // callbackUrl: Redirect URL after payment

    const fields = {
        gatewayMode: getGatewayMode(),
        publicApiKey: getPublicApiKey(),
        secretApiKey: getSecretApiKey(),
        montant: order.total_amount,
        devise: 'USD',
        callbackUrl: `${process.env.FRONTEND_URL}/checkout/success`, // Redirects here with ?status=... params

        // Optional/Extra fields that might be useful if supported or for internal tracking, 
        // but strictly following the mandatory list from docs:
        // 'reference': order.id, 
        // 'description': `Order ${order.id}`,
    };

    return {
        url: getBaseUrl(),
        fields: fields
    };
};

/**
 * Verify Payment Status
 * Note: This usually involves checking an IPN or querying the API.
 * For the redirect flow, we might trust the return_url parameters if signed, 
 * but for security, we should ideally query Maisha Pay.
 * Since we don't have the full API Verification docs hooked up, 
 * we will assume if the frontend returns successfully to the success page 
 * checking the status via an API call would be next.
 * 
 * For this implementation, we will mock the verification 
 * or check if the 'status' param in the return URL is 'success' (common pattern).
 */
const verifyPayment = async (orderId) => {
    // TODO: Implement actual server-to-server verification with Maisha Pay API
    // Return true for now to allow flow testing if strictly relying on redirect.
    // In production, this MUST verify with Maisha Pay servers.
    console.log(`[MaishaPay] Verifying payment for Order ${orderId}`);
    return true;
};

module.exports = {
    generatePaymentData,
    verifyPayment
};
