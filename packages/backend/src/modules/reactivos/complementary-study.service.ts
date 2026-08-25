import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos } from '../../db/schema/reactivos.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { tickets, slaConfig } from '../../db/schema/tickets.js';
import { ReactivoError, ReactivoErrorCode } from './reactivo.errors.js';
import type {
  CreateComplementaryStudyDTO,
  ComplementaryStudyMetadata,
  ComplementaryStudyResponse,
  PuntoFueraCumplimiento,
} from './reactivo.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class ComplementaryStudyService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Calculate a date that is N business days (Mon-Fri) after the given date.
   */
  private addBusinessDays(startDate: Date, days: number): Date {
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }
    return result;
  }

  /**
   * Automatically triggered when a reactivo transitions to 'finalizado'.
   * Analyzes compliance, and if there are failed points, creates a complementary study.
   *
   * The created tarjeta is BLOCKED for the first 3 business days after creation
   * (the técnico cannot submit it during this period).
   *
   * Returns null if all points are in compliance (no complementary study needed).
   */
  async autoCreateIfNeeded(
    finalizedReactivoId: string,
    actor: JWTPayload,
  ): Promise<ComplementaryStudyResponse | null> {
    // 1. Get the finalized reactivo
    const originalResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, finalizedReactivoId))
      .limit(1);

    const original = originalResult[0];
    if (!original) return null;

    // Only proceed if state is finalizado
    if (original.state !== 'finalizado') return null;

    // 2. Analyze compliance from responses
    const responses = (original.responses || {}) as Record<string, unknown>;
    const compliance = this.analyzeCompliance(responses);

    // If all points comply, no complementary study needed
    if (compliance.puntosFueraCumplimiento.length === 0) {
      console.log(
        `[ComplementaryStudy] Reactivo ${finalizedReactivoId}: todos los puntos en cumplimiento, no se requiere estudio complementario`,
      );
      return null;
    }

    // 3. Check if a complementary study already exists for this reactivo
    // (avoid duplicates if transition is triggered multiple times)
    const existingResult = await this.db
      .select({ id: reactivos.id })
      .from(reactivos)
      .where(eq(reactivos.parentReactivoId, finalizedReactivoId))
      .limit(1);

    if (existingResult.length > 0) {
      console.log(
        `[ComplementaryStudy] Reactivo ${finalizedReactivoId}: ya existe un estudio complementario (${existingResult[0]!.id})`,
      );
      return null;
    }

    // 4. Create the complementary study automatically
    console.log(
      `[ComplementaryStudy] Reactivo ${finalizedReactivoId}: ${compliance.puntosFueraCumplimiento.length} punto(s) fuera de cumplimiento, creando estudio complementario`,
    );

    return this.createComplementaryStudy(
      finalizedReactivoId,
      { puntosFallidos: compliance.puntosFueraCumplimiento },
      actor,
    );
  }

  /**
   * Create a complementary compliance study from a finalized reactivo.
   *
   * This generates a new reactivo (tarjeta) that:
   * - Only contains the sampling points that failed compliance
   * - Is scheduled 10 business days from creation
   * - Is BLOCKED for 3 business days (cannot be submitted)
   * - References the original study (parentReactivoId)
   * - Includes metadata marking it as a complementary compliance study
   */
  async createComplementaryStudy(
    originalReactivoId: string,
    dto: CreateComplementaryStudyDTO,
    actor: JWTPayload,
  ): Promise<ComplementaryStudyResponse> {
    // 1. Validate the original reactivo exists and is finalized
    const originalResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, originalReactivoId))
      .limit(1);

    const original = originalResult[0];
    if (!original) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo de origen no encontrado',
      );
    }

    if (original.state !== 'finalizado') {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.NOT_FINALIZED,
        'Solo se puede crear un estudio complementario a partir de un estudio finalizado',
      );
    }

    // 2. Validate there are failed points
    if (!dto.puntosFallidos || dto.puntosFallidos.length === 0) {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.NO_FAILED_POINTS,
        'Debe especificar al menos un punto fuera de cumplimiento',
      );
    }

    // 3. Get the ticket linked to the original reactivo (to get the identificador/informe_no)
    const ticketResult = await this.db
      .select({ identificador: tickets.identificador, clienteId: tickets.clienteId })
      .from(tickets)
      .where(eq(tickets.reactivoId, originalReactivoId))
      .limit(1);

    const originalTicket = ticketResult[0];
    const informeOrigenNo = originalTicket?.identificador || original.id;

    // 4. Get the form version (same as original)
    const formVersionResult = await this.db
      .select({ id: formVersions.id })
      .from(formVersions)
      .where(eq(formVersions.id, original.formVersionId))
      .limit(1);

    if (formVersionResult.length === 0) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.VERSION_NOT_FOUND,
        'Versión del formulario no encontrada',
      );
    }

    // 5. Determine técnico (use specified or the same as original)
    const tecnicoId = dto.tecnicoAsignadoId || original.tecnicoId;

    // 6. Calculate dates
    const now = new Date();
    const fechaProgramada = this.addBusinessDays(now, 10); // Scheduled: 10 business days
    const bloqueadoHasta = this.addBusinessDays(now, 3);   // Blocked: 3 business days

    // 7. Build metadata for the complementary study
    const metadata: ComplementaryStudyMetadata = {
      tipo: 'complementario_cumplimiento',
      formularioOrigenId: originalReactivoId,
      informeOrigenNo,
      anotacion: `Estudio complementario de cumplimiento del informe ${informeOrigenNo}. Puntos fuera de cumplimiento: ${dto.puntosFallidos.map((p) => `Pto.${p.puntoId} (${p.area}/${p.zona} - ${p.criterioFallido})`).join(', ')}`,
      puntosFallidos: dto.puntosFallidos,
      fechaCreacion: now.toISOString(),
      bloqueadoHasta: bloqueadoHasta.toISOString(),
    };

    // 8. Build pre-filled responses from the original (client data) + metadata
    const originalResponses = (original.responses || {}) as Record<string, unknown>;
    const preFilledResponses: Record<string, unknown> = {};

    // Copy client-related fields from original
    const clientFields = [
      'centro_razon_social',
      'objetivo_razon_social',
      'centro_rfc',
      'centro_domicilio',
      'objetivo_ubicacion',
      'centro_telefono',
      'centro_actividad',
      'centro_contacto',
      'centro_horarios',
    ];
    for (const field of clientFields) {
      if (originalResponses[field]) {
        preFilledResponses[field] = originalResponses[field];
      }
    }

    // Inject complementary study metadata into responses
    preFilledResponses._complementary_metadata = metadata;

    // 9. Generate ticket identifier for the complementary study
    const ticketIdService = new (await import('../tickets/ticket-id.service.js')).TicketIdService(
      this.db,
    );
    const generated = await ticketIdService.generateId(actor.tenantSlug);

    // Set the new informe number
    preFilledResponses.informe_no = generated.idVisible;

    // 10. Create the new reactivo
    const reactivoResult = await this.db
      .insert(reactivos)
      .values({
        formId: original.formId,
        formVersionId: original.formVersionId,
        tecnicoId,
        parentReactivoId: originalReactivoId,
        attemptNumber: 1,
        state: 'pendiente',
        responses: preFilledResponses,
        fechaProgramada,
        clienteNombre: original.clienteNombre,
      })
      .returning();

    const newReactivo = reactivoResult[0]!;

    // 11. Create the associated ticket
    // Get SLA config for 'media' priority (default for complementary studies)
    const slaResult = await this.db
      .select()
      .from(slaConfig)
      .where(eq(slaConfig.prioridad, 'media'))
      .limit(1);

    const slaHoras = slaResult[0]?.horasLimite || 72;
    const fechaLimite = new Date(now.getTime() + slaHoras * 60 * 60 * 1000);

    const clienteId = originalTicket?.clienteId;

    let ticketId = '';
    let ticketIdentificador = generated.idVisible;

    if (clienteId) {
      const ticketInsertResult = await this.db
        .insert(tickets)
        .values({
          identificador: generated.idVisible,
          clienteId,
          formId: original.formId,
          tecnicoAsignadoId: tecnicoId,
          reactivoId: newReactivo.id,
          prioridad: 'media',
          slaHoras,
          estado: 'pendiente',
          fechaLimite,
          creadoPor: actor.sub,
        })
        .returning();

      const newTicket = ticketInsertResult[0]!;
      ticketId = newTicket.id;
      ticketIdentificador = newTicket.identificador;

      // Register in the ID registry
      await ticketIdService.registerInRegistry(newTicket.id, generated);
    }

    console.log(
      `[ComplementaryStudy] Creado estudio complementario ${newReactivo.id} (ticket: ${ticketIdentificador}) bloqueado hasta ${bloqueadoHasta.toISOString()}`,
    );

    // 12. Return the response
    return {
      id: newReactivo.id,
      formId: newReactivo.formId,
      formVersionId: newReactivo.formVersionId,
      tecnicoId: newReactivo.tecnicoId,
      parentReactivoId: newReactivo.parentReactivoId,
      attemptNumber: newReactivo.attemptNumber,
      state: newReactivo.state as 'pendiente',
      responses: newReactivo.responses as Record<string, unknown>,
      rejectionReason: newReactivo.rejectionReason,
      createdAt: newReactivo.createdAt.toISOString(),
      updatedAt: newReactivo.updatedAt.toISOString(),
      metadata,
      ticketId,
      ticketIdentificador,
    };
  }

  /**
   * Check if a reactivo is currently blocked (within the 3 business day lock period).
   */
  isBlocked(responses: Record<string, unknown>): { blocked: boolean; bloqueadoHasta?: string } {
    const meta = responses._complementary_metadata as ComplementaryStudyMetadata | undefined;
    if (!meta || meta.tipo !== 'complementario_cumplimiento') {
      return { blocked: false };
    }

    const bloqueadoHasta = new Date(meta.bloqueadoHasta);
    const now = new Date();

    if (now < bloqueadoHasta) {
      return { blocked: true, bloqueadoHasta: meta.bloqueadoHasta };
    }

    return { blocked: false };
  }

  /**
   * Get compliance summary from a finalized reactivo's responses.
   * Analyzes responses to identify sampling points that failed compliance.
   */
  async getComplianceSummary(
    reactivoId: string,
  ): Promise<{
    totalPuntos: number;
    puntosEnCumplimiento: number;
    puntosFueraCumplimiento: PuntoFueraCumplimiento[];
  }> {
    const result = await this.db
      .select({ responses: reactivos.responses, state: reactivos.state })
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = result[0];
    if (!reactivo) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    if (reactivo.state !== 'finalizado') {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.NOT_FINALIZED,
        'Solo se puede evaluar cumplimiento de un estudio finalizado',
      );
    }

    const responses = (reactivo.responses || {}) as Record<string, unknown>;
    return this.analyzeCompliance(responses);
  }

  /**
   * Analyze compliance from form responses.
   * Extracts measurement data per sampling point and evaluates against NMI/NMP thresholds.
   */
  private analyzeCompliance(responses: Record<string, unknown>): {
    totalPuntos: number;
    puntosEnCumplimiento: number;
    puntosFueraCumplimiento: PuntoFueraCumplimiento[];
  } {
    const puntosFallidos: PuntoFueraCumplimiento[] = [];
    const puntosData = new Map<
      number,
      {
        area: string;
        zona: string;
        tipoPunto: 'nocturno' | 'natural';
        lxValues: number[];
        kfValues: number[];
        uLx: number;
        uKf: number;
        nmi: number;
        nmp: number;
      }
    >();

    // Parse responses to extract point data
    // Response keys follow the pattern: {blockId}_r{punto}_field
    for (const [key, value] of Object.entries(responses)) {
      // Skip metadata keys
      if (key.startsWith('_')) continue;

      const areaPointMatch = key.match(/^(.+?)_r(\d+)_(.+)$/);
      if (!areaPointMatch) continue;

      const [, blockId, puntoStr, field] = areaPointMatch;
      const puntoId = parseInt(puntoStr!, 10);
      if (isNaN(puntoId)) continue;

      if (!puntosData.has(puntoId)) {
        puntosData.set(puntoId, {
          area: '',
          zona: '',
          tipoPunto: 'nocturno',
          lxValues: [],
          kfValues: [],
          uLx: 0,
          uKf: 0,
          nmi: 500,
          nmp: 50,
        });
      }

      const punto = puntosData.get(puntoId)!;

      if (field === 'area') punto.area = String(value || '');
      else if (field === 'zona') punto.zona = String(value || '');
      else if (field === 'u_lx') punto.uLx = parseFloat(String(value)) || 0;
      else if (field === 'u_pct') punto.uKf = parseFloat(String(value)) || 0;
      else if (field === 'nmi') punto.nmi = parseFloat(String(value)) || 500;
      else if (field === 'nmp') punto.nmp = parseFloat(String(value)) || 50;

      // Measurement values: {blockId}_r{N}_m{M}_lx
      const medMatch = field!.match(/^m(\d+)_lx$/);
      if (medMatch) {
        const v = parseFloat(String(value));
        if (!isNaN(v) && v > 0) punto.lxValues.push(v);
        if (punto.lxValues.length > 1) punto.tipoPunto = 'natural';
      }

      // Kf values: {blockId}_r{N}_m{M}_e1 and e2
      const e1Match = field!.match(/^m(\d+)_e1$/);
      if (e1Match) {
        const e1 = parseFloat(String(value));
        const e2Key = `${blockId}_r${puntoStr}_m${e1Match[1]}_e2`;
        const e2 = parseFloat(String(responses[e2Key]));
        if (!isNaN(e1) && !isNaN(e2) && e2 !== 0) {
          punto.kfValues.push((e1 / e2) * 100);
        }
      }
    }

    // Evaluate compliance per point
    let totalPuntos = 0;
    let puntosEnCumplimiento = 0;

    for (const [puntoId, punto] of puntosData.entries()) {
      if (punto.lxValues.length === 0) continue;
      totalPuntos++;

      const avgLx = punto.lxValues.reduce((a, b) => a + b, 0) / punto.lxValues.length;
      const lxCumple = avgLx - punto.uLx >= punto.nmi;

      let kfCumple = true;
      let avgKf = 0;
      if (punto.kfValues.length > 0) {
        avgKf = punto.kfValues.reduce((a, b) => a + b, 0) / punto.kfValues.length;
        kfCumple = avgKf + punto.uKf <= punto.nmp;
      }

      if (lxCumple && kfCumple) {
        puntosEnCumplimiento++;
      } else {
        let criterioFallido: 'iluminancia' | 'kf' | 'ambos';
        if (!lxCumple && !kfCumple) criterioFallido = 'ambos';
        else if (!lxCumple) criterioFallido = 'iluminancia';
        else criterioFallido = 'kf';

        puntosFallidos.push({
          puntoId,
          area: punto.area || `Área ${puntoId}`,
          zona: punto.zona || '',
          tipoPunto: punto.tipoPunto,
          criterioFallido,
          valorMedido: criterioFallido === 'kf' ? avgKf : avgLx,
          valorLimite: criterioFallido === 'kf' ? punto.nmp : punto.nmi,
          incertidumbre: criterioFallido === 'kf' ? punto.uKf : punto.uLx,
        });
      }
    }

    return {
      totalPuntos,
      puntosEnCumplimiento,
      puntosFueraCumplimiento: puntosFallidos,
    };
  }
}
