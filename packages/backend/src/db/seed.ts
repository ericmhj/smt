import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from './schema/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function seed() {
  console.log('🌱 Seeding database...');

  // Set search_path to sgr_default for tenant-scoped tables
  await client`SET search_path TO sgr_default, public`;

  // --- Users ---
  const superusuarioPassword = await hashPassword('admin123');
  const adminPassword = await hashPassword('admin123');
  const managerPassword = await hashPassword('manager123');
  const tecnicoPassword = await hashPassword('tecnico123');
  const asistentePassword = await hashPassword('asistente123');
  const platformAdminPassword = await hashPassword('platform123');

  // Platform admin user (in sgr_default schema for platform operations)
  await db
    .insert(schema.users)
    .values({
      email: 'platform@sgr.local',
      passwordHash: platformAdminPassword,
      name: 'Platform Admin',
      role: 'platform_admin',
    })
    .onConflictDoNothing({ target: schema.users.email });

  const [superusuario] = await db
    .insert(schema.users)
    .values({
      email: 'admin@sgr.local',
      passwordHash: superusuarioPassword,
      name: 'Super Administrador',
      role: 'superusuario',
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  const [admin] = await db
    .insert(schema.users)
    .values({
      email: 'administrador@sgr.local',
      passwordHash: adminPassword,
      name: 'Administrador de Prueba',
      role: 'admin',
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  const [manager] = await db
    .insert(schema.users)
    .values({
      email: 'manager@sgr.local',
      passwordHash: managerPassword,
      name: 'Manager de Prueba',
      role: 'manager',
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  const [tecnico] = await db
    .insert(schema.users)
    .values({
      email: 'tecnico@sgr.local',
      passwordHash: tecnicoPassword,
      name: 'Técnico de Prueba',
      role: 'tecnico',
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  const [asistente] = await db
    .insert(schema.users)
    .values({
      email: 'asistente@sgr.local',
      passwordHash: asistentePassword,
      name: 'Asistente de Prueba',
      role: 'asistente',
    })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();

  // If users already exist, fetch them
  const { eq } = await import('drizzle-orm');
  const allUsers = await db.select().from(schema.users);
  const su = superusuario || allUsers.find(u => u.email === 'admin@sgr.local')!;
  const ad = admin || allUsers.find(u => u.email === 'administrador@sgr.local')!;
  const mg = manager || allUsers.find(u => u.email === 'manager@sgr.local')!;
  const tc = tecnico || allUsers.find(u => u.email === 'tecnico@sgr.local')!;
  const as_ = asistente || allUsers.find(u => u.email === 'asistente@sgr.local')!;

  console.log('✅ Users created/verified');

  // --- Forms ---
  const [form1] = await db
    .insert(schema.forms)
    .values({
      name: 'Inspección de Equipos',
      slug: 'inspeccion-equipos',
      isActive: true,
      createdBy: su.id,
      currentVersion: 1,
    })
    .onConflictDoNothing({ target: schema.forms.slug })
    .returning();

  const [form2] = await db
    .insert(schema.forms)
    .values({
      name: 'Reporte de Mantenimiento',
      slug: 'reporte-mantenimiento',
      isActive: true,
      createdBy: ad.id,
      currentVersion: 1,
    })
    .onConflictDoNothing({ target: schema.forms.slug })
    .returning();

  // Fetch forms (may already exist)
  const allForms = await db.select().from(schema.forms);
  const f1 = form1 || allForms.find(f => f.slug === 'inspeccion-equipos');
  const f2 = form2 || allForms.find(f => f.slug === 'reporte-mantenimiento');

  if (f1 && f2) {
    console.log('✅ Forms created/verified');

    // --- Form Versions (only if forms were just created) ---
    if (form1 || form2) {
      const sampleHtml1 = `
    <form>
      <label for="equipo">Equipo</label>
      <input type="text" name="equipo" required />
      <label for="estado">Estado</label>
      <select name="estado">
        <option value="bueno">Bueno</option>
        <option value="regular">Regular</option>
        <option value="malo">Malo</option>
      </select>
      <label for="observaciones">Observaciones</label>
      <textarea name="observaciones"></textarea>
    </form>
  `.trim();

      const sampleHtml2 = `
    <form>
      <label for="tipo_mantenimiento">Tipo de Mantenimiento</label>
      <select name="tipo_mantenimiento">
        <option value="preventivo">Preventivo</option>
        <option value="correctivo">Correctivo</option>
      </select>
      <label for="descripcion">Descripción</label>
      <textarea name="descripcion" required></textarea>
      <label for="fecha_realizacion">Fecha de Realización</label>
      <input type="date" name="fecha_realizacion" required />
    </form>
  `.trim();

      if (form1) {
        await db.insert(schema.formVersions).values({
          formId: f1.id,
          versionNumber: 1,
          htmlContent: sampleHtml1,
          sanitizedHtml: sampleHtml1,
          jsonSchema: {
            type: 'object',
            properties: {
              equipo: { type: 'string' },
              estado: { type: 'string', enum: ['bueno', 'regular', 'malo'] },
              observaciones: { type: 'string' },
            },
            required: ['equipo'],
          },
          fieldsMetadata: [
            { name: 'equipo', type: 'text', required: true },
            { name: 'estado', type: 'select', required: false },
            { name: 'observaciones', type: 'textarea', required: false },
          ],
          changeType: 'initial',
          createdBy: su.id,
        }).onConflictDoNothing();
      }

      if (form2) {
        await db.insert(schema.formVersions).values({
          formId: f2.id,
          versionNumber: 1,
          htmlContent: sampleHtml2,
          sanitizedHtml: sampleHtml2,
          jsonSchema: {
            type: 'object',
            properties: {
              tipo_mantenimiento: { type: 'string', enum: ['preventivo', 'correctivo'] },
              descripcion: { type: 'string' },
              fecha_realizacion: { type: 'string', format: 'date' },
            },
            required: ['descripcion', 'fecha_realizacion'],
          },
          fieldsMetadata: [
            { name: 'tipo_mantenimiento', type: 'select', required: false },
            { name: 'descripcion', type: 'textarea', required: true },
            { name: 'fecha_realizacion', type: 'date', required: true },
          ],
          changeType: 'initial',
          createdBy: ad.id,
        }).onConflictDoNothing();
      }

      console.log('✅ Form versions created');
    }

    // --- Form Assignments ---
    await db.insert(schema.formAssignments).values([
      {
        formId: f1.id,
        tecnicoId: tc.id,
        assignedBy: mg.id,
        isActive: true,
      },
      {
        formId: f2.id,
        tecnicoId: tc.id,
        assignedBy: ad.id,
        isActive: true,
      },
    ]).onConflictDoNothing();

    console.log('✅ Form assignments created/verified');
  }

  // --- Formulario NOM-025-STPS-2008 ---
  const [formNom025] = await db
    .insert(schema.forms)
    .values({
      name: 'Ensayo NOM-025-STPS-2008 Iluminación',
      slug: 'ensayo-nom025-iluminacion',
      isActive: true,
      createdBy: su.id,
      currentVersion: 1,
    })
    .onConflictDoNothing({ target: schema.forms.slug })
    .returning();

  const allFormsAfter = await db.select().from(schema.forms);
  const fNom025 = formNom025 || allFormsAfter.find(f => f.slug === 'ensayo-nom025-iluminacion');

  if (fNom025 && formNom025) {
    // Read HTML from file
    const nom025Html = readFileSync(join(__dirname, 'seed-data', 'formulario-nom025.html'), 'utf-8');

    await db.insert(schema.formVersions).values({
      formId: fNom025.id,
      versionNumber: 1,
      htmlContent: nom025Html,
      sanitizedHtml: nom025Html,
      jsonSchema: {
        type: 'object',
        properties: {
          informe_numero: { type: 'string' },
          objetivo_razon_social: { type: 'string' },
          objetivo_ubicacion: { type: 'string' },
          campo_empresa: { type: 'string' },
          campo_ubicacion: { type: 'string' },
          centro_razon_social: { type: 'string' },
          centro_rfc: { type: 'string' },
          centro_domicilio: { type: 'string' },
          centro_telefono: { type: 'string' },
          centro_actividad: { type: 'string' },
          centro_contacto: { type: 'string' },
          centro_horarios: { type: 'string' },
          ensayo_lugar_emision: { type: 'string' },
          ensayo_fecha_emision: { type: 'string' },
          ensayo_fecha: { type: 'string' },
          ensayo_lugar: { type: 'string' },
          ensayo_signatario: { type: 'string' },
          ensayo_folio: { type: 'string' },
          desarrollo_condiciones: { type: 'string' },
          conclusion_texto: { type: 'string' },
        },
        required: ['objetivo_razon_social', 'centro_razon_social', 'ensayo_fecha'],
      },
      fieldsMetadata: [
        { name: 'informe_numero', type: 'text', required: false },
        { name: 'objetivo_razon_social', type: 'text', required: true },
        { name: 'objetivo_ubicacion', type: 'text', required: false },
        { name: 'centro_razon_social', type: 'text', required: true },
        { name: 'centro_rfc', type: 'text', required: false },
        { name: 'ensayo_fecha', type: 'date', required: true },
        { name: 'desarrollo_condiciones', type: 'textarea', required: false },
        { name: 'conclusion_texto', type: 'textarea', required: false },
      ],
      changeType: 'initial',
      createdBy: su.id,
    }).onConflictDoNothing();

    // Assign NOM-025 form to tecnico
    await db.insert(schema.formAssignments).values({
      formId: fNom025.id,
      tecnicoId: tc.id,
      assignedBy: mg.id,
      isActive: true,
    }).onConflictDoNothing();

    console.log('✅ Formulario NOM-025 created/verified');
  }

  // --- Clientes de Prueba ---
  await db.insert(schema.clientes).values([
    {
      nombre: 'Industrias del Norte S.A. de C.V.',
      empresa: 'Industrias del Norte',
      rfc: 'INO850101ABC',
      email: 'cmendoza@industriasnorte.com',
      telefono: '+52 81 1234 5678',
      direccionCentroTrabajo: 'Av. Industrial 450, Col. Centro, Monterrey, Nuevo León, C.P. 64000',
      actividadPrincipal: 'Manufactura de piezas metálicas y ensamble industrial',
      contacto: 'Carlos Mendoza — Gerente de Planta',
      horarios: 'Lunes a Viernes 7:00 - 17:00, Sábado 8:00 - 13:00',
      industria: 'industrial',
      etiquetas: ['zona-norte', 'prioridad-alta'],
      activo: true,
    },
    {
      nombre: 'Laboratorios Farmacéuticos MX S.A. de C.V.',
      empresa: 'LabFarma MX',
      rfc: 'LFM990315XYZ',
      email: 'mgarcia@labfarmamx.com',
      telefono: '+52 55 9876 5432',
      direccionCentroTrabajo: 'Calle Salud 120, Col. Doctores, Alcaldía Cuauhtémoc, CDMX, C.P. 06720',
      actividadPrincipal: 'Producción y control de calidad de medicamentos',
      contacto: 'María García López — Responsable de Seguridad e Higiene',
      horarios: 'Lunes a Viernes 8:00 - 18:00',
      industria: 'farmaceutica',
      etiquetas: ['farmaceutica', 'recurrente'],
      activo: true,
    },
    {
      nombre: 'Alimentos Orgánicos del Bajío S.A. de C.V.',
      empresa: 'Orgánicos del Bajío',
      rfc: 'AOB100520QRS',
      email: 'rsanchez@alimentosbajio.mx',
      telefono: '+52 477 555 1234',
      direccionCentroTrabajo: 'Carretera León-Silao Km 8, Parque Industrial, Silao, Guanajuato, C.P. 36100',
      actividadPrincipal: 'Procesamiento y envasado de alimentos orgánicos',
      contacto: 'Roberto Sánchez Vega — Jefe de Producción',
      horarios: 'Lunes a Sábado 6:00 - 14:00 (Turno 1), 14:00 - 22:00 (Turno 2)',
      industria: 'alimentos',
      etiquetas: ['alimentos', 'nuevo'],
      activo: true,
    },
  ]).onConflictDoNothing();

  console.log('✅ Clientes de prueba created/verified');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('Test accounts:');
  console.log('  Platform Admin: platform@sgr.local / platform123');
  console.log('  Superusuario:   admin@sgr.local / admin123');
  console.log('  Admin:          administrador@sgr.local / admin123');
  console.log('  Manager:        manager@sgr.local / manager123');
  console.log('  Técnico:        tecnico@sgr.local / tecnico123');
  console.log('  Asistente:      asistente@sgr.local / asistente123');

  await client.end();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
