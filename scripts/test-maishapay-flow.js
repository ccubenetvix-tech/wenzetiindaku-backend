require('dotenv').config();
const { supabaseAdmin } = require('../config/supabase');
const MaishaPayService = require('../services/maishaPayService');
const OrderService = require('../services/orderService');
const { v4: uuidv4 } = require('uuid');

async function testMaishaPayFlow() {
    console.log('🚀 Starting Maisha Pay Flow Verification...\n');

    let customerId, vendorId, productId, orderId;

    try {
        // --- 1. SETUP TEST DATA ---
        console.log('1. Setting up test data...');

        // Create/Get Customer
        const email = `test_customer_${Date.now()}@example.com`;
        const { data: customer, error: custError } = await supabaseAdmin
            .from('customers')
            .insert([{
                email,
                first_name: 'Test',
                last_name: 'User',
                password: 'hashed_password_placeholder',
                verified: true
            }])
            .select()
            .single();
        if (custError) throw custError;
        customerId = customer.id;
        console.log(`   - Created Customer: ${customerId}`);

        // Create/Get Vendor
        const { data: vendor, error: vendError } = await supabaseAdmin
            .from('vendors')
            .insert([{
                business_name: 'Test Vendor',
                business_email: `vendor_${Date.now()}@example.com`,
                business_phone: '1234567890',
                business_address: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                country: 'Test Country',
                postal_code: '12345',
                business_type: 'Retail',
                description: 'Test Vendor',
                categories: ['Test'],
                password: 'hashed_password_placeholder',
                approved: true,
                verified: true
            }])
            .select()
            .single();
        if (vendError) throw vendError;
        vendorId = vendor.id;
        console.log(`   - Created Vendor: ${vendorId}`);

        // Create Product
        const { data: product, error: prodError } = await supabaseAdmin
            .from('products')
            .insert([{
                name: 'Test Product',
                description: 'Description',
                price: 100,
                stock: 10,
                status: 'published',
                vendor_id: vendorId,
                category: 'Test'
            }])
            .select()
            .single();
        if (prodError) throw prodError;
        productId = product.id;
        console.log(`   - Created Product: ${productId}`);

        // Add to Cart for this customer (to test clearing later)
        // We use insert directly to skip service logic/RPC for speed, or use RPC if exists.
        // Let's use direct insert to ensure cart has something.
        const { error: cartError } = await supabaseAdmin
            .from('cart')
            .insert({
                customer_id: customerId,
                product_id: productId,
                quantity: 1
            });
        if (cartError) throw cartError;
        console.log(`   - Added item to Cart`);

        // Create Order (Pending)
        // Matches logic in routes/customer.js
        const orderPayload = {
            customer_id: customerId,
            vendor_id: vendorId,
            total_amount: 100,
            status: 'payment_pending',
            shipping_address: { fullName: 'Test', email: email },
            payment_method: 'online', // Maisha Pay is 'online'
            payment_status: 'pending'
        };
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert([orderPayload])
            .select()
            .single();
        if (orderError) throw orderError;
        orderId = order.id;
        console.log(`   - Created Order: ${orderId} (Status: ${order.status}, Payment: ${order.payment_status})`);

        // Link Order Item
        await supabaseAdmin.from('order_items').insert({
            order_id: orderId,
            product_id: productId,
            quantity: 1,
            price: 100
        });

        // --- 2. TEST INITIATION ---
        console.log('\n2. Testing Payment Initiation...');
        const initResult = await MaishaPayService.initiatePayment(orderId, 100, 'USD');

        if (!initResult.url || !initResult.fields.publicApiKey) {
            throw new Error('Initiation returned invalid data');
        }
        if (!initResult.fields.secretApiKey) {
            throw new Error('CRITICAL: Secret Key MISSING in initiation payload (Required by Gateway)!');
        }
        console.log('   PASSED: Initiation returned valid URL and Fields (Includes Secret Key).');

        // --- 3. TEST VERIFICATION (Simulation) ---
        console.log('\n3. Testing Verification (Callback/IPN Simulation)...');
        // Simulate a success callback
        const mockTransactionRef = 'MP-TEST-TRANS-123';
        const success = await MaishaPayService.verifyTransaction(orderId, 'success', mockTransactionRef);

        if (!success) {
            throw new Error('Verification failed for valid inputs');
        }
        console.log('   PASSED: verifyTransaction returned true.');

        // --- 4. VERIFY ORDER STATUS (Fulfillment) ---
        console.log('\n4. Verifying Order Fulfillment...');
        const { data: updatedOrder } = await supabaseAdmin
            .from('orders')
            .select('status, payment_status')
            .eq('id', orderId)
            .single();

        if (updatedOrder.payment_status !== 'paid') {
            throw new Error(`Order payment_status is ${updatedOrder.payment_status}, expected 'paid'`);
        }
        if (updatedOrder.status !== 'processing') {
            throw new Error(`Order status is ${updatedOrder.status}, expected 'processing'`);
        }
        console.log(`   PASSED: Order updated to ${updatedOrder.status} / ${updatedOrder.payment_status}`);

        // --- 5. VERIFY CART CLEARED ---
        console.log('\n5. Verifying Cart Cleanup...');
        const { data: cartItems } = await supabaseAdmin
            .from('cart')
            .select('*')
            .eq('customer_id', customerId);

        if (cartItems.length > 0) {
            throw new Error(`Cart not cleared. Found ${cartItems.length} items.`);
        }
        console.log('   PASSED: Cart is empty.');

        console.log('\n✅ ALL MAISHA PAY TEST CASES PASSED!');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        // process.exit(1); 
    } finally {
        // Cleanup Test Data
        console.log('\nCleaning up test data...');
        if (customerId) await supabaseAdmin.from('customers').delete().eq('id', customerId);
        if (vendorId) await supabaseAdmin.from('vendors').delete().eq('id', vendorId);
        // Products/Orders cascade delete
    }
}

testMaishaPayFlow();
