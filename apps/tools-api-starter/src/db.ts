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
