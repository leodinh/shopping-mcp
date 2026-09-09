CREATE TABLE merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  website_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merchant_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  connector_type text NOT NULL CHECK (connector_type IN ('demo')),
  config jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL CHECK (length(name) > 0),
  description text NOT NULL DEFAULT '',
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  images jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(images) = 'array'),
  inventory integer NOT NULL CHECK (inventory >= 0),
  product_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, external_id)
);

CREATE INDEX products_search_idx ON products USING gin(search_document) WHERE active;
CREATE INDEX products_merchant_idx ON products(merchant_id) WHERE active;
CREATE INDEX products_price_idx ON products(currency, price_minor) WHERE active;
