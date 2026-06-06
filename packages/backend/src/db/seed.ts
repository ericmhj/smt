import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import * as schema from './schema/index.js';

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

  // --- Users ---
  const superusuarioPassword = await hashPassword('admin123');
  const adminPassword = await hashPassword('admin123');
  const managerPassword = await hashPassword('manager123');
  const tecnicoPassword = await hashPassword('tecnico123');
  const asistentePassword = await hashPassword('asistente123');

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

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('Test accounts:');
  console.log('  Superusuario: admin@sgr.local / admin123');
  console.log('  Admin:        administrador@sgr.local / admin123');
  console.log('  Manager:      manager@sgr.local / manager123');
  console.log('  Técnico:      tecnico@sgr.local / tecnico123');
  console.log('  Asistente:    asistente@sgr.local / asistente123');

  await client.end();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
