-- Placeholder prices (integer Rupiah per printed page). Change later by inserting a new row:
--   INSERT INTO pricing_config (bw_price_per_page, color_price_per_page, note) VALUES (600, 2000, 'Final pricing');
-- The newest row whose active_from is in the past is used.
INSERT INTO "pricing_config" ("bw_price_per_page", "color_price_per_page", "currency", "note")
VALUES (500, 1500, 'IDR', 'Placeholder prototype pricing');
