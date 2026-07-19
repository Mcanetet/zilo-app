/**
 * Pruebas unitarias — lib/emailVerification.js
 * Framework: Jest
 *
 * Cubre generación/hash de códigos, verificación, cooldown de reenvío
 * y el envío de correo (con mailer mockeado).
 */

jest.mock('../lib/mailer', () => ({
  sendMail: jest.fn(),
  wrapHtmlDocument: jest.fn((body, { title } = {}) => `<html><title>${title || ''}</title>${body}</html>`)
}));

jest.mock('../lib/seo', () => ({
  getSiteUrl: jest.fn(() => 'https://www.fundez.cl')
}));

const mailer = require('../lib/mailer');
const {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  hashCode,
  generateCode,
  sendVerificationEmail,
  verifyCode,
  canResend,
  resendCooldownSeconds
} = require('../lib/emailVerification');

describe('lib/emailVerification', () => {
  const USER_ID = 'user-test-001';
  const VALID_CODE = '482913';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSION_SECRET = 'test-secret-fundez';
  });

  // ─────────────────────────────────────────────
  // generateCode
  // ─────────────────────────────────────────────
  describe('generateCode()', () => {
    it('happy path: retorna un string de exactamente 6 dígitos', () => {
      // Valida formato OTP esperado por verifyCode
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('edge: genera códigos en el rango 100000–999999', () => {
      // Evita códigos con menos de 6 dígitos (ej. 000042)
      for (let i = 0; i < 50; i += 1) {
        const n = Number(generateCode());
        expect(n).toBeGreaterThanOrEqual(100000);
        expect(n).toBeLessThanOrEqual(999999);
      }
    });
  });

  // ─────────────────────────────────────────────
  // hashCode
  // ─────────────────────────────────────────────
  describe('hashCode()', () => {
    it('happy path: produce un hash SHA-256 hex de 64 caracteres', () => {
      const hash = hashCode(USER_ID, VALID_CODE);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('happy path: es determinista para el mismo userId + code + secret', () => {
      expect(hashCode(USER_ID, VALID_CODE)).toBe(hashCode(USER_ID, VALID_CODE));
    });

    it('edge: cambia si cambia el código', () => {
      expect(hashCode(USER_ID, '111111')).not.toBe(hashCode(USER_ID, '222222'));
    });

    it('edge: cambia si cambia el userId', () => {
      expect(hashCode('a', VALID_CODE)).not.toBe(hashCode('b', VALID_CODE));
    });

    it('edge: valores vacíos / nulos siguen generando un hash (no lanzan)', () => {
      // No debe romper aunque lleguen datos raros del caller
      expect(hashCode('', '')).toMatch(/^[a-f0-9]{64}$/);
      expect(hashCode(null, null)).toMatch(/^[a-f0-9]{64}$/);
      expect(hashCode(undefined, undefined)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('edge: strings muy largos no lanzan excepción', () => {
      const longId = 'u'.repeat(5000);
      const longCode = '9'.repeat(5000);
      expect(() => hashCode(longId, longCode)).not.toThrow();
      expect(hashCode(longId, longCode)).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ─────────────────────────────────────────────
  // verifyCode
  // ─────────────────────────────────────────────
  describe('verifyCode()', () => {
    function userWithCode(code, { expiresInMs = 10 * 60 * 1000 } = {}) {
      return {
        id: USER_ID,
        emailVerificationCodeHash: hashCode(USER_ID, code),
        emailVerificationExpiresAt: new Date(Date.now() + expiresInMs).toISOString()
      };
    }

    it('happy path: acepta el código correcto de 6 dígitos', () => {
      const user = userWithCode(VALID_CODE);
      expect(verifyCode(user, VALID_CODE)).toEqual({ ok: true });
    });

    it('happy path: normaliza espacios alrededor y dentro del código', () => {
      // El usuario puede pegar "482 913" o " 482913 "
      const user = userWithCode(VALID_CODE);
      expect(verifyCode(user, `  ${VALID_CODE}  `)).toEqual({ ok: true });
      expect(verifyCode(user, '482 913')).toEqual({ ok: true });
    });

    it('error: usuario null / undefined', () => {
      expect(verifyCode(null, VALID_CODE).error).toMatch(/código activo/i);
      expect(verifyCode(undefined, VALID_CODE).error).toMatch(/código activo/i);
    });

    it('error: sin hash o sin fecha de expiración', () => {
      expect(verifyCode({ id: USER_ID }, VALID_CODE).error).toMatch(/código activo/i);
      expect(
        verifyCode({ id: USER_ID, emailVerificationCodeHash: 'abc' }, VALID_CODE).error
      ).toMatch(/código activo/i);
      expect(
        verifyCode(
          { id: USER_ID, emailVerificationExpiresAt: new Date().toISOString() },
          VALID_CODE
        ).error
      ).toMatch(/código activo/i);
    });

    it('error: código expirado', () => {
      const user = userWithCode(VALID_CODE, { expiresInMs: -1000 });
      expect(verifyCode(user, VALID_CODE).error).toMatch(/expiró/i);
    });

    it('error: código vacío, null o no numérico', () => {
      const user = userWithCode(VALID_CODE);
      expect(verifyCode(user, '').error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, null).error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, undefined).error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, 'abcdef').error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, '12').error).toMatch(/6 dígitos/i);
    });

    it('edge: códigos con longitud incorrecta (5, 7, negativo como string)', () => {
      const user = userWithCode(VALID_CODE);
      expect(verifyCode(user, '12345').error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, '1234567').error).toMatch(/6 dígitos/i);
      expect(verifyCode(user, '-12345').error).toMatch(/6 dígitos/i);
    });

    it('error: código de 6 dígitos pero incorrecto', () => {
      const user = userWithCode(VALID_CODE);
      expect(verifyCode(user, '000000').error).toMatch(/incorrecto/i);
    });

    it('edge: string muy largo no hace match ni crashea', () => {
      const user = userWithCode(VALID_CODE);
      const result = verifyCode(user, '1'.repeat(10000));
      expect(result.error).toMatch(/6 dígitos/i);
    });
  });

  // ─────────────────────────────────────────────
  // canResend / resendCooldownSeconds
  // ─────────────────────────────────────────────
  describe('canResend() y resendCooldownSeconds()', () => {
    it('happy path: permite reenviar si nunca se envió', () => {
      expect(canResend({})).toBe(true);
      expect(canResend(null)).toBe(true);
      expect(resendCooldownSeconds({})).toBe(0);
      expect(resendCooldownSeconds(null)).toBe(0);
    });

    it('happy path: permite reenviar tras el cooldown', () => {
      const user = {
        emailVerificationSentAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 500).toISOString()
      };
      expect(canResend(user)).toBe(true);
      expect(resendCooldownSeconds(user)).toBe(0);
    });

    it('edge: bloquea reenvío inmediato (cooldown activo)', () => {
      const user = {
        emailVerificationSentAt: new Date(Date.now() - 5_000).toISOString()
      };
      expect(canResend(user)).toBe(false);
      const seconds = resendCooldownSeconds(user);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(Math.ceil(RESEND_COOLDOWN_MS / 1000));
    });

    it('edge: sentAt en el futuro no produce cooldown negativo', () => {
      // Defensa ante reloj desfasado / datos corruptos
      const user = {
        emailVerificationSentAt: new Date(Date.now() + 60_000).toISOString()
      };
      expect(resendCooldownSeconds(user)).toBeGreaterThan(0);
      expect(canResend(user)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // sendVerificationEmail
  // ─────────────────────────────────────────────
  describe('sendVerificationEmail()', () => {
    const baseUser = {
      id: USER_ID,
      name: 'Miguel Cañete',
      email: 'miguel@gmail.com'
    };

    it('happy path: envía correo y retorna hash + fechas + mailResult', async () => {
      mailer.sendMail.mockResolvedValue({ messageId: '<abc@fundez.cl>', to: baseUser.email });

      const result = await sendVerificationEmail(baseUser, { locale: 'es' });

      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const payload = mailer.sendMail.mock.calls[0][0];
      expect(payload.to).toBe(baseUser.email);
      expect(payload.subject).toMatch(/verificación|Fundez/i);
      expect(payload.text).toContain(baseUser.name);
      expect(result.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + CODE_TTL_MS + 1000);
      expect(result.mailResult.messageId).toBe('<abc@fundez.cl>');
    });

    it('happy path: locale en genera asunto en inglés', async () => {
      mailer.sendMail.mockResolvedValue({ messageId: 'ok' });

      await sendVerificationEmail(baseUser, { locale: 'en' });

      expect(mailer.sendMail.mock.calls[0][0].subject).toMatch(/verification code/i);
    });

    it('happy path: modo demo no rompe y deja mailResult.demo', async () => {
      mailer.sendMail.mockResolvedValue({ demo: true, to: baseUser.email });
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendVerificationEmail(baseUser);
      expect(result.mailResult.demo).toBe(true);
      expect(result.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it('error esperado: si SMTP falla, igual persiste hash (caller puede reintentar)', async () => {
      // El módulo no lanza: reporta error en mailResult para que la UI muestre "reenviar"
      mailer.sendMail.mockResolvedValue({ error: 'Invalid login', to: baseUser.email });
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendVerificationEmail(baseUser);
      expect(result.mailResult.error).toBe('Invalid login');
      expect(result.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it('edge: nombre vacío / email vacío no lanzan (mailer decide el destino)', async () => {
      mailer.sendMail.mockResolvedValue({ demo: true });
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(
        sendVerificationEmail({ id: USER_ID, name: '', email: '' })
      ).resolves.toMatchObject({ codeHash: expect.any(String) });
      spy.mockRestore();
    });

    it('edge: nombre muy largo se incluye sin romper el envío', async () => {
      mailer.sendMail.mockResolvedValue({ messageId: 'ok' });
      const longName = 'A'.repeat(2000);

      const result = await sendVerificationEmail({
        id: USER_ID,
        name: longName,
        email: 'largo@gmail.com'
      });

      expect(result.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mailer.sendMail.mock.calls[0][0].text).toContain(longName);
    });

    it('error: si sendMail rechaza la promesa, la excepción sube al caller', async () => {
      mailer.sendMail.mockRejectedValue(new Error('SMTP timeout'));
      await expect(sendVerificationEmail(baseUser)).rejects.toThrow(/SMTP timeout/);
    });
  });

  // ─────────────────────────────────────────────
  // Integración ligera: send → verify
  // ─────────────────────────────────────────────
  describe('flujo send → verify', () => {
    it('happy path: el hash generado permite verificar el código enviado', async () => {
      // Captura el código desde el cuerpo del mail mockeado
      let capturedCode = null;
      mailer.sendMail.mockImplementation(async ({ text }) => {
        const match = String(text).match(/\b(\d{6})\b/);
        capturedCode = match ? match[1] : null;
        return { messageId: 'ok' };
      });

      const sent = await sendVerificationEmail({
        id: USER_ID,
        name: 'Ana',
        email: 'ana@gmail.com'
      });

      expect(capturedCode).toMatch(/^\d{6}$/);

      const user = {
        id: USER_ID,
        emailVerificationCodeHash: sent.codeHash,
        emailVerificationExpiresAt: sent.expiresAt
      };

      expect(verifyCode(user, capturedCode)).toEqual({ ok: true });
      expect(verifyCode(user, '999999').error).toMatch(/incorrecto/i);
    });
  });
});
