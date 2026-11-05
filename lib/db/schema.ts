import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PAID"]);
export const fileFormat = pgEnum("file_format", ["PDF", "JPG", "PNG"]);
export const colorMode = pgEnum("color_mode", ["BW", "COLOR"]);
export const paperSize = pgEnum("paper_size", ["A4"]);
export const paymentSimulationStatus = pgEnum("payment_simulation_status", [
  "SIMULATED_SUCCESS",
  "SIMULATED_FAILED",
]);
export const kioskAction = pgEnum("kiosk_action", ["LOOKUP", "CLAIM", "DOWNLOAD", "COMPLETE", "FAIL"]);

const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderRef: text("order_ref").notNull().unique(),
    collectionCode: text("collection_code"),
    status: orderStatus("status").notNull().default("PENDING_PAYMENT"),
    paymentStatus: paymentStatus("payment_status").notNull().default("UNPAID"),
    totalPrice: integer("total_price").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
    paidAt: tsz("paid_at"),
    processingAt: tsz("processing_at"),
    completedAt: tsz("completed_at"),
    expiresAt: tsz("expires_at").notNull(),
    claimedByKiosk: text("claimed_by_kiosk"),
    failureReason: text("failure_reason"),
  },
  (t) => [
    // A code may only belong to one *active* order at a time; it can be reused after the order ends.
    uniqueIndex("orders_active_collection_code_idx")
      .on(t.collectionCode)
      .where(sql`${t.status} in ('PAID', 'PROCESSING')`),
    index("orders_collection_code_idx").on(t.collectionCode),
    index("orders_status_expires_idx").on(t.status, t.expiresAt),
    check("orders_total_nonnegative", sql`${t.totalPrice} >= 0`),
  ],
);

export const uploadedFiles = pgTable(
  "uploaded_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    format: fileFormat("format").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    pageCount: integer("page_count").notNull(),
    sha256: text("sha256").notNull(),
    uploadedAt: tsz("uploaded_at").notNull().defaultNow(),
    deletedAt: tsz("deleted_at"),
  },
  (t) => [index("uploaded_files_order_idx").on(t.orderId)],
);

export const printSettings = pgTable(
  "print_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .unique()
      .references(() => uploadedFiles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    paperSize: paperSize("paper_size").notNull().default("A4"),
    colorMode: colorMode("color_mode").notNull(),
    copies: integer("copies").notNull(),
    pageSelection: text("page_selection").notNull(),
    selectedPageCount: integer("selected_page_count").notNull(),
    pricePerPage: integer("price_per_page").notNull(),
    printedPages: integer("printed_pages").notNull(),
    subtotal: integer("subtotal").notNull(),
  },
  (t) => [
    index("print_settings_order_idx").on(t.orderId),
    check("print_settings_copies_positive", sql`${t.copies} >= 1`),
  ],
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  paymentType: text("payment_type").notNull().default("DUMMY_QRIS"),
  amount: integer("amount").notNull(),
  simulationStatus: paymentSimulationStatus("simulation_status").notNull(),
  paidAt: tsz("paid_at").notNull().defaultNow(),
});

export const kioskLogs = pgTable(
  "kiosk_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kioskId: text("kiosk_id").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    action: kioskAction("action").notNull(),
    codeAttempted: text("code_attempted"),
    result: text("result").notNull(),
    errorDetail: text("error_detail"),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index("kiosk_logs_kiosk_time_idx").on(t.kioskId, t.createdAt)],
);

export const pricingConfig = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  bwPricePerPage: integer("bw_price_per_page").notNull(),
  colorPricePerPage: integer("color_price_per_page").notNull(),
  currency: text("currency").notNull().default("IDR"),
  activeFrom: tsz("active_from").notNull().defaultNow(),
  note: text("note"),
});

export type Order = typeof orders.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type PrintSetting = typeof printSettings.$inferSelect;
export type OrderStatus = (typeof orderStatus.enumValues)[number];
