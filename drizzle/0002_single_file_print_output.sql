ALTER TABLE "print_settings" ADD COLUMN "image_adjustment" jsonb;--> statement-breakpoint
ALTER TABLE "print_settings" ADD COLUMN "print_storage_key" text;--> statement-breakpoint
ALTER TABLE "print_settings" ADD COLUMN "print_mime_type" text;--> statement-breakpoint
ALTER TABLE "print_settings" ADD COLUMN "print_page_count" integer;--> statement-breakpoint
ALTER TABLE "print_settings" ADD COLUMN "print_pages" text;--> statement-breakpoint
ALTER TABLE "print_settings" ADD COLUMN "print_sha256" text;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD COLUMN "exif_orientation" integer;