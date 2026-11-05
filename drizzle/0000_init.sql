CREATE TYPE "public"."color_mode" AS ENUM('BW', 'COLOR');--> statement-breakpoint
CREATE TYPE "public"."file_format" AS ENUM('PDF', 'JPG', 'PNG');--> statement-breakpoint
CREATE TYPE "public"."kiosk_action" AS ENUM('LOOKUP', 'CLAIM', 'DOWNLOAD', 'COMPLETE', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."paper_size" AS ENUM('A4');--> statement-breakpoint
CREATE TYPE "public"."payment_simulation_status" AS ENUM('SIMULATED_SUCCESS', 'SIMULATED_FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PAID');--> statement-breakpoint
CREATE TABLE "kiosk_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kiosk_id" text NOT NULL,
	"order_id" uuid,
	"action" "kiosk_action" NOT NULL,
	"code_attempted" text,
	"result" text NOT NULL,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_ref" text NOT NULL,
	"collection_code" text,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"total_price" integer NOT NULL,
	"access_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"processing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by_kiosk" text,
	"failure_reason" text,
	CONSTRAINT "orders_order_ref_unique" UNIQUE("order_ref"),
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_type" text DEFAULT 'DUMMY_QRIS' NOT NULL,
	"amount" integer NOT NULL,
	"simulation_status" "payment_simulation_status" NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"bw_price_per_page" integer NOT NULL,
	"color_price_per_page" integer NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "print_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"paper_size" "paper_size" DEFAULT 'A4' NOT NULL,
	"color_mode" "color_mode" NOT NULL,
	"copies" integer NOT NULL,
	"page_selection" text NOT NULL,
	"selected_page_count" integer NOT NULL,
	"price_per_page" integer NOT NULL,
	"printed_pages" integer NOT NULL,
	"subtotal" integer NOT NULL,
	CONSTRAINT "print_settings_file_id_unique" UNIQUE("file_id"),
	CONSTRAINT "print_settings_copies_positive" CHECK ("print_settings"."copies" >= 1)
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"original_name" text NOT NULL,
	"format" "file_format" NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "uploaded_files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "kiosk_logs" ADD CONSTRAINT "kiosk_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_settings" ADD CONSTRAINT "print_settings_file_id_uploaded_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kiosk_logs_kiosk_time_idx" ON "kiosk_logs" USING btree ("kiosk_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_active_collection_code_idx" ON "orders" USING btree ("collection_code") WHERE "orders"."status" in ('PAID', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "orders_collection_code_idx" ON "orders" USING btree ("collection_code");--> statement-breakpoint
CREATE INDEX "orders_status_expires_idx" ON "orders" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "print_settings_order_idx" ON "print_settings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "uploaded_files_order_idx" ON "uploaded_files" USING btree ("order_id");