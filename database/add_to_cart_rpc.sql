-- Function to atomically add/update cart items with validation
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION add_to_cart(
  p_customer_id UUID,
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (should be admin/service role)
AS $$
DECLARE
  v_product RECORD;
  v_cart_item RECORD;
  v_new_quantity INTEGER;
  v_result JSONB;
BEGIN
  -- 1. Validate Product & Check Stock
  SELECT p.id, p.stock, p.status, v.approved, v.verified
  INTO v_product
  FROM products p
  JOIN vendors v ON p.vendor_id = v.id
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product.status NOT IN ('published', 'active') THEN
    RAISE EXCEPTION 'Product is not published' USING ERRCODE = 'P0001';
  END IF;

  IF v_product.approved = FALSE THEN
     RAISE EXCEPTION 'Vendor is not approved' USING ERRCODE = 'P0001';
  END IF;
  
  -- User requested strict vendor verification check
  IF v_product.verified = FALSE THEN
     RAISE EXCEPTION 'Vendor is not verified' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check overlap / Check existing cart item
  SELECT * INTO v_cart_item
  FROM cart
  WHERE customer_id = p_customer_id AND product_id = p_product_id
  FOR UPDATE; -- Lock this row for atomicity

  IF v_cart_item IS NOT NULL THEN
    -- Update existing
    v_new_quantity := v_cart_item.quantity + p_quantity;
    
    IF v_new_quantity > v_product.stock THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, Requested Total: %', v_product.stock, v_new_quantity USING ERRCODE = 'P0001';
    END IF;

    UPDATE cart
    SET 
        quantity = v_new_quantity,
        updated_at = NOW() -- Database trigger would do this, but explicit here for RPC clarity
    WHERE id = v_cart_item.id
    RETURNING to_jsonb(cart.*) INTO v_result;
    
  ELSE
    -- Insert new
    IF p_quantity > v_product.stock THEN
      RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_product.stock, p_quantity USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO cart (customer_id, product_id, quantity)
    VALUES (p_customer_id, p_product_id, p_quantity)
    RETURNING to_jsonb(cart.*) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;
