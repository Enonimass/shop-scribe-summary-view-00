-- Drop the existing unique constraint on (shop_id, product)
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_shop_id_product_key;

-- Add new unique constraint on (shop_id, product, unit)
ALTER TABLE inventory ADD CONSTRAINT inventory_shop_id_product_unit_key UNIQUE (shop_id, product, unit);