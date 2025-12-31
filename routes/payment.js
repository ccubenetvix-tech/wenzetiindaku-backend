const express = require('express');
const router = express.Router();
const MaishaPayService = require('../services/maishaPayService');
const { supabaseAdmin } = require('../config/supabase');
const emailService = require('../utils/email');

// Debug log to confirm reload
console.log('PAYMENT ROUTES LOADED');

// Log every request hitting this router
router.use((req, res, next) => {
    console.log(`[Payment Router Hit] Method: ${req.method} | URL: ${req.url} | Base: ${req.baseUrl} | Path: ${req.path}`);
    next();
});

/**
 * @route   POST /api/payment/initiate
 * @desc    Initiate Maisha Pay payment (Server-side)
 * @access  Private (Authenticated Users)
 */
// Start payment flow - This is called by the frontend instead of generating form data there
router.post('/initiate', async (req, res) => {
    try {
        const { orderId } = req.body;

        // 1. Fetch Order
        const { data: order, error } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // 2. Generate Payment Data (Secrets stay on server)
        const currency = 'USD'; // Simplified for now
        const payload = await MaishaPayService.initiatePayment(order.id, order.total_amount, currency);

        // 3. Response 
        res.json({
            success: true,
            data: payload
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({ success: false, message: 'Failed to initiate payment' });
    }
});

/**
 * @route   GET /api/payment/maishapay/callback
 * @desc    Handle redirect from Maisha Pay
 * @access  Public
 */
// Handle trailing slash and any other variations dynamically using Wildcard
router.get('/maishapay/callback*', async (req, res) => {
    try {
        // Maisha Pay returns parameters in query (GET) or body (POST) usually.
        // We handle case variations just to be safe.
        const q = req.query;
        // Parse params from query first, but if empty, check if they are buried in req.params (wildcard side-effect?)
        // Express puts wildcard matches in req.params[0]

        let reference = q.orderId || q.reference || q.Reference;
        let status = q.status || q.Status;
        const transactionid = q.transactionid || q.transactionId || q.transaction_id || q.TransactionID;
        const description = q.description || q.Description || 'Payment Failed';

        // Defensive: Gateway might append /?status=400 to the value
        // Example: "UUID/?status=400" or "UUID/"
        if (reference) {
            // 1. Recover status if buried in reference string
            if (!status && reference.includes('status=')) {
                const match = reference.match(/status=([^&]*)/);
                if (match) status = match[1];
            }
            // 2. Clean the reference (remove everything after first / or ?)
            reference = reference.split('?')[0].split('/')[0];
        }

        if (!reference) {
            console.error('[MaishaPay Callback] Missing reference. Query:', q);
            return res.status(400).send('Missing order reference');
        }

        console.log('[MaishaPay Callback] Received:', req.query);

        // Verify and Update Order
        const success = await MaishaPayService.verifyTransaction(reference, status, transactionid);

        if (success) {
            // Processing logic (emails etc) can be triggered here or inside Service
            // For now, redirect to Frontend Success Page
            // CRITICAL: We forward params so frontend verification loop works
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const redirectUrl = `${frontendUrl}/checkout/success?session_id=${reference}&status=${status}&transactionRefId=${transactionid}`;
            return res.redirect(redirectUrl);
        } else {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const reason = description || q.status || 'payment_failed';
            return res.redirect(`${frontendUrl}/checkout/failure?reason=${encodeURIComponent(reason)}`);
        }

    } catch (error) {
        console.error('Payment callback error:', error);
        res.status(500).send('Internal Server Error during payment processing');
    }
});

/**
 * @route   POST /api/payment/maishapay/ipn
 * @desc    Server-to-Server Notification (Webhook)
 * @access  Public
 */
router.post('/maishapay/ipn', async (req, res) => {
    try {
        console.log('[MaishaPay IPN] Received:', req.body);
        const b = req.body;
        const reference = b.reference || b.Reference || b.orderId;
        const status = b.status || b.Status;
        const transactionid = b.transactionid || b.transactionId || b.transaction_id || b.TransactionID;

        if (!reference) return res.status(400).send('Missing reference');

        // Verify and Update
        const success = await MaishaPayService.verifyTransaction(reference, status, transactionid);

        if (success) {
            res.status(200).send('OK');
        } else {
            // If validation fails (e.g. status was failed), we strictly accept the IPN but log it.
            // We don't want Maisha Pay to keep retrying if it's a valid "Failed" message.
            res.status(200).send('Received');
        }

    } catch (error) {
        console.error('IPN Error:', error);
        res.status(500).send('Error');
    }
});

module.exports = router;
