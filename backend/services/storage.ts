import { 
  users, companies, drawings, quotes, materialCosts,
  type User, type InsertUser, type Company, type InsertCompany,
  type Drawing, type InsertDrawing, type Quote, type InsertQuote,
  type MaterialCost, type InsertMaterialCost
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;

  // Company operations
  getCompanyByUserId(userId: number): Promise<Company | undefined>;
  createCompany(insertCompany: InsertCompany): Promise<Company>;
  updateCompany(id: number, updateData: Partial<InsertCompany>): Promise<Company | undefined>;

  // Drawing operations
  getDrawingsByUserId(userId: number): Promise<Drawing[]>;
  getDrawing(id: number): Promise<Drawing | undefined>;
  createDrawing(insertDrawing: InsertDrawing): Promise<Drawing>;
  updateDrawing(id: number, updateData: Partial<InsertDrawing>): Promise<Drawing | undefined>;

  // Quote operations
  getQuotesByUserId(userId: number): Promise<Quote[]>;
  getRecentQuotes(userId: number, limit: number): Promise<Quote[]>;
  createQuote(insertQuote: any): Promise<Quote>;
  updateQuote(id: number, updateData: any): Promise<Quote | undefined>;

  // Material cost operations
  getMaterialCosts(): Promise<MaterialCost[]>;
  getMaterialCostsByLocation(region: string, state?: string): Promise<MaterialCost[]>;
  
  // Dashboard stats
  getDashboardStats(userId: number): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getCompanyByUserId(userId: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.userId, userId));
    return company || undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db
      .insert(companies)
      .values(insertCompany)
      .returning();
    return company;
  }

  async updateCompany(id: number, updateData: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return company || undefined;
  }

  async getDrawingsByUserId(userId: number): Promise<Drawing[]> {
    return await db.select().from(drawings).where(eq(drawings.userId, userId)).orderBy(desc(drawings.uploadedAt));
  }

  async getDrawing(id: number): Promise<Drawing | undefined> {
    const [drawing] = await db.select().from(drawings).where(eq(drawings.id, id));
    return drawing || undefined;
  }

  async createDrawing(insertDrawing: InsertDrawing): Promise<Drawing> {
    const [drawing] = await db
      .insert(drawings)
      .values(insertDrawing)
      .returning();
    return drawing;
  }

  async updateDrawing(id: number, updateData: Partial<InsertDrawing>): Promise<Drawing | undefined> {
    const [drawing] = await db
      .update(drawings)
      .set(updateData)
      .where(eq(drawings.id, id))
      .returning();
    return drawing || undefined;
  }

  async getQuotesByUserId(userId: number): Promise<Quote[]> {
    return await db.select().from(quotes).where(eq(quotes.userId, userId)).orderBy(desc(quotes.createdAt));
  }

  async getRecentQuotes(userId: number, limit: number): Promise<Quote[]> {
    return await db
      .select()
      .from(quotes)
      .where(eq(quotes.userId, userId))
      .orderBy(desc(quotes.createdAt))
      .limit(limit);
  }

  async createQuote(insertQuote: any): Promise<Quote> {
    const [quote] = await db
      .insert(quotes)
      .values(insertQuote)
      .returning();
    return quote;
  }

  async updateQuote(id: number, updateData: any): Promise<Quote | undefined> {
    const [quote] = await db
      .update(quotes)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();
    return quote || undefined;
  }

  async getMaterialCosts(): Promise<MaterialCost[]> {
    return await db.select().from(materialCosts).orderBy(desc(materialCosts.lastUpdated));
  }

  async getMaterialCostsByLocation(region: string, state?: string): Promise<MaterialCost[]> {
    // For now, return all material costs since region/state columns don't exist yet
    return await db.select().from(materialCosts).orderBy(desc(materialCosts.lastUpdated));
  }

  async getDashboardStats(userId: number): Promise<any> {
    // Get basic stats - in production this would be more complex
    const userQuotes = await this.getQuotesByUserId(userId);
    
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    const thisMonthQuotes = userQuotes.filter(quote => {
      const quoteDate = new Date(quote.createdAt);
      return quoteDate.getMonth() === currentMonth && quoteDate.getFullYear() === currentYear;
    });

    const totalValue = thisMonthQuotes.reduce((sum, quote) => sum + parseFloat(quote.totalCost.toString()), 0);
    const approvedQuotes = thisMonthQuotes.filter(quote => quote.status === 'approved');
    const winRate = thisMonthQuotes.length > 0 ? (approvedQuotes.length / thisMonthQuotes.length) * 100 : 0;

    return {
      monthlyQuotes: thisMonthQuotes.length,
      quoteValue: Math.round(totalValue),
      winRate: Math.round(winRate),
      avgTime: 3.2,
      monthlyQuotesChange: 12,
      quoteValueChange: 8,
      winRateChange: -2,
      avgTimeChange: -45,
    };
  }
}

export const storage = new DatabaseStorage();