import { Pool } from 'pg';

export interface CreateAppointmentInput {
  id: string;
  name: string;
  email: string;
  datetimeISO: string;
  appointmentType?: string;
  facility?: string;
  reason?: string;
}

export interface ToolEventRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  ts: number;
}

export interface OutboxRecord {
  id: string;
  eventId: string;
  eventType: string;
  destination: string;
  payload: Record<string, unknown>;
  status: string;
  retryCount: number;
  lastError?: string;
}

export interface UpsertKbDocumentInput {
  id: string;
  title: string;
  source: string;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  contentHash: string;
}

export interface ReplaceKbSectionInput {
  id: string;
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[] | null;
}

export interface KbSearchCandidateRecord {
  sectionId: string;
  documentId: string;
  title: string;
  source: string;
  content: string;
  keywordRank: number;
  embedding: number[] | null;
  documentMetadata: Record<string, unknown>;
  sectionMetadata: Record<string, unknown>;
}

export interface KbDocumentSummary {
  id: string;
  title: string;
  source: string;
  externalRef?: string;
  updatedAt: string;
  sectionCount: number;
}

export class StarterDb {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        datetime_iso TEXT NOT NULL,
        appointment_type TEXT NULL,
        facility TEXT NULL,
        reason TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tool_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES tool_events(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        destination TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(
      `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'unknown_event'`,
    );

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kb_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        external_ref TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        content_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kb_sections (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        embedding JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_sections_document_chunk ON kb_sections(document_id, chunk_index)`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_kb_sections_fts ON kb_sections USING GIN (to_tsvector('simple', content))`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_kb_documents_source ON kb_documents(source)`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async saveContact(id: string, name: string, email: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO contacts (id, name, email) VALUES ($1, $2, $3)`,
      [id, name, email],
    );
  }

  async createAppointment(input: CreateAppointmentInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO appointments (id, name, email, datetime_iso, appointment_type, facility, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.id,
        input.name,
        input.email,
        input.datetimeISO,
        input.appointmentType || null,
        input.facility || null,
        input.reason || null,
      ],
    );
  }

  async createToolEvent(id: string, eventType: string, payload: Record<string, unknown>, status: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tool_events (id, event_type, payload, status) VALUES ($1, $2, $3::jsonb, $4)`,
      [id, eventType, JSON.stringify(payload), status],
    );
  }

  async setToolEventStatus(id: string, status: string): Promise<void> {
    await this.pool.query(`UPDATE tool_events SET status = $2 WHERE id = $1`, [id, status]);
  }

  async createOutbox(
    id: string,
    eventId: string,
    eventType: string,
    destination: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO outbox (id, event_id, event_type, destination, payload, status, retry_count)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', 0)
      `,
      [id, eventId, eventType, destination, JSON.stringify(payload)],
    );
  }

  async getOutbox(id: string): Promise<OutboxRecord | null> {
    const result = await this.pool.query(
      `
        SELECT
          id,
          event_id,
          event_type,
          destination,
          payload,
          status,
          retry_count,
          last_error
        FROM outbox
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      id: string;
      event_id: string;
      event_type: string;
      destination: string;
      payload: Record<string, unknown>;
      status: string;
      retry_count: number;
      last_error: string | null;
    };

    return {
      id: row.id,
      eventId: row.event_id,
      eventType: row.event_type,
      destination: row.destination,
      payload: row.payload,
      status: row.status,
      retryCount: row.retry_count,
      ...(row.last_error ? { lastError: row.last_error } : {}),
    };
  }

  async markOutboxDelivered(id: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE outbox
        SET status = 'delivered', retry_count = retry_count + 1, last_error = NULL, next_attempt_at = NOW()
        WHERE id = $1
      `,
      [id],
    );
  }

  async markOutboxRetry(id: string, retryCount: number, lastError: string, nextAttemptAt: Date): Promise<void> {
    await this.pool.query(
      `
        UPDATE outbox
        SET
          status = 'retrying',
          retry_count = $2,
          last_error = $3,
          next_attempt_at = $4
        WHERE id = $1
      `,
      [id, retryCount, lastError, nextAttemptAt.toISOString()],
    );
  }

  async markOutboxDead(id: string, retryCount: number, lastError: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE outbox
        SET
          status = 'dead',
          retry_count = $2,
          last_error = $3,
          next_attempt_at = NOW()
        WHERE id = $1
      `,
      [id, retryCount, lastError],
    );
  }

  async upsertKbDocument(input: UpsertKbDocumentInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO kb_documents (id, title, source, external_ref, metadata, content_hash, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          source = EXCLUDED.source,
          external_ref = EXCLUDED.external_ref,
          metadata = EXCLUDED.metadata,
          content_hash = EXCLUDED.content_hash,
          updated_at = NOW()
      `,
      [
        input.id,
        input.title,
        input.source,
        input.externalRef || null,
        JSON.stringify(input.metadata || {}),
        input.contentHash,
      ],
    );
  }

  async replaceKbSections(documentId: string, sections: ReplaceKbSectionInput[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM kb_sections WHERE document_id = $1`, [documentId]);

      for (const section of sections) {
        await client.query(
          `
            INSERT INTO kb_sections (id, document_id, chunk_index, content, metadata, embedding)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
          `,
          [
            section.id,
            documentId,
            section.chunkIndex,
            section.content,
            JSON.stringify(section.metadata || {}),
            section.embedding ? JSON.stringify(section.embedding) : null,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async countKbSections(): Promise<number> {
    const result = await this.pool.query(`SELECT COUNT(*)::BIGINT AS count FROM kb_sections`);
    const row = result.rows[0] as { count: string | number } | undefined;
    return row ? Number(row.count) : 0;
  }

  async searchKbKeyword(query: string, limit: number, source?: string): Promise<KbSearchCandidateRecord[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 40;

    const ftsResult = await this.pool.query(
      `
        SELECT
          s.id AS section_id,
          s.document_id,
          d.title,
          d.source,
          s.content,
          s.embedding,
          d.metadata AS document_metadata,
          s.metadata AS section_metadata,
          ts_rank_cd(to_tsvector('simple', s.content), plainto_tsquery('simple', $1)) AS keyword_rank
        FROM kb_sections s
        INNER JOIN kb_documents d ON d.id = s.document_id
        WHERE to_tsvector('simple', s.content) @@ plainto_tsquery('simple', $1)
          AND ($2::TEXT IS NULL OR d.source = $2)
        ORDER BY keyword_rank DESC, s.created_at DESC
        LIMIT $3
      `,
      [normalizedQuery, source || null, safeLimit],
    );

    const rows = ftsResult.rows;
    if (rows.length > 0) {
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          sectionId: String(r.section_id || ''),
          documentId: String(r.document_id || ''),
          title: String(r.title || ''),
          source: String(r.source || ''),
          content: String(r.content || ''),
          keywordRank: Number(r.keyword_rank || 0),
          embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
          documentMetadata: (r.document_metadata || {}) as Record<string, unknown>,
          sectionMetadata: (r.section_metadata || {}) as Record<string, unknown>,
        };
      });
    }

    const tokens = normalizedQuery
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
      .slice(0, 12);

    const likeResult = await this.pool.query(
      `
        SELECT
          s.id AS section_id,
          s.document_id,
          d.title,
          d.source,
          s.content,
          s.embedding,
          d.metadata AS document_metadata,
          s.metadata AS section_metadata
        FROM kb_sections s
        INNER JOIN kb_documents d ON d.id = s.document_id
        WHERE (
          s.content ILIKE '%' || $1 || '%'
          OR d.title ILIKE '%' || $1 || '%'
          OR EXISTS (
            SELECT 1
            FROM UNNEST($4::TEXT[]) AS token
            WHERE s.content ILIKE '%' || token || '%'
              OR d.title ILIKE '%' || token || '%'
          )
        )
          AND ($2::TEXT IS NULL OR d.source = $2)
        ORDER BY s.created_at DESC
        LIMIT $3
      `,
      [normalizedQuery, source || null, safeLimit, tokens],
    );

    return likeResult.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        sectionId: String(r.section_id || ''),
        documentId: String(r.document_id || ''),
        title: String(r.title || ''),
        source: String(r.source || ''),
        content: String(r.content || ''),
        keywordRank: 0.0001,
        embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
        documentMetadata: (r.document_metadata || {}) as Record<string, unknown>,
        sectionMetadata: (r.section_metadata || {}) as Record<string, unknown>,
      };
    });
  }

  async listKbDocuments(limit = 100): Promise<KbDocumentSummary[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100;
    const result = await this.pool.query(
      `
        SELECT
          d.id,
          d.title,
          d.source,
          d.external_ref,
          d.updated_at,
          COUNT(s.id)::INTEGER AS section_count
        FROM kb_documents d
        LEFT JOIN kb_sections s ON s.document_id = d.id
        GROUP BY d.id
        ORDER BY d.updated_at DESC
        LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      const externalRef = r.external_ref;
      return {
        id: String(r.id || ''),
        title: String(r.title || ''),
        source: String(r.source || ''),
        ...(typeof externalRef === 'string' && externalRef.length > 0 ? { externalRef } : {}),
        updatedAt: new Date(String(r.updated_at || new Date().toISOString())).toISOString(),
        sectionCount: Number(r.section_count || 0),
      };
    });
  }

  async listRecentEvents(limit = 100): Promise<ToolEventRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100;
    const result = await this.pool.query(
      `
        SELECT
          id,
          event_type,
          payload,
          status,
          EXTRACT(EPOCH FROM created_at)::BIGINT AS ts
        FROM tool_events
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row: unknown) => {
      const r = row as {
        id: string;
        event_type: string;
        payload: Record<string, unknown>;
        status: string;
        ts: string | number;
      };
      return {
        id: r.id,
        type: r.event_type,
        payload: r.payload,
        status: r.status,
        ts: Number(r.ts),
      };
    });
  }
}
