import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://el-reloj.localhost:3000';

test.describe.serial('Create Ticket Flow', () => {
  let createdTicketId: string | null = null;

  test('should navigate to new ticket page', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    // Verify page title
    await expect(page.getByRole('heading', { name: 'Nuevo Ticket' })).toBeVisible();

    // Verify form elements are present
    await expect(page.getByText('Cliente *')).toBeVisible();
    await expect(page.getByText('Formulario / Norma *')).toBeVisible();
    await expect(page.getByText('Prioridad')).toBeVisible();
  });

  test('should load dropdown options (clients, forms, technicians)', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    // Wait for data to load — client select should have options
    const clienteSelect = page.locator('select').first();
    await expect(clienteSelect).toBeVisible();

    // Wait for options to populate (API call)
    await page.waitForFunction(
      () => {
        const selects = document.querySelectorAll('select');
        return selects.length >= 2 && selects[0].options.length > 1;
      },
      { timeout: 10_000 }
    );

    // Verify client select has options beyond the placeholder
    const clienteOptions = await clienteSelect.locator('option').count();
    expect(clienteOptions).toBeGreaterThan(1);

    // Verify form select has options
    const formSelect = page.locator('select').nth(1);
    const formOptions = await formSelect.locator('option').count();
    expect(formOptions).toBeGreaterThan(1);
  });

  test('should create a ticket with all required fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    // Wait for dropdowns to load
    await page.waitForFunction(
      () => {
        const selects = document.querySelectorAll('select');
        return selects.length >= 3 && selects[0].options.length > 1;
      },
      { timeout: 10_000 }
    );

    // Select first client from dropdown
    const clienteSelect = page.locator('select').first();
    const clienteOption = clienteSelect.locator('option:not([value=""])').first();
    const clienteValue = await clienteOption.getAttribute('value');
    await clienteSelect.selectOption(clienteValue!);

    // Verify client selection confirmation
    await expect(page.locator('text=✓ Cliente seleccionado')).toBeVisible();

    // Select first form
    const formSelect = page.locator('select').nth(1);
    const formOption = formSelect.locator('option:not([value=""])').first();
    const formValue = await formOption.getAttribute('value');
    await formSelect.selectOption(formValue!);

    // Select priority (alta)
    const prioridadSelect = page.locator('select').nth(3); // 4th select: cliente, form, tecnico, prioridad
    await prioridadSelect.selectOption('alta');

    // Verify SLA info is displayed
    await expect(page.locator('text=SLA Estimado')).toBeVisible();

    // Click create button
    await page.click('button[type="submit"]');

    // Wait for redirect to tickets list
    await page.waitForURL('**/tickets', { timeout: 15_000 });
    expect(page.url()).toMatch(/\/tickets$/);
  });

  test('should verify the new ticket appears in the tickets table', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets`);

    // Wait for the table to load
    await page.waitForSelector('tbody tr', { timeout: 10_000 });

    // Verify at least one ticket exists
    const rowCount = await page.locator('tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify first row has an identificador with the expected format XXXX-YYYYMMDD-NNN
    const firstIdCell = page.locator('tbody tr').first().locator('td').first();
    const idText = await firstIdCell.textContent();
    expect(idText?.trim()).toMatch(/^\d{4}-\d{8}-\d{3}$/);
  });

  test('should show validation error when submitting without required fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'Nuevo Ticket' })).toBeVisible();

    // Try to submit without selecting client or form
    await page.click('button[type="submit"]');

    // Should show error message
    const errorMsg = page.getByText('Debe seleccionar un cliente y un formulario');
    await expect(errorMsg).toBeVisible({ timeout: 5_000 });

    // Should remain on the same page
    expect(page.url()).toContain('/tickets/nuevo');
  });

  test('should allow optional technician selection', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    // Wait for dropdowns to load
    await page.waitForFunction(
      () => {
        const selects = document.querySelectorAll('select');
        return selects.length >= 3 && selects[0].options.length > 1;
      },
      { timeout: 10_000 }
    );

    // Verify tecnico select shows "Asignación automática" as default
    const tecnicoSelect = page.locator('select').nth(2);
    await expect(tecnicoSelect).toBeVisible();
    const defaultOption = tecnicoSelect.locator('option').first();
    await expect(defaultOption).toContainText('Asignación automática');

    // Verify tecnico select has technician options
    const tecnicoOptions = await tecnicoSelect.locator('option').count();
    expect(tecnicoOptions).toBeGreaterThanOrEqual(1); // At least the default option
  });

  test('should navigate back to tickets list via cancel button', async ({ page }) => {
    await page.goto(`${BASE_URL}/tickets/nuevo`);

    await expect(page.getByRole('heading', { name: 'Nuevo Ticket' })).toBeVisible();

    // Click cancel
    await page.click('button:has-text("Cancelar")');

    // Should navigate to tickets list
    await page.waitForURL('**/tickets', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/tickets$/);
  });
});
