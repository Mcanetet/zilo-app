/**
 * E2E — Login cliente demo
 *
 * Flujo:
 * 1. Entrar a /login
 * 2. Escribir correo 'cliente@fundez.cl' y contraseña 'cliente123'
 * 3. Clic en "Ingresar"
 * 4. Según estado de verificación:
 *    - verificado → /cliente con saludo "Bienvenida" + nombre
 *    - sin verificar → /verificar-email mostrando el correo
 *
 * Ejecutar:
 *   BASE_URL=https://www.fundez.cl npm run test:e2e -- e2e/login-cliente.spec.js
 *   # o con app local + MySQL:
 *   E2E_START_SERVER=1 npm run test:e2e -- e2e/login-cliente.spec.js
 */
const { test, expect } = require('@playwright/test');

const DEMO_CLIENT = {
  email: 'cliente@fundez.cl',
  password: 'cliente123',
  firstName: 'María'
};

test.describe('Login cliente (demo)', () => {
  test('happy path: login exitoso redirige al panel o a verificación de correo', async ({ page }) => {
    // 1) Abrir login
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /bienvenido/i })).toBeVisible();

    // 2) Credenciales — localizadores estables por id
    await page.locator('#email').fill(DEMO_CLIENT.email);
    await page.locator('#password').fill(DEMO_CLIENT.password);

    // 3) Ingresar
    await page.locator('form[action="/login"] button[type="submit"]').click();

    // 4) Destino post-login (cuenta verificada o pendiente de OTP)
    await page.waitForURL(/\/(cliente|verificar-email)(\/|$|\?)/);

    if (page.url().includes('/verificar-email')) {
      // Cuenta aún no verificada: debe verse el correo y el formulario OTP
      await expect(page.getByRole('heading', { name: /verifica tu correo/i })).toBeVisible();
      await expect(page.locator('strong.text-zilo-text, strong').filter({ hasText: DEMO_CLIENT.email })).toBeVisible();
      await expect(page.locator('#code')).toBeVisible();
      await expect(page.locator('form[action="/verificar-email"] button[type="submit"]')).toBeVisible();
      return;
    }

    // Cuenta verificada: panel cliente
    await expect(page).toHaveURL(/\/cliente\/?$/);
    const dashboard = page.locator('#clientDashboard');
    await expect(dashboard).toBeVisible();

    const welcome = page.locator('[data-tour="welcome"]');
    await expect(welcome).toBeVisible();
    await expect(welcome.getByText(/bienvenida/i)).toBeVisible();
    await expect(welcome.getByRole('heading', { name: DEMO_CLIENT.firstName })).toBeVisible();
  });

  test('error: credenciales inválidas permanecen en login con mensaje', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(DEMO_CLIENT.email);
    await page.locator('#password').fill('clave-incorrecta-999');
    await page.locator('form[action="/login"] button[type="submit"]').click();

    await expect(page).toHaveURL(/\/login/);
    // Caja de error del template login.ejs
    await expect(page.locator('form[action="/login"]').locator('..').locator('.text-zilo-danger, [class*="danger"]').first()).toBeVisible();
  });

  test('edge: campos vacíos no navegan (validación HTML required)', async ({ page }) => {
    await page.goto('/login');

    await page.locator('form[action="/login"] button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);

    const emailValid = await page.locator('#email').evaluate((el) => /** @type {HTMLInputElement} */ (el).checkValidity());
    expect(emailValid).toBe(false);
  });
});
