-- ============================================================
-- WENZETIINDAKU - PROD DATABASE BASELINE
-- Snapshot of the current PROD application schema.
--
-- Schema only; no application data is included.
-- Supabase-managed internal schemas/extensions are intentionally not
-- recreated by this application baseline.
-- Review/test this migration in DEV before production use.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

SET search_path = public, extensions;
-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.cart (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    size text,
    color text
);

CREATE TABLE public.conversations (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    customer_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone,
    customer_unread_count integer DEFAULT 0,
    vendor_unread_count integer DEFAULT 0
);

CREATE TABLE public.customer_addresses (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    customer_id uuid NOT NULL,
    label character varying(50) DEFAULT 'Home'::character varying,
    full_name character varying(200) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    street1 character varying(255) NOT NULL,
    street2 character varying(255),
    city character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    postal_code character varying(20) NOT NULL,
    country character varying(100) NOT NULL DEFAULT 'India'::character varying,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.customers (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255),
    google_id character varying(255),
    profile_photo text,
    role character varying(20) DEFAULT 'customer'::character varying,
    verified boolean DEFAULT false,
    otp character varying(6),
    otp_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    gender character varying(10),
    address text,
    phone_number character varying(20),
    date_of_birth date,
    profile_completed boolean DEFAULT false
);

CREATE TABLE public.messages (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role character varying(20) NOT NULL,
    encrypted_content text NOT NULL,
    content_hash text NOT NULL,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_compressed boolean DEFAULT false,
    content_size integer
);

CREATE TABLE public.messages_archive (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role character varying(20) NOT NULL,
    encrypted_content text NOT NULL,
    content_hash text NOT NULL,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now(),
    is_compressed boolean DEFAULT false,
    content_size integer
);

CREATE TABLE public.order_items (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.orders (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    customer_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    shipping_address jsonb NOT NULL,
    payment_method character varying(50),
    payment_status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancellation_reason text,
    stripe_payment_id character varying(255)
);

CREATE TABLE public.products (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    vendor_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text NOT NULL,
    price numeric(10,2) NOT NULL,
    category character varying(100) NOT NULL,
    images text[] DEFAULT '{}'::text[],
    stock integer DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    flagged_reason text,
    flagged_at timestamp with time zone,
    rating numeric(3,2) DEFAULT 4.5,
    review_count integer DEFAULT 0,
    sizes text[] DEFAULT '{}'::text[],
    colors text[] DEFAULT '{}'::text[]
);

CREATE TABLE public.reviews (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    product_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    order_id uuid,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.vendors (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    business_name character varying(200) NOT NULL,
    business_email character varying(255) NOT NULL,
    business_phone character varying(20) NOT NULL,
    business_website text,
    business_address text NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(100) NOT NULL,
    country character varying(100) NOT NULL,
    postal_code character varying(20) NOT NULL,
    business_type character varying(100) NOT NULL,
    description text NOT NULL,
    categories text[] NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'vendor'::character varying,
    verified boolean DEFAULT false,
    approved boolean DEFAULT false,
    otp character varying(6),
    otp_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    stripe_account_id character varying(255),
    profile_photo text
);

CREATE TABLE public.wishlist (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- CONSTRAINTS
-- ============================================================

-- cart\nFOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- conversations\nFOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
PRIMARY KEY (id);
UNIQUE (customer_id, vendor_id);
-- customer_addresses\nFOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
PRIMARY KEY (id);
UNIQUE (customer_id, label);
-- customers\nPRIMARY KEY (id);
UNIQUE (email);
UNIQUE (google_id);
-- messages\nCHECK (sender_role::text = ANY (ARRAY['customer'::character varying, 'vendor'::character varying]::text[]));
FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- messages_archive\nCHECK (sender_role::text = ANY (ARRAY['customer'::character varying, 'vendor'::character varying]::text[]));
FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- order_items\nFOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- orders\nFOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- products\nFOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
PRIMARY KEY (id);
-- reviews\nCHECK (rating >= 1 AND rating <= 5);
FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE;
PRIMARY KEY (id);
UNIQUE (customer_id, product_id);
-- vendors\nPRIMARY KEY (id);
UNIQUE (business_email);
-- wishlist\nFOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
PRIMARY KEY (id);
UNIQUE (customer_id, product_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_cart_customer_id ON public.cart USING btree (customer_id);
CREATE UNIQUE INDEX idx_cart_unique_variant ON public.cart USING btree (customer_id, product_id, COALESCE(size, ''::text), COALESCE(color, ''::text));
CREATE INDEX idx_conversations_customer_id ON public.conversations USING btree (customer_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations USING btree (updated_at DESC);
CREATE INDEX idx_conversations_vendor_id ON public.conversations USING btree (vendor_id);
CREATE INDEX idx_customer_addresses_customer_id ON public.customer_addresses USING btree (customer_id);
CREATE INDEX idx_customer_addresses_default ON public.customer_addresses USING btree (customer_id, is_default) WHERE (is_default = true);
CREATE INDEX idx_customers_email ON public.customers USING btree (email);
CREATE INDEX idx_customers_google_id ON public.customers USING btree (google_id);
CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);
CREATE INDEX idx_messages_is_read ON public.messages USING btree (is_read) WHERE (is_read = false);
CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);
CREATE INDEX idx_messages_archive_conversation_id ON public.messages_archive USING btree (conversation_id);
CREATE INDEX idx_messages_archive_created_at ON public.messages_archive USING btree (created_at);
CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);
CREATE INDEX idx_orders_customer_id ON public.orders USING btree (customer_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_stripe_payment_id ON public.orders USING btree (stripe_payment_id);
CREATE INDEX idx_orders_vendor_id ON public.orders USING btree (vendor_id);
CREATE INDEX idx_products_category ON public.products USING btree (category);
CREATE INDEX idx_products_status ON public.products USING btree (status);
CREATE INDEX idx_products_vendor_id ON public.products USING btree (vendor_id);
CREATE INDEX idx_reviews_customer_id ON public.reviews USING btree (customer_id);
CREATE INDEX idx_reviews_order_id ON public.reviews USING btree (order_id);
CREATE INDEX idx_reviews_product_id ON public.reviews USING btree (product_id);
CREATE INDEX idx_reviews_rating ON public.reviews USING btree (rating);
CREATE INDEX idx_reviews_vendor_id ON public.reviews USING btree (vendor_id);
CREATE INDEX idx_vendors_business_email ON public.vendors USING btree (business_email);
CREATE INDEX idx_vendors_stripe_account_id ON public.vendors USING btree (stripe_account_id);
CREATE INDEX idx_wishlist_customer_id ON public.wishlist USING btree (customer_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY "Customers can manage own cart" ON public.cart AS PERMISSIVE FOR ALL TO public USING (((auth.uid())::text = (customer_id)::text));
CREATE POLICY "Customers can view own conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO public USING ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE ((customers.id)::text = current_setting('app.current_user_id'::text, true)))));
CREATE POLICY "Vendors can view own conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO public USING ((vendor_id IN ( SELECT vendors.id
   FROM vendors
  WHERE ((vendors.id)::text = current_setting('app.current_user_id'::text, true)))));
CREATE POLICY "Customers can update own profile" ON public.customers AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY "Customers can view own profile" ON public.customers AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY "Users can view messages from own conversations" ON public.messages AS PERMISSIVE FOR SELECT TO public USING ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (((conversations.customer_id)::text = current_setting('app.current_user_id'::text, true)) OR ((conversations.vendor_id)::text = current_setting('app.current_user_id'::text, true))))));
CREATE POLICY "Users can view order items for their orders" ON public.order_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_items.order_id) AND (((orders.customer_id)::text = (auth.uid())::text) OR ((orders.vendor_id)::text = (auth.uid())::text))))));
CREATE POLICY "Customers can view own orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (customer_id)::text));
CREATE POLICY "Vendors can view own orders" ON public.orders AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (vendor_id)::text));
CREATE POLICY "Anyone can view published products" ON public.products AS PERMISSIVE FOR SELECT TO public USING (((status)::text = 'published'::text));
CREATE POLICY "Vendors can manage own products" ON public.products AS PERMISSIVE FOR ALL TO public USING (((auth.uid())::text = (vendor_id)::text));
CREATE POLICY "Anyone can view published reviews" ON public.reviews AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Customers can create own reviews" ON public.reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid())::text = (customer_id)::text));
CREATE POLICY "Customers can delete own reviews" ON public.reviews AS PERMISSIVE FOR DELETE TO public USING (((auth.uid())::text = (customer_id)::text));
CREATE POLICY "Customers can update own reviews" ON public.reviews AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (customer_id)::text));
CREATE POLICY "Vendors can update own profile" ON public.vendors AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY "Vendors can view own profile" ON public.vendors AS PERMISSIVE FOR SELECT TO public USING (((auth.uid())::text = (id)::text));
CREATE POLICY "Customers can manage own wishlist" ON public.wishlist AS PERMISSIVE FOR ALL TO public USING (((auth.uid())::text = (customer_id)::text));

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_customers_table()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Table creation is handled above, this function is for the Node.js app
    RAISE NOTICE 'Customers table already exists or created successfully';
END;
$function$


CREATE OR REPLACE FUNCTION public.create_vendors_table()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Table creation is handled above, this function is for the Node.js app
    RAISE NOTICE 'Vendors table already exists or created successfully';
END;
$function$


CREATE OR REPLACE FUNCTION public.enable_rls_on_tables()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on all tables';
END;
$function$


CREATE OR REPLACE FUNCTION public.create_vendor_policies()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Vendors can view own profile" ON vendors;
    DROP POLICY IF EXISTS "Vendors can update own profile" ON vendors;
    DROP POLICY IF EXISTS "Vendors can insert own profile" ON vendors;
    DROP POLICY IF EXISTS "Vendors can delete own profile" ON vendors;
    
    -- Create new policies
    CREATE POLICY "Vendors can view own profile" ON vendors
        FOR SELECT USING (auth.uid() = id);

    CREATE POLICY "Vendors can update own profile" ON vendors
        FOR UPDATE USING (auth.uid() = id);

    CREATE POLICY "Vendors can insert own profile" ON vendors
        FOR INSERT WITH CHECK (auth.uid() = id);

    CREATE POLICY "Vendors can delete own profile" ON vendors
        FOR DELETE USING (auth.uid() = id);
        
    RAISE NOTICE 'Vendor policies created successfully';
END;
$function$


CREATE OR REPLACE FUNCTION public.get_current_user()
 RETURNS TABLE(id uuid, email character varying, role character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- This function would be used to get current user from JWT
    -- Implementation depends on your JWT verification strategy
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, NULL::VARCHAR;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_product_rating()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE products
    SET 
        rating = (
            SELECT COALESCE(AVG(rating::numeric), 0)
            FROM reviews
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        ),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE conversations
    SET 
        updated_at = NOW(),
        last_message_at = NEW.created_at,
        customer_unread_count = CASE 
            WHEN NEW.sender_role = 'vendor' AND NEW.is_read = FALSE 
            THEN customer_unread_count + 1 
            ELSE customer_unread_count 
        END,
        vendor_unread_count = CASE 
            WHEN NEW.sender_role = 'customer' AND NEW.is_read = FALSE 
            THEN vendor_unread_count + 1 
            ELSE vendor_unread_count 
        END
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_unread_counts_on_read()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
        UPDATE conversations
        SET 
            customer_unread_count = CASE 
                WHEN NEW.sender_role = 'vendor' 
                THEN GREATEST(0, customer_unread_count - 1)
                ELSE customer_unread_count
            END,
            vendor_unread_count = CASE 
                WHEN NEW.sender_role = 'customer' 
                THEN GREATEST(0, vendor_unread_count - 1)
                ELSE vendor_unread_count
            END
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_old_messages(days_old integer DEFAULT 365)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages 
    WHERE created_at < NOW() - (days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_message_size()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.content_size = LENGTH(NEW.encrypted_content);
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_chat_storage_stats()
 RETURNS TABLE(active_messages bigint, archived_messages bigint, active_size_bytes bigint, archived_size_bytes bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM messages)::BIGINT as active_messages,
        (SELECT COUNT(*) FROM messages_archive)::BIGINT as archived_messages,
        (SELECT COALESCE(SUM(LENGTH(encrypted_content)), 0) FROM messages)::BIGINT as active_size_bytes,
        (SELECT COALESCE(SUM(LENGTH(encrypted_content)), 0) FROM messages_archive)::BIGINT as archived_size_bytes;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_to_cart(p_customer_id uuid, p_product_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$


-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER update_cart_updated_at BEFORE UPDATE ON cart FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_conversation_on_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
CREATE TRIGGER trigger_update_message_size BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_message_size();
CREATE TRIGGER trigger_update_unread_counts_on_read AFTER UPDATE OF is_read ON messages FOR EACH ROW WHEN (new.is_read IS DISTINCT FROM old.is_read) EXECUTE FUNCTION update_unread_counts_on_read();
CREATE TRIGGER trigger_update_message_size_archive BEFORE INSERT OR UPDATE ON messages_archive FOR EACH ROW EXECUTE FUNCTION update_message_size();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_rating_on_delete AFTER DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating();
CREATE TRIGGER update_product_rating_on_insert AFTER INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating();
CREATE TRIGGER update_product_rating_on_update AFTER UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_product_rating();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
