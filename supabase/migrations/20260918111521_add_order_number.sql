-- Adds a human-readable order number (e.g. ORD-000123) to the orders table.
-- Auto-generated on insert via trigger, so no application code changes are
-- needed to populate it — it works no matter which code path inserts an order.

-- 1. Sequence backing the order number.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

-- 2. Column to hold it. Unique so it can be used as a lookup key.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number varchar(20) UNIQUE;

-- 3. Backfill existing orders, oldest first, so numbering reflects creation order.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL ORDER BY created_at ASC LOOP
    UPDATE public.orders
    SET order_number = 'ORD-' || LPAD(nextval('public.order_number_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Auto-generate order_number for all future inserts.
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || LPAD(nextval('public.order_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();
