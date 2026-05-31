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

  const [superusuario] = await db
    .insert(schema.users)
    .values({
      email: 'admin@sgr.local',
      passwordHash: superusuarioPassword,
      name: 'Super Administrador',
      role: 'superusuario',
    })
    .returning();

  const [admin] = await db
    .insert(schema.users)
    .values({
      email: 'administrador@sgr.local',
      passwordHash: adminPassword,
      name: 'Administrador de Prueba',
      role: 'admin',
    })
    .returning();

  const [manager] = await db
    .insert(schema.users)
    .values({
      email: 'manager@sgr.local',
      passwordHash: managerPassword,
      name: 'Manager de Prueba',
      role: 'manager',
    })
    .returning();

  const [tecnico] = await db
    .insert(schema.users)
    .values({
      email: 'tecnico@sgr.local',
      passwordHash: tecnicoPassword,
      name: 'Técnico de Prueba',
      role: 'tecnico',
    })
    .returning();

  console.log('✅ Users created');

  // --- Forms ---
  const [form1] = await db
    .insert(schema.forms)
    .values({
      name: 'Inspección de Equipos',
      slug: 'inspeccion-equipos',
      isActive: true,
      createdBy: superusuario.id,
      currentVersion: 1,
    })
    .returning();

  const [form2] = await db
    .insert(schema.forms)
    .values({
      name: 'Reporte de Mantenimiento',
      slug: 'reporte-mantenimiento',
      isActive: true,
      createdBy: admin.id,
      currentVersion: 1,
    })
    .returning();

  console.log('✅ Forms created');

  // --- Form Versions ---
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

  await db.insert(schema.formVersions).values([
    {
      formId: form1.id,
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
      fieldsMetadata: {
        fields: [
          { name: 'equipo', type: 'text', required: true },
          { name: 'estado', type: 'select', required: false },
          { name: 'observaciones', type: 'textarea', required: false },
        ],
      },
      changeType: 'initial',
      createdBy: superusuario.id,
    },
    {
      formId: form2.id,
      versionNumber: 1,
      htmlContent: sampleHtml2,
      sanitizedHtml: sampleHtml2,
      jsonSchema: {
        type: 'object',
        properties: {
          tipo_mantenimiento: {
            type: 'string',
            enum: ['preventivo', 'correctivo'],
          },
          descripcion: { type: 'string' },
          fecha_realizacion: { type: 'string', format: 'date' },
        },
        required: ['descripcion', 'fecha_realizacion'],
      },
      fieldsMetadata: {
        fields: [
          { name: 'tipo_mantenimiento', type: 'select', required: false },
          { name: 'descripcion', type: 'textarea', required: true },
          { name: 'fecha_realizacion', type: 'date', required: true },
        ],
      },
      changeType: 'initial',
      createdBy: admin.id,
    },
  ]);

  console.log('✅ Form versions created');

  // --- Form Assignments ---
  await db.insert(schema.formAssignments).values([
    {
      formId: form1.id,
      tecnicoId: tecnico.id,
      assignedBy: manager.id,
      isActive: true,
    },
    {
      formId: form2.id,
      tecnicoId: tecnico.id,
      assignedBy: admin.id,
      isActive: true,
    },
  ]);

  console.log('✅ Form assignments created');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('Test accounts:');
  console.log('  Superusuario: admin@sgr.local / admin123');
  console.log('  Admin:        administrador@sgr.local / admin123');
  console.log('  Manager:      manager@sgr.local / manager123');
  console.log('  Técnico:      tecnico@sgr.local / tecnico123');

  await client.end();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
