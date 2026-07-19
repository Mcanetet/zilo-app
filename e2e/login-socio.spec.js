/**
 * E2E — Login socio demo → /proveedor (o verificación si aplica)
 */
const { test, expect } = require('@playwright/test');

const DEMO_PROVIDER = {
  email: 'pedro@fundez.cl',
  password: 'proveedor123'
};

test.describe('Login socio (demo)', () => {
  test('happy path: login socio llega al panel o a verificación', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(DEMO_PROVIDER.email);
    await page.locator('#password').fill(DEMO_PROVIDER.password);
    await page.locator('form[action="/login"] button[type="submit"]').click();

    await page.waitForURL(/\/(proveedor|verificar-email)(\/|$|\?)/);

    if (page.url().includes('/verificar-email')) {
      await expect(page.getByRole('heading', { name: /verifica tu correo/i })).toBeVisible();
      await expect(page.getByText(DEMO_PROVIDER.email)).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/proveedor\/?$/);
    const wall = page.locator('#workWall');
    await expect(wall).toBeVisible();
    await expect(wall.getByText(/muro de trabajos/i)).toBeVisible();
  });
});
