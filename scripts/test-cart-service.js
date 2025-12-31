require('dotenv').config();
const { supabaseAdmin } = require('../config/supabase');
const CartService = require('../services/cartService');

async function testCartFlow() {
    console.log('Starting Cart Service Verification...');

    // Debug Env
    if (!process.env.SUPABASE_URL) {
        console.error('ERROR: SUPABASE_URL is missing from env');
        process.exit(1);
    } else {
        console.log('SUPABASE_URL is present.');
    }

    try {
        // 1. Setup: Get or Create Test Data
        console.log('1. Setting up test data...');

        // CUSTOMER
        let customerId;
        let { data: customer } = await supabaseAdmin.from('customers').select('id').limit(1).maybeSingle();

        if (!customer) {
            console.log('No customer found, creating test customer...');
            const { data: newCustomer, error: createError } = await supabaseAdmin.from('customers').insert([{
                first_name: 'Test',
                last_name: 'User',
                email: `test-${Date.now()}@example.com`,
                password: 'hashed-password',
                verified: true
            }]).select().single();
            if (createError) throw createError;
            customer = newCustomer;
        }
        customerId = customer.id;

        // VENDOR
        let vendorId;
        let { data: vendor } = await supabaseAdmin.from('vendors').select('id').eq('approved', true).limit(1).maybeSingle();

        if (!vendor) {
            console.log('No approved vendor found, creating test vendor...');
            const { data: newVendor, error: createError } = await supabaseAdmin.from('vendors').insert([{
                business_name: 'Test Vendor',
                business_email: `vendor-${Date.now()}@example.com`,
                business_phone: '1234567890',
                business_address: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                country: 'Test Country',
                postal_code: '12345',
                business_type: 'Retail',
                description: 'Test Description',
                categories: ['Test'],
                password: 'hashed-password',
                approved: true,
                verified: true
            }]).select().single();
            if (createError) throw createError;
            vendor = newVendor;
        }
        vendorId = vendor.id;

        // PRODUCT
        let productId;
        let productStock;
        let { data: product } = await supabaseAdmin
            .from('products')
            .select('id, stock, status')
            .gt('stock', 0)
            .in('status', ['published', 'active']) // Ensure it is published or active
            .eq('vendor_id', vendorId)
            .limit(1)
            .maybeSingle();

        if (!product) {
            console.log('No valid product found, creating test product...');
            const { data: newProduct, error: createError } = await supabaseAdmin.from('products').insert([{
                name: 'Test Product',
                description: 'Created for testing',
                price: 100,
                category: 'Test',
                stock: 20,
                status: 'published', // 'published' or 'active' are valid
                vendor_id: vendorId,
                images: ['https://example.com/image.jpg']
            }]).select().single();
            if (createError) throw createError;
            product = newProduct;
        }
        productId = product.id;
        productStock = product.stock;

        console.log(`Using Customer: ${customerId}`);
        console.log(`Using Vendor: ${vendorId}`);
        console.log(`Using Product: ${productId} (Stock: ${productStock})`);

        // 2. Clear Cart
        console.log('\n2. Clearing cart...');
        await CartService.clearCart(customerId);
        const cartAfterClear = await CartService.getCart(customerId);
        // Handle pagination structure or array
        const cartItemsAfterClear = cartAfterClear.items ? cartAfterClear.items : cartAfterClear;
        console.log(`Cart items: ${cartItemsAfterClear.length} (Expected: 0)`);

        // 3. Add Item (Valid)
        console.log('\n3. Adding item (Qty: 2)...');

        // NOTE: This will fail if the RPC 'add_to_cart' is not created in the DB.
        // We strictly catch this specific error to warn the user.
        let addedItem;
        try {
            addedItem = await CartService.addToCart(customerId, productId, 2);
            console.log(`Added: ${addedItem.quantity} (Expected: 2)`);
        } catch (e) {
            if (e.message.includes('function add_to_cart') || e.message.includes('does not exist')) {
                console.error('\nCRITICAL: The RPC function `add_to_cart` is missing in the database.');
                console.error('Please run the SQL content from `database/add_to_cart_rpc.sql` in your Supabase SQL Editor.');
                process.exit(1);
            }
            throw e;
        }

        // 4. Add More Item (Valid, existing)
        console.log('\n4. Adding same item again (Qty: 3)...');
        const updatedItem = await CartService.addToCart(customerId, productId, 3);
        console.log(`Updated Quantity: ${updatedItem.quantity} (Expected: 5)`);

        // 5. Add Invalid Quantity (Exceeds stock)
        console.log(`\n5. Testing Stock Limit (Stock is ${productStock})...`);
        try {
            await CartService.addToCart(customerId, productId, productStock + 1);
            console.error('FAILED: Should have thrown error for exceeding stock');
        } catch (e) {
            console.log(`PASSED: Caught expected error: ${e.message}`);
        }

        // 6. Update Quantity directly
        console.log('\n6. Updating cart item quantity manually to 1...');
        const itemId = updatedItem.id; // RPC returns the row directly
        const directUpdate = await CartService.updateCartItem(customerId, itemId, 1);
        console.log(`New Quantity: ${directUpdate.quantity} (Expected: 1)`);

        // 7. Remove Item
        console.log('\n7. Removing item...');
        await CartService.removeFromCart(customerId, itemId);
        const finalCart = await CartService.getCart(customerId);
        const finalCartItems = finalCart.items ? finalCart.items : finalCart;
        console.log(`Final cart count: ${finalCartItems.length} (Expected: 0)`);

        console.log('\nVerification Complete!');
        process.exit(0);

    } catch (error) {
        console.error('\nVerification FAILED:', error.message);
        if (error.details) console.error('Details:', JSON.stringify(error.details));
        process.exit(1);
    }
}

testCartFlow();
