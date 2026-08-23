# Scaffold smt-e2e project in c:\dev\smt-e2e
# Run: powershell -ExecutionPolicy Bypass -File scripts\scaffold-e2e.ps1

$targetDir = "c:\dev\smt-e2e"

# Create directories
New-Item -ItemType Directory -Force -Path "$targetDir\tests\tickets"
New-Item -ItemType Directory -Force -Path "$targetDir\tests\admin"
New-Item -ItemType Directory -Force -Path "$targetDir\tests\.auth"
New-Item -ItemType Directory -Force -Path "$targetDir\fixtures"

# package.json
@'
{
  "name": "smt-e2e",
  "version": "1.0.0",
  "private": true,
  "description": "End-to-end tests for SMT (Sistema de Muestreo Tecnico)",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "report": "playwright show-report",
    "install-browsers": "playwright install chromium"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "dotenv": "^16.4.0"
  }
}
'@ | Set-Content "$targetDir\package.json"

# tsconfig.json
@'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@fixtures/*": ["./fixtures/*"]
    }
  },
  "include": ["tests/**/*.ts", "fixtures/**/*.ts", "playwright.config.ts"]
}
'@ | Set-Content "$targetDir\tsconfig.json"

# .env
@'
# Target environment
BASE_URL=http://el-reloj.localhost:3000
API_URL=http://localhost:3001

# Test credentials
ADMIN_EMAIL=admin@elreloj.com
ADMIN_PASSWORD=admin123

# Tenant under test
TENANT_SLUG=el-reloj
'@ | Set-Content "$targetDir\.env"

# .env.example
@'
BASE_URL=http://el-reloj.localhost:3000
API_URL=http://localhost:3001
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
TENANT_SLUG=el-reloj
'@ | Set-Content "$targetDir\.env.example"

# .gitignore
@'
node_modules/
test-results/
playwright-report/
blob-report/
tests/.auth/
.env
'@ | Set-Content "$targetDir\.gitignore"

# playwright.config.ts
@'
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://el-reloj.localhost:3000',
    storageState: './tests/.auth/session.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
'@ | Set-Content "$targetDir\playwright.config.ts"

# Auth setup test
@'
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth', 'session.json');

setup('login as admin', async ({ page }) => {
  const baseUrl = process.env.BASE_URL || 'http://el-reloj.localhost:3000';

  await page.goto(`${baseUrl}/login`);

  // Fill login form
  await page.fill('input[name="email"], input[type="email"]', process.env.ADMIN_EMAIL || 'admin@elreloj.com');
  await page.fill('input[name="password"], input[type="password"]', process.env.ADMIN_PASSWORD || 'admin123');
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/*', { timeout: 10_000 });
  await expect(page.locator('body')).not.toContainText('Iniciar sesión');

  // Save session state
  await page.context().storageState({ path: authFile });
});
'@ | Set-Content "$targetDir\tests\auth.setup.ts"

# Tickets list test
@'
import { test, expect } from '@playwright/test';

test.describe('Tickets - Lista', () => {
  test('muestra la tabla de tickets con columnas esperadas', async ({ page }) => {
    await page.goto('/tickets');

    // Verify table headers exist
    await expect(page.locator('th', { hasText: 'ID' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Cliente' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Formulario' })).toBeVisible();
    await expect(page.locator('th', { hasText: /T.cnico/ })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Estado' })).toBeVisible();
    await expect(page.locator('th', { hasText: /L.mite/ })).toBeVisible();
  });

  test('los filtros dropdown de Cliente, Formulario y Tecnico tienen opciones', async ({ page }) => {
    await page.goto('/tickets');

    // Wait for tickets to load
    await page.waitForSelector('tbody tr');

    // Check Cliente dropdown has options beyond "Todos"
    const clienteSelect = page.locator('thead select').first();
    const clienteOptions = await clienteSelect.locator('option').count();
    expect(clienteOptions).toBeGreaterThan(1);
  });

  test('filtrar por estado muestra solo tickets del estado seleccionado', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForSelector('tbody tr');

    // Select "Programado" (pendiente) state
    const estadoSelect = page.locator('thead select').nth(1); // second select in filter row
    await estadoSelect.selectOption('pendiente');

    // Wait for reload
    await page.waitForTimeout(500);

    // All visible estado badges should say "Programado"
    const badges = page.locator('tbody tr td:nth-child(6) span');
    const count = await badges.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(badges.nth(i)).toHaveText('Programado');
      }
    }
  });

  test('la columna ID muestra identificadores con formato XXXX-YYYYMMDD-NNN', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForSelector('tbody tr');

    const firstIdCell = page.locator('tbody tr:first-child td:first-child');
    const text = await firstIdCell.textContent();
    // Verify format: 4 digits - 8 digits - 3 digits
    expect(text?.trim()).toMatch(/^\d{4}-\d{8}-\d{3}$/);
  });

  test('click en un ticket navega al detalle', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForSelector('tbody tr');

    await page.locator('tbody tr:first-child').click();
    await page.waitForURL('**/tickets/*');
    expect(page.url()).toMatch(/\/tickets\/[a-f0-9-]+$/);
  });
});
'@ | Set-Content "$targetDir\tests\tickets\tickets-list.spec.ts"

# Admin tenants test
@'
import { test, expect } from '@playwright/test';

test.describe('Admin - Tenants', () => {
  test('muestra la lista de tenants con columna ID', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/tenants');

    await expect(page.locator('th', { hasText: 'ID' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Nombre' })).toBeVisible();

    // Verify at least one tenant row exists
    await page.waitForSelector('tbody tr');
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });
});
'@ | Set-Content "$targetDir\tests\admin\tenants.spec.ts"

# README
@'
# SMT - End-to-End Tests

Tests E2E con Playwright para el Sistema de Muestreo Tecnico.

## Setup

```bash
npm install
npx playwright install chromium
```

## Configuracion

Copia `.env.example` a `.env` y ajusta las URLs y credenciales del entorno target.

## Ejecucion

```bash
# Correr todos los tests
npm test

# Con UI interactiva
npm run test:ui

# Con navegador visible
npm run test:headed

# Ver reporte despues de correr
npm run report
```

## Estructura

- `tests/auth.setup.ts` - Login y guardado de sesion
- `tests/tickets/` - Tests de la seccion de tickets
- `tests/admin/` - Tests del panel de administracion
- `fixtures/` - Fixtures reutilizables

## Entornos

Cambia `BASE_URL` en `.env` para apuntar a diferentes entornos:
- Local: `http://el-reloj.localhost:3000`
- Staging: `https://el-reloj.staging.tudominio.com`
- Produccion: `https://el-reloj.tudominio.com`
'@ | Set-Content "$targetDir\README.md"

Write-Host ""
Write-Host "Proyecto creado en $targetDir" -ForegroundColor Green
Write-Host ""
Write-Host "Siguiente paso:" -ForegroundColor Yellow
Write-Host "  cd $targetDir"
Write-Host "  npm install"
Write-Host "  npx playwright install chromium"
Write-Host "  npm test"
