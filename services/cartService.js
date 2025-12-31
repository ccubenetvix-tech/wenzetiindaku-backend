const { supabaseAdmin } = require('../config/supabase');

class CartService {
    /**
     * Get cart items for a customer with product and vendor details
     * Supports pagination and valid product filtering
     */
    static async getCart(customerId, page = 1, limit = 20) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // Use !inner to enforce filtering on joined table
        const { data: cartItems, error, count } = await supabaseAdmin
            .from('cart')
            .select(`
id,
    quantity,
    created_at,
    updated_at,
    product_id,
    product: products!inner(
        id,
        name,
        price,
        images,
        stock,
        status,
        vendor_id,
        vendor: vendors(
            id,
            business_name,
            approved,
            verified
        )
    )
      `, { count: 'exact' })
            .eq('customer_id', customerId)
            .in('product.status', ['published', 'active']) // Allow both statuses
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return {
            items: cartItems || [],
            total: count,
            page,
            limit
        };
    }

    /**
     * Add item to cart with validation (Using RPC for Atomicity)
     */
    static async addToCart(customerId, productId, quantity) {
        // Call the RPC function `add_to_cart` required for atomic operations
        const { data, error } = await supabaseAdmin
            .rpc('add_to_cart', {
                p_customer_id: customerId,
                p_product_id: productId,
                p_quantity: quantity
            });

        if (error) {
            // Handle known RPC errors
            if (error.code === 'P0001') { // constraint/logic error
                const e = new Error(error.message);
                e.statusCode = 400;
                throw e;
            }
            if (error.code === 'P0002') { // not found
                const e = new Error(error.message);
                e.statusCode = 404;
                throw e;
            }
            // If RPC doesn't exist, we might get an error. 
            // User manual intervention is required to crate RPC.
            if (error.message && error.message.includes('function add_to_cart') && error.message.includes('does not exist')) {
                const e = new Error('Database configuration error: Missing add_to_cart function. Please run the migration.');
                e.statusCode = 500;
                throw e;
            }
            throw error;
        }

        return data;
    }

    /**
     * Update cart item quantity
     */
    static async updateCartItem(customerId, itemId, quantity) {
        // 1. Get existing item + Product stock to validate
        // We can't trust just an update blindly if we want to enforce stock limits strictly
        const { data: currentItem, error: fetchError } = await supabaseAdmin
            .from('cart')
            .select('product_id, product:products(stock)')
            .eq('id', itemId)
            .eq('customer_id', customerId)
            .single();

        if (fetchError || !currentItem) {
            const e = new Error('Cart item not found');
            e.statusCode = 404;
            throw e;
        }

        if (!currentItem.product) {
            // Should rely on delete cascade, but good safety
            const e = new Error('Product not found for this cart item');
            e.statusCode = 404;
            throw e;
        }

        if (quantity > currentItem.product.stock) {
            const e = new Error(`Insufficient stock.Only ${currentItem.product.stock} available.`);
            e.statusCode = 400;
            throw e;
        }

        // 2. Update without manual timestamp (Let trigger handle it)
        const { data, error } = await supabaseAdmin
            .from('cart')
            .update({ quantity }) // removed updated_at
            .eq('id', itemId)
            .eq('customer_id', customerId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Remove item
     */
    static async removeFromCart(customerId, itemId) {
        // Perform delete and select deleted rows count (Supabase doesn't return count directly on delete unless we use select or get response)
        // The idiomatic way in Supabase/PostgREST is to select back the data to confirm
        const { data, error } = await supabaseAdmin
            .from('cart')
            .delete()
            .eq('id', itemId)
            .eq('customer_id', customerId)
            .select('id');

        if (error) throw error;

        if (!data || data.length === 0) {
            const e = new Error('Item not found or already deleted');
            e.statusCode = 404;
            throw e;
        }

        return true;
    }

    /**
     * Clear cart
     */
    static async clearCart(customerId) {
        const { error } = await supabaseAdmin
            .from('cart')
            .delete()
            .eq('customer_id', customerId);

        if (error) throw error;
        return true;
    }
}

module.exports = CartService;
