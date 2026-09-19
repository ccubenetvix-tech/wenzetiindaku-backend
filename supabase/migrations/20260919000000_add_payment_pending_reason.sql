-- Adds a column to record why a COD order's payment was not collected yet
-- when a vendor marks the order as delivered but the buyer didn't pay.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_pending_reason text;
