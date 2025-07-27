import { pgTable, text, serial, integer, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - current database structure
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Company profiles - enhanced with full address and employee info
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  location: text("location"), // Legacy field
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country").default("USA"),
  employeeCount: integer("employee_count"),
  payrollFrequency: text("payroll_frequency").default("bi-weekly"),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }).notNull(),
  overheadRate: decimal("overhead_rate", { precision: 5, scale: 2 }).notNull(),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// PDF drawings/blueprints - current database structure
export const drawings = pgTable("drawings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("uploaded"),
  extractedData: jsonb("extracted_data"),
  // S3 integration fields
  s3Key: text("s3_key"),
  s3Url: text("s3_url"),
  storageType: text("storage_type").notNull().default("local"), // 'local' or 's3'
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Material cost tracking - current database structure
export const materialCosts = pgTable("material_costs", {
  id: serial("id").primaryKey(),
  materialType: text("material_type").notNull(),
  grade: text("grade").notNull(),
  pricePerPound: decimal("price_per_pound", { precision: 10, scale: 4 }).notNull(),
  priceChange: decimal("price_change", { precision: 5, scale: 2 }),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

// Quotes - current database structure
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  quoteNumber: text("quote_number").notNull().unique(),
  clientName: text("client_name").notNull(),
  projectDescription: text("project_description").notNull(),
  drawingId: integer("drawing_id").references(() => drawings.id),
  materialGrade: text("material_grade").notNull(),
  finishType: text("finish_type").notNull(),
  deliveryTimeline: text("delivery_timeline").notNull(),
  quantity: integer("quantity").notNull().default(1),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }).notNull(),
  laborHours: decimal("labor_hours", { precision: 8, scale: 2 }).notNull(),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).notNull(),
  overheadCost: decimal("overhead_cost", { precision: 10, scale: 2 }).notNull(),
  profitAmount: decimal("profit_amount", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies),
  drawings: many(drawings),
  quotes: many(quotes),
}));

export const companiesRelations = relations(companies, ({ one }) => ({
  user: one(users, {
    fields: [companies.userId],
    references: [users.id],
  }),
}));

export const drawingsRelations = relations(drawings, ({ one, many }) => ({
  user: one(users, {
    fields: [drawings.userId],
    references: [users.id],
  }),
  quotes: many(quotes),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  user: one(users, {
    fields: [quotes.userId],
    references: [users.id],
  }),
  drawing: one(drawings, {
    fields: [quotes.drawingId],
    references: [drawings.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDrawingSchema = createInsertSchema(drawings).omit({
  id: true,
  uploadedAt: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMaterialCostSchema = createInsertSchema(materialCosts).omit({
  id: true,
  lastUpdated: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Drawing = typeof drawings.$inferSelect;
export type InsertDrawing = z.infer<typeof insertDrawingSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type MaterialCost = typeof materialCosts.$inferSelect;
export type InsertMaterialCost = z.infer<typeof insertMaterialCostSchema>;