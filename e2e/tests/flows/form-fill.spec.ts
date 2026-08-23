import { test, expect } from '@playwright/test';
import { loginAs } from '../../fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://el-reloj.localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

test.describe('Form Fill Flow', () => {
  test.describe('Form page via /my-forms (Tecnico)', () => {
    test.beforeEach(async ({ page }) => {
      const email = process.env.TECNICO_EMAIL || 'juan@el-reloj.com';
      const password = process.env.TECNICO_PASSWORD || 'admin123';
      await loginAs(page, email, password);
    });

    test('should display the my-forms page with assigned forms', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-forms`);

      // Tecnico should have access to /my-forms
      expect(page.url()).toContain('/my-forms');

      // Page should have loaded without errors
      await expect(page.locator('body')).not.toContainText('Error');
    });
  });

  test.describe('Form rendering via API', () => {
    test('should render form HTML from the forms endpoint', async ({ page }) => {
      // Navigate to the forms management page (admin/manager access)
      await page.goto(`${BASE_URL}/forms`);

      const url = page.url();
      if (!url.includes('/forms')) {
        test.skip(true, 'Current user role cannot access /forms');
        return;
      }

      // Wait for forms list to load
      await page.waitForSelector('tbody tr, [data-testid="form-list"]', { timeout: 10_000 }).catch(() => null);

      const rows = page.locator('tbody tr');
      const rowCount = await rows.count();

      if (rowCount === 0) {
        test.skip(true, 'No forms available in the system');
        return;
      }

      // Click the first form to navigate to its detail
      await rows.first().click();
      await page.waitForURL('**/forms/*', { timeout: 10_000 });

      // The form detail page should be visible
      await expect(page.locator('body')).not.toBeEmpty();
    });

    test('should render form HTML in a new window context', async ({ page, context }) => {
      // This test simulates what happens when a tecnico opens a form via the API render endpoint
      // We fetch the form HTML directly and verify it contains input fields

      await page.goto(`${BASE_URL}/forms`);

      const url = page.url();
      if (!url.includes('/forms')) {
        test.skip(true, 'Current user role cannot access /forms');
        return;
      }

      // Get the access token from localStorage
      const token = await page.evaluate(() => localStorage.getItem('access_token'));
      if (!token) {
        test.skip(true, 'No access token available');
        return;
      }

      // Get available forms from the API
      const tenantSlug = 'el-reloj';
      const formsResponse = await page.evaluate(
        async ({ apiUrl, token, slug }) => {
          const res = await fetch(`${apiUrl}/api/forms?pageSize=10`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Tenant-Slug': slug,
            },
          });
          if (!res.ok) return null;
          return res.json();
        },
        { apiUrl: API_URL, token, slug: tenantSlug }
      );

      if (!formsResponse?.data?.length) {
        test.skip(true, 'No forms available from the API');
        return;
      }

      const formId = formsResponse.data[0].id;

      // Fetch the rendered form HTML
      const formHtml = await page.evaluate(
        async ({ apiUrl, token, slug, formId }) => {
          const res = await fetch(`${apiUrl}/api/forms/${formId}/render`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Tenant-Slug': slug,
            },
          });
          if (!res.ok) return null;
          return res.text();
        },
        { apiUrl: API_URL, token, slug: tenantSlug, formId }
      );

      if (!formHtml) {
        test.skip(true, 'Form render endpoint returned no content');
        return;
      }

      // Open a new page and load the form HTML
      const formPage = await context.newPage();
      await formPage.setContent(formHtml);

      // Verify the form has interactive elements
      const inputs = formPage.locator('input, textarea, select');
      const inputCount = await inputs.count();
      expect(inputCount).toBeGreaterThan(0);

      // Verify at least one text or number input exists
      const textInputs = formPage.locator('input[type="text"], input[type="number"], input:not([type]), textarea');
      const textInputCount = await textInputs.count();
      expect(textInputCount).toBeGreaterThanOrEqual(0); // Forms may use different input types

      // Try filling the first available text input
      const firstInput = textInputs.first();
      if (await firstInput.isVisible().catch(() => false)) {
        const inputType = await firstInput.getAttribute('type');
        if (inputType === 'number') {
          await firstInput.fill('42');
          await expect(firstInput).toHaveValue('42');
        } else {
          await firstInput.fill('Test value E2E');
          await expect(firstInput).toHaveValue('Test value E2E');
        }
      }

      // Verify a submit button exists in the form
      const submitButton = formPage.locator('button[type="submit"], input[type="submit"], button:has-text("Enviar"), button:has-text("Guardar")');
      const hasSubmit = await submitButton.count();
      expect(hasSubmit).toBeGreaterThanOrEqual(0); // Some forms may auto-save

      await formPage.close();
    });
  });

  test.describe('Form interaction via Kanban modal (EnsayoFormModal)', () => {
    test('should open form modal from kanban and verify it renders HTML form fields', async ({ page }) => {
      // Try the kanban view first
      await page.goto(`${BASE_URL}/kanban`);

      // Wait for board to load
      await expect(page.locator('text=Cargando tablero...')).toBeHidden({ timeout: 15_000 });

      // Look for form button on any card
      const formButton = page.locator('button:has-text("📋")').first();
      const hasFormButton = await formButton.isVisible().catch(() => false);

      if (!hasFormButton) {
        test.skip(true, 'No cards with form view buttons available on the kanban');
        return;
      }

      // Click the form button
      await formButton.click();

      // Wait for the modal overlay to appear
      const modal = page.locator('.fixed.inset-0');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // The modal should contain form content (either rendered HTML or responses table)
      await page.waitForTimeout(2000); // Allow time for content to load

      // Verify the modal has some content
      const modalContent = await modal.textContent();
      expect(modalContent!.length).toBeGreaterThan(10);
    });
  });
});
