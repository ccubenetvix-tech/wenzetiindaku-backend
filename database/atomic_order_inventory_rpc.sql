-- Atomic, idempotent stock deduction/restoration for orders.
-- Fixes race condition where concurrent orders could read the same
-- products.stock value and clobber each other's writes, and the lack
-- of any check preventing an order from being confirmed with insufficient stock.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;

-- Deducts stock for every item of an order inside a single transaction.
-- Locks the order row first so two concurrent calls for the same order
-- (e.g. a duplicate payment webhook) can't both deduct stock.
-- Locks the affected product rows before validating, so two different
-- orders competing for the same product's stock are serialized instead
-- of racing on a read-then-write in application code.
-- If ANY item has insufficient stock, the whole transaction is rolled
-- back - nothing is deducted and the order is left untouched.
CREATE OR REPLACE FUNCTION finalize_order_inventory(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shortages JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.inventory_deducted THEN
    RETURN jsonb_build_object('success', true, 'already_deducted', true);
  END IF;

  -- Lock every product row involved in this order first, so no other
  -- transaction can change their stock until this one commits.
  -- (FOR UPDATE can't be combined with GROUP BY, so locking happens here,
  -- as a plain row lock, before the aggregated check below reads them.)
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = p_order_id)
  FOR UPDATE;

  -- Aggregate by product_id (an order could in theory have more than one
  -- line item for the same product) so stock is checked against the TOTAL
  -- quantity ordered for that product, not each line item in isolation.
  FOR v_item IN
    SELECT oi.product_id, SUM(oi.quantity) AS quantity, p.stock, p.name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id, p.stock, p.name
    ORDER BY oi.product_id
  LOOP
    IF v_item.stock < v_item.quantity THEN
      v_shortages := v_shortages || jsonb_build_object(
        'product_id', v_item.product_id,
        'name', v_item.name,
        'available', v_item.stock,
        'requested', v_item.quantity
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'Insufficient stock for one or more items: %', v_shortages::text
      USING ERRCODE = 'P0001', DETAIL = v_shortages::text;
  END IF;

  UPDATE products p
  SET stock = p.stock - agg.quantity
  FROM (
    SELECT product_id, SUM(quantity) AS quantity
    FROM order_items
    WHERE order_id = p_order_id
    GROUP BY product_id
  ) agg
  WHERE agg.product_id = p.id;

  UPDATE orders SET inventory_deducted = TRUE WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'already_deducted', false);
END;
$$;

-- Restores stock for an order's items. Idempotent: only restores once,
-- guarded by the same inventory_deducted flag used for deduction.
CREATE OR REPLACE FUNCTION restore_order_inventory(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_order.inventory_deducted THEN
    RETURN jsonb_build_object('success', true, 'restored', false);
  END IF;

  UPDATE products p
  SET stock = p.stock + agg.quantity
  FROM (
    SELECT product_id, SUM(quantity) AS quantity
    FROM order_items
    WHERE order_id = p_order_id
    GROUP BY product_id
  ) agg
  WHERE agg.product_id = p.id;

  UPDATE orders SET inventory_deducted = FALSE WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'restored', true);
END;
$$;
