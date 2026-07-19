/**
 * Pruebas de integración — endpoints de verificación de correo
 * Stack: Jest + Supertest
 *
 * Endpoints:
 *   GET  /verificar-email
 *   POST /verificar-email
 *   POST /verificar-email/reenviar
 *
 * Mockea: repositorio MySQL (saveUser) y mailer SMTP.
 * Usa store en memoria (USERS) sin init()/DB real.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'fundez-test-secret';

jest.mock('../../models/repository', () => ({
  saveUser: jest.fn(async (user) => user),
  saveSecurityLog: jest.fn(async (log) => log),
  persist: jest.fn((fn) => {
    if (typeof fn === 'function') return fn();
    return undefined;
  }),
  saveRequest: jest.fn(),
  migrate: jest.fn(),
  ensureDemoData: jest.fn(),
  loadAll: jest.fn(),
  hydrateFromDatabase: jest.fn()
}));

jest.mock('../../lib/mailer', () => ({
  sendMail: jest.fn(async ({ to, subject }) => ({
    messageId: `<test-${Date.now()}@fundez.cl>`,
    to,
    subject,
    accepted: [to],
    rejected: []
  })),
  wrapHtmlDocument: jest.fn((body, { title } = {}) => `<html><title>${title || ''}</title>${body}</html>`),
  isConfigured: jest.fn(() => true),
  smtpStatus: jest.fn(() => ({
    configured: true,
    host: 'smtp.test',
    port: 587,
    user: 'sop***@fundez.cl',
    from: 'soporte@fundez.cl'
  })),
  verifySmtp: jest.fn(async () => ({ ok: true })),
  resetTransporter: jest.fn(),
  formatFromAddress: jest.fn(() => '"Fundez" <soporte@fundez.cl>'),
  stripHtml: jest.fn((html) => String(html || '').replace(/<[^>]+>/g, ' '))
}));

jest.mock('../../lib/seo', () => ({
  getSiteUrl: jest.fn(() => 'https://www.fundez.cl'),
  buildPageMeta: jest.fn(() => ({ title: 'Test', description: '' })),
  absoluteUrl: jest.fn((p) => `https://www.fundez.cl${p || '/'}`)
}));

const request = require('supertest');
const mailer = require('../../lib/mailer');
const repository = require('../../models/repository');
const store = require('../../models/store');
const { hashCode } = require('../../lib/emailVerification');
const { createAuthTestApp } = require('../helpers/createAuthTestApp');

const CODE = '482913';
const USER_ID = 'client-int-verify-1';

function clearUsers() {
  const users = store.USERS;
  users.splice(0, users.length);
}

function seedUnverifiedUser(overrides = {}) {
  const user = {
    id: USER_ID,
    email: 'integracion@gmail.com',
    name: 'Usuario Integración',
    role: 'client',
    password: 'hashed',
    emailVerifiedAt: null,
    emailVerificationCodeHash: hashCode(USER_ID, CODE),
    emailVerificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    emailVerificationSentAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    active: true,
    ...overrides
  };
  clearUsers();
  store.USERS.push(user);
  return user;
}

async function loginAgent(app, user) {
  const agent = request.agent(app);
  const res = await agent
    .post('/__test__/session')
    .send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    })
    .expect(200);
  expect(res.body.success).toBe(true);
  return agent;
}

describe('Integración — /verificar-email', () => {
  let app;

  beforeAll(() => {
    app = createAuthTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mailer.sendMail.mockResolvedValue({
      messageId: '<ok@fundez.cl>',
      accepted: ['integracion@gmail.com'],
      rejected: []
    });
    repository.saveUser.mockResolvedValue(true);
    clearUsers();
  });

  // ─────────────────────────────────────────────
  // GET /verificar-email
  // ─────────────────────────────────────────────
  describe('GET /verificar-email', () => {
    it('401/redirect: sin sesión redirige a login (302)', async () => {
      // Usuario anónimo no puede ver la pantalla de verificación
      const res = await request(app).get('/verificar-email');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('happy path: con sesión no verificada responde 200 y HTML con el correo', async () => {
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);

      const res = await agent.get('/verificar-email');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain(user.email);
      expect(res.text).toMatch(/verifica|código|codigo/i);
    });

    it('redirect: si el correo ya está verificado va al dashboard del cliente', async () => {
      const user = seedUnverifiedUser({
        emailVerifiedAt: new Date().toISOString(),
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null
      });
      const agent = await loginAgent(app, user);

      const res = await agent.get('/verificar-email');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/cliente');
    });
  });

  // ─────────────────────────────────────────────
  // POST /verificar-email  (confirmar código)
  // ─────────────────────────────────────────────
  describe('POST /verificar-email', () => {
    it('redirect: sin sesión → /login', async () => {
      const res = await request(app)
        .post('/verificar-email')
        .type('form')
        .send({ code: CODE });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    it('happy path: código válido → 302 al dashboard y marca emailVerifiedAt', async () => {
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email')
        .type('form')
        .send({ code: CODE });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/cliente');
      expect(store.getUserById(USER_ID).emailVerifiedAt).toBeTruthy();
      expect(repository.saveUser).toHaveBeenCalled();
    });

    it('error 200 HTML: código incorrecto muestra mensaje y no verifica', async () => {
      // La ruta renderiza de nuevo la vista (200) con error — no es JSON 400
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email')
        .type('form')
        .send({ code: '000000' });

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/incorrecto|código|codigo/i);
      expect(store.getUserById(USER_ID).emailVerifiedAt).toBeFalsy();
    });

    it('error 200 HTML: código vacío / faltante', async () => {
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email')
        .type('form')
        .send({ code: '' });

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/6 dígitos|código|codigo/i);
      expect(store.getUserById(USER_ID).emailVerifiedAt).toBeFalsy();
    });

    it('error 200 HTML: código expirado', async () => {
      const user = seedUnverifiedUser({
        emailVerificationExpiresAt: new Date(Date.now() - 60_000).toISOString()
      });
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email')
        .type('form')
        .send({ code: CODE });

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/expiró|expiro/i);
    });
  });

  // ─────────────────────────────────────────────
  // POST /verificar-email/reenviar  (JSON API)
  // ─────────────────────────────────────────────
  describe('POST /verificar-email/reenviar', () => {
    it('401: sin sesión', async () => {
      const res = await request(app)
        .post('/verificar-email/reenviar')
        .set('Accept', 'application/json');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: expect.any(String) });
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('happy path 200: reenvía código y estructura { success, demo }', async () => {
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email/reenviar')
        .set('Accept', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          success: true,
          demo: false
        })
      );
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      expect(mailer.sendMail.mock.calls[0][0].to).toBe(user.email);
      expect(repository.saveUser).toHaveBeenCalled();
    });

    it('429: cooldown activo (reenvío demasiado pronto)', async () => {
      const user = seedUnverifiedUser({
        emailVerificationSentAt: new Date().toISOString() // acaba de enviarse
      });
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email/reenviar')
        .set('Accept', 'application/json');

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({
        success: false,
        error: expect.any(String),
        cooldown: expect.any(Number)
      });
      expect(res.body.cooldown).toBeGreaterThan(0);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('502: fallo SMTP reportado por mailer', async () => {
      mailer.sendMail.mockResolvedValue({ error: 'Invalid login', to: 'integracion@gmail.com' });
      const user = seedUnverifiedUser();
      const agent = await loginAgent(app, user);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await agent
        .post('/verificar-email/reenviar')
        .set('Accept', 'application/json');

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/correo|SMTP|enviar/i);

      spy.mockRestore();
    });

    it('error: usuario ya verificado no debe reenviar', async () => {
      const user = seedUnverifiedUser({
        emailVerifiedAt: new Date().toISOString(),
        emailVerificationCodeHash: null
      });
      const agent = await loginAgent(app, user);

      const res = await agent
        .post('/verificar-email/reenviar')
        .set('Accept', 'application/json');

      // store.resendEmailVerification → error; status 502 (sin cooldown)
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/ya está verificado|verificado/i);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });
});
