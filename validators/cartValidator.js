const { z } = require('zod');

const addToCartSchema = z.object({
    productId: z.string().uuid({ message: "Invalid product ID format" }),
    quantity: z.number().int().positive({ message: "Quantity must be a positive integer" }).default(1)
});

const updateCartItemSchema = z.object({
    quantity: z.number().int().positive({ message: "Quantity must be a positive integer" })
});

module.exports = {
    addToCartSchema,
    updateCartItemSchema
};
