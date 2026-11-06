-- Team pricing (integer Rupiah per printed page): black & white Rp 1.000, color Rp 2.500.
-- New orders use the newest active row; existing orders keep the price they were created with.
INSERT INTO "pricing_config" ("bw_price_per_page", "color_price_per_page", "currency", "note")
VALUES (1000, 2500, 'IDR', 'Team pricing: B&W Rp 1.000, color Rp 2.500 per page');
