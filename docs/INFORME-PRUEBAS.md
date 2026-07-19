# Informe de pruebas — Fundez

| Campo | Valor |
|--------|--------|
| **Fecha** | 19 de julio de 2026 |
| **Versión app** | 1.3.3 |
| **Commit en producción** | `400c43c` (al momento del informe) |
| **Resultado global** | **PASS — 46 / 46** |
| **Entorno E2E** | `https://www.fundez.cl` |

---

## 1. Resumen ejecutivo

Se ejecutó la suite completa de pruebas automatizadas de Fundez:

- **Unitarias** (Jest) sobre verificación de correo  
- **Integración** (Jest + Supertest) sobre endpoints `/verificar-email`  
- **End-to-End** (Playwright) sobre login cliente y socio  

**Todas las pruebas pasaron.** No se detectaron fallos bloqueantes en la suite automatizada.

> **Nota de despliegue:** la producción aún corre el commit `400c43c`. Hay cambios locales (muro con preview, canalización admin, mejoras SMTP/admin verificación, y esta suite de tests) que **no están desplegados** hasta hacer commit, push y Redeploy en Hostinger.

---

## 2. Resultados por capa

| Capa | Framework | Archivos | Pasaron | Fallaron | Tiempo aprox. |
|------|-----------|----------|---------|----------|---------------|
| Unitarias | Jest | `tests/emailVerification.test.js` | 29 | 0 | ~2 s |
| Integración | Jest + Supertest | `tests/integration/verificar-email.integration.test.js` | 13 | 0 | incluido |
| E2E | Playwright | `e2e/login-cliente.spec.js`, `e2e/login-socio.spec.js` | 4 | 0 | ~14 s |
| **Total** | | | **46** | **0** | |

---

## 3. Pruebas unitarias — verificación de correo

**Módulo bajo prueba:** `lib/emailVerification.js`  
**Comando:** `npm run test:unit` o `npm test`

### Cobertura

| Área | Qué valida |
|------|------------|
| `generateCode()` | Código de 6 dígitos en rango 100000–999999 |
| `hashCode()` | Hash SHA-256 determinista; edge: vacíos, nulos, strings largos |
| `verifyCode()` | Código correcto; espacios; expirado; incorrecto; formato inválido |
| `canResend()` / cooldown | Permite reenvío tras 60 s; bloquea si es inmediato |
| `sendVerificationEmail()` | Envío OK (ES/EN); modo demo; error SMTP; rechazo de promesa |
| Flujo send → verify | El código enviado en el mail mockeado verifica el hash |

**Resultado:** 29/29 PASS

---

## 4. Pruebas de integración — endpoints de verificación

**Stack:** Supertest + app Express mínima (`tests/helpers/createAuthTestApp.js`)  
**Mocks:** MySQL (`repository`), SMTP (`mailer`)  
**Comando:** `npm run test:integration`

### Endpoints

| Método | Ruta | Casos | Resultado |
|--------|------|-------|-----------|
| GET | `/verificar-email` | Sin sesión → 302 `/login`; con sesión → 200 HTML; ya verificado → `/cliente` | PASS |
| POST | `/verificar-email` | Código válido → 302 dashboard; incorrecto/vacío/expirado → HTML con error | PASS |
| POST | `/verificar-email/reenviar` | 401 sin sesión; 200 OK; 429 cooldown; 502 SMTP; ya verificado | PASS |

**Resultado:** 13/13 PASS

---

## 5. Pruebas E2E — Playwright

**Config:** `playwright.config.js`  
**Comando (producción):**

```bash
BASE_URL=https://www.fundez.cl npm run test:e2e
```

**Comando (local, app + MySQL levantados):**

```bash
npm start          # terminal 1
npm run test:e2e   # terminal 2
```

### Flujos

| Spec | Flujo | Resultado |
|------|-------|-----------|
| `login-cliente.spec.js` | Login `cliente@fundez.cl` / `cliente123` → `/cliente` o `/verificar-email` | PASS |
| `login-cliente.spec.js` | Credenciales inválidas → permanece en `/login` con error | PASS |
| `login-cliente.spec.js` | Campos vacíos → validación HTML `required` | PASS |
| `login-socio.spec.js` | Login `pedro@fundez.cl` / `proveedor123` → `/proveedor` o verificación | PASS |

**Observación E2E:** en producción, la cuenta demo cliente puede redirigir a `/verificar-email` si el correo no está marcado como verificado. La prueba acepta ambos destinos válidos post-login.

**Resultado:** 4/4 PASS

---

## 6. Salud del entorno de producción

Consulta: `GET https://fundez.cl/health?smtp=1`

| Check | Estado |
|-------|--------|
| App | OK · versión 1.3.3 |
| Base de datos | `connected` |
| SMTP | `configured: true`, `verified: true` (`smtp.hostinger.com`) |
| Remitente | `soporte@fundez.cl` |

---

## 7. Cómo volver a ejecutar la suite

```bash
# Todo Jest (unitarias + integración)
npm test

# Solo unitarias
npm run test:unit

# Solo integración
npm run test:integration

# E2E contra producción
BASE_URL=https://www.fundez.cl npm run test:e2e

# E2E con UI de Playwright
BASE_URL=https://www.fundez.cl npm run test:e2e:ui
```

### Dependencias de test (dev)

- `jest`
- `supertest`
- `@playwright/test` (+ Chromium instalado con `npx playwright install chromium`)

---

## 8. Estructura de archivos de pruebas

```
tests/
  emailVerification.test.js          # Unitarias
  helpers/
    createAuthTestApp.js             # App mínima para integración
  integration/
    verificar-email.integration.test.js

e2e/
  login-cliente.spec.js              # E2E Playwright
  login-socio.spec.js

jest.config.js
playwright.config.js
```

---

## 9. Hallazgos y recomendaciones

1. **Suite verde:** la automatización de verificación de correo y login es estable.  
2. **Desplegar cambios pendientes** para que producción incluya muro con preview, panel Solicitudes (canalización admin) y herramientas de forzar/reenviar verificación.  
3. **Cuentas demo en producción:** conviene dejar `email_verified_at` seteado en demos para que E2E y demos comerciales entren directo al panel.  
4. **Jest `forceExit`:** hay handles asíncronos leves (sesión) al cerrar integración; no afecta el veredicto.  
5. **E2E local:** requiere MySQL; si no hay DB local, usar `BASE_URL` remoto.

---

## 10. Veredicto QA

| Criterio | Evaluación |
|----------|------------|
| Unitarias verificación | Aprobado |
| Integración API verificación | Aprobado |
| E2E login cliente/socio | Aprobado |
| SMTP producción | Operativo |
| **Conclusión** | **Apto — suite 46/46 PASS** |

---

*Documento generado automáticamente a partir de la ejecución de pruebas del 19/07/2026.*  
*Proyecto: Fundez App · Frameworks: Jest, Supertest, Playwright*
