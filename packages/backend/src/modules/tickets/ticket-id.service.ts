/**
 * Ticket ID Generation Service
 *
 * Generates ticket identifiers based on per-tenant configuration.
 * Supports customizable prefix, sequential format (A001, 001, 0001),
 * and reset period (trimestral, mensual, anual, nunca).
 *
 * Always generates both:
 * - id_interno: using system hashId (for platform control)
 * - id_visible: using tenant's custom prefix (what the user sees)
 */

import { eq, sql } from 'drizzle-orm';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import type { Database } from '../../db/index.js';

interface TicketIdConfig {
  prefix: string | null;
  seqFormat: string; // 'A001' | '001' | '0001'
  seqReset: string; // 'trimestral' | 'mensual' | 'anual' | 'nunca'
  currentLetter: string;
  currentNumber: number;
  currentPeriod: string;
}

interface GeneratedId {
  idInterno: string;
  idVisible: string;
  periodo: string;
  consecutivo: number;
}

export class TicketIdService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Generate the next ticket identifier for a tenant.
   * Atomic: uses SELECT FOR UPDATE to prevent race conditions.
   */
  async generateId(tenantSlug: string): Promise<GeneratedId> {
    const sqlClient = getSqlClient();

    // Get tenant hashId
    const tenantResult = await this.db
      .select({ hashId: tenants.hashId })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    const hashId = tenantResult[0]?.hashId || '0000';

    // Get or create config (atomic)
    const config = await this.getOrCreateConfig(sqlClient);

    // Calculate current period
    const now = new Date();
    const currentPeriod = this.calculatePeriod(now, config.seqReset);
    const dateStr = this.formatDate(now);

    // Check if period changed → reset counter
    let letter = config.currentLetter;
    let number = config.currentNumber;

    if (currentPeriod !== config.currentPeriod) {
      letter = 'A';
      number = 0;
    }

    // Increment
    number++;
    const maxForFormat = this.getMaxNumber(config.seqFormat);

    if (number > maxForFormat) {
      // Roll to next letter
      letter = String.fromCharCode(letter.charCodeAt(0) + 1);
      number = 1;
      if (letter > 'Z') {
        // Extremely unlikely: 25,974+ tickets in one period
        letter = 'A';
      }
    }

    // Format the sequential part
    const seqStr = this.formatSequential(letter, number, config.seqFormat);

    // Build IDs
    const idInterno = `${hashId}-${dateStr}-${seqStr}`;
    const prefix = config.prefix || hashId;
    const idVisible = `${prefix}-${dateStr}-${seqStr}`;

    // Update config atomically
    await sqlClient.unsafe(
      `UPDATE ticket_id_config SET current_letter = $1, current_number = $2, current_period = $3, updated_at = NOW() WHERE id = (SELECT id FROM ticket_id_config LIMIT 1)`,
      [letter, number, currentPeriod],
    );

    // Insert into registry
    const consecutivoAbsoluto = (letter.charCodeAt(0) - 65) * maxForFormat + number;

    return {
      idInterno,
      idVisible,
      periodo: currentPeriod,
      consecutivo: consecutivoAbsoluto,
    };
  }

  /**
   * Get the tenant's ticket ID config, creating default if none exists.
   */
  private async getOrCreateConfig(sqlClient: ReturnType<typeof getSqlClient>): Promise<TicketIdConfig> {
    // Use FOR UPDATE to lock the row during generation
    const result = await sqlClient.unsafe(
      `SELECT prefix, seq_format, seq_reset, current_letter, current_number, current_period
       FROM ticket_id_config
       LIMIT 1
       FOR UPDATE`,
    );

    if (result.length > 0) {
      const row = result[0];
      return {
        prefix: row.prefix,
        seqFormat: row.seq_format,
        seqReset: row.seq_reset,
        currentLetter: row.current_letter,
        currentNumber: row.current_number,
        currentPeriod: row.current_period,
      };
    }

    // Create default config
    const now = new Date();
    const period = this.calculatePeriod(now, 'trimestral');

    await sqlClient.unsafe(
      `INSERT INTO ticket_id_config (prefix, seq_format, seq_reset, current_letter, current_number, current_period)
       VALUES (NULL, 'A001', 'trimestral', 'A', 0, $1)`,
      [period],
    );

    return {
      prefix: null,
      seqFormat: 'A001',
      seqReset: 'trimestral',
      currentLetter: 'A',
      currentNumber: 0,
      currentPeriod: period,
    };
  }

  /**
   * Calculate the period string based on reset type.
   */
  private calculatePeriod(date: Date, resetType: string): string {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    switch (resetType) {
      case 'trimestral': {
        const quarter = Math.ceil(month / 3);
        return `${year}-Q${quarter}`;
      }
      case 'mensual':
        return `${year}-${String(month).padStart(2, '0')}`;
      case 'anual':
        return `${year}`;
      case 'nunca':
        return 'ALL';
      default:
        return `${year}-Q${Math.ceil(month / 3)}`;
    }
  }

  /**
   * Format today's date as YYYYMMDD.
   */
  private formatDate(date: Date): string {
    return date.getUTCFullYear().toString() +
      String(date.getUTCMonth() + 1).padStart(2, '0') +
      String(date.getUTCDate()).padStart(2, '0');
  }

  /**
   * Get the max number before rolling to next letter.
   */
  private getMaxNumber(seqFormat: string): number {
    switch (seqFormat) {
      case 'A001': return 999;
      case '001': return 999;
      case '0001': return 9999;
      default: return 999;
    }
  }

  /**
   * Format the sequential part based on config.
   */
  private formatSequential(letter: string, number: number, seqFormat: string): string {
    switch (seqFormat) {
      case 'A001':
        return `${letter}${String(number).padStart(3, '0')}`;
      case '001':
        return String(number).padStart(3, '0');
      case '0001':
        return String(number).padStart(4, '0');
      default:
        return `${letter}${String(number).padStart(3, '0')}`;
    }
  }

  /**
   * Get the current config (for UI display).
   */
  async getConfig(): Promise<TicketIdConfig | null> {
    const sqlClient = getSqlClient();
    const result = await sqlClient.unsafe(
      `SELECT prefix, seq_format, seq_reset, current_letter, current_number, current_period
       FROM ticket_id_config LIMIT 1`,
    );

    if (result.length === 0) return null;

    const row = result[0];
    return {
      prefix: row.prefix,
      seqFormat: row.seq_format,
      seqReset: row.seq_reset,
      currentLetter: row.current_letter,
      currentNumber: row.current_number,
      currentPeriod: row.current_period,
    };
  }

  /**
   * Update the config (from UI).
   */
  async updateConfig(prefix: string | null, seqFormat: string, seqReset: string): Promise<void> {
    const sqlClient = getSqlClient();
    const exists = await sqlClient.unsafe(`SELECT id FROM ticket_id_config LIMIT 1`);

    if (exists.length > 0) {
      await sqlClient.unsafe(
        `UPDATE ticket_id_config SET prefix = $1, seq_format = $2, seq_reset = $3, updated_at = NOW()
         WHERE id = (SELECT id FROM ticket_id_config LIMIT 1)`,
        [prefix, seqFormat, seqReset],
      );
    } else {
      const period = this.calculatePeriod(new Date(), seqReset);
      await sqlClient.unsafe(
        `INSERT INTO ticket_id_config (prefix, seq_format, seq_reset, current_letter, current_number, current_period)
         VALUES ($1, $2, $3, 'A', 0, $4)`,
        [prefix, seqFormat, seqReset, period],
      );
    }
  }

  /**
   * Register a generated ID in the registry table.
   */
  async registerInRegistry(ticketId: string, generated: GeneratedId): Promise<void> {
    const sqlClient = getSqlClient();
    await sqlClient.unsafe(
      `INSERT INTO ticket_id_registry (ticket_id, id_interno, id_visible, periodo, consecutivo)
       VALUES ($1, $2, $3, $4, $5)`,
      [ticketId, generated.idInterno, generated.idVisible, generated.periodo, generated.consecutivo],
    );
  }
}
