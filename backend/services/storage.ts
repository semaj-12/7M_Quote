// backend/services/storage.ts
import { hasDb, requireDb } from "./db";

type DrawingRecord = {
  id: number;
  userId: number;
  name: string;
  originalName?: string;
  filePath?: string; // local filename (for fallback retrieval)
  fileSize?: number;
  status: "uploaded" | "processed" | "failed";
  s3Key?: string;
  s3Url?: string;
  storageType: "s3" | "local";
  extractedData?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export const storage = {
  /**
   * Create a drawing row in DB and return it.
   * NOTE: routes.ts only calls this when hasDb === true.
   */
  async createDrawing(data: Omit<DrawingRecord, "id">): Promise<DrawingRecord> {
    if (!hasDb) {
      throw new Error("Database is not configured (DATABASE_URL not set).");
    }
    const { pool } = requireDb();

    // Adjust table/columns to your schema if different
    const sql = `
      INSERT INTO drawings (
        user_id,
        name,
        original_name,
        file_path,
        file_size,
        status,
        s3_key,
        s3_url,
        storage_type,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, user_id as "userId", name, original_name as "originalName",
                file_path as "filePath", file_size as "fileSize", status,
                s3_key as "s3Key", s3_url as "s3Url", storage_type as "storageType",
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const params = [
      data.userId,
      data.name,
      data.originalName ?? null,
      data.filePath ?? null,
      data.fileSize ?? null,
      data.status,
      data.s3Key ?? null,
      data.s3Url ?? null,
      data.storageType,
      data.createdAt,
      data.updatedAt,
    ];

    const result = await pool.query(sql, params);
    return result.rows[0] as DrawingRecord;
  },

  /**
   * Update a drawing row by id.
   */
  async updateDrawing(id: number, updates: Partial<DrawingRecord>): Promise<DrawingRecord> {
    if (!hasDb) {
      throw new Error("Database is not configured (DATABASE_URL not set).");
    }
    const { pool } = requireDb();

    // Build dynamic update set
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${toDbColumn(key)} = $${idx++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      // no updates
      const current = await pool.query(
        `SELECT id, user_id as "userId", name, original_name as "originalName",
                file_path as "filePath", file_size as "fileSize", status,
                s3_key as "s3Key", s3_url as "s3Url", storage_type as "storageType",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM drawings WHERE id = $1`,
        [id]
      );
      return current.rows[0] as DrawingRecord;
    }

    const sql = `
      UPDATE drawings
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, user_id as "userId", name, original_name as "originalName",
                file_path as "filePath", file_size as "fileSize", status,
                s3_key as "s3Key", s3_url as "s3Url", storage_type as "storageType",
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    values.push(id);
    const result = await pool.query(sql, values);
    return result.rows[0] as DrawingRecord;
  },

  /**
   * Get drawings for a user (optional helper).
   */
  async getDrawingsByUser(userId: number): Promise<DrawingRecord[]> {
    if (!hasDb) {
      throw new Error("Database is not configured (DATABASE_URL not set).");
    }
    const { pool } = requireDb();
    const res = await pool.query(
      `SELECT id, user_id as "userId", name, original_name as "originalName",
              file_path as "filePath", file_size as "fileSize", status,
              s3_key as "s3Key", s3_url as "s3Url", storage_type as "storageType",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM drawings WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows as DrawingRecord[];
  },
};

/** Map TS property names to DB column names. Adjust if your schema differs. */
function toDbColumn(prop: string): string {
  switch (prop) {
    case "userId":
      return "user_id";
    case "originalName":
      return "original_name";
    case "filePath":
      return "file_path";
    case "fileSize":
      return "file_size";
    case "s3Key":
      return "s3_key";
    case "s3Url":
      return "s3_url";
    case "storageType":
      return "storage_type";
    case "createdAt":
      return "created_at";
    case "updatedAt":
      return "updated_at";
    default:
      return prop;
  }
}
