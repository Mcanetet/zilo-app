# Zilo — Plataforma on-demand de servicios del hogar

Plataforma premium para Santiago, Chile. Node.js + Express + Socket.io + Mercado Pago + Leaflet.

## Requisitos

- Node.js 18+
- Cuenta Mercado Pago (Chile) para pagos reales
- Hosting Node.js (Hostinger VPS o sección Node.js)

## Instalación local

```bash
npm install
cp .env.example .env
npm start
```

Abre http://localhost:3000

## Cuentas demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | cliente@zilo.cl | cliente123 |
| Proveedor | marta@zilo.cl | proveedor123 |
| Admin | admin@zilo.cl | admin123 |

## Despliegue en Hostinger

1. Sube el proyecto a GitHub y clónalo en Hostinger, o sube por FTP.
2. En el panel Node.js de Hostinger:
   - **Entry file:** `app.js`
   - **Start command:** `npm start`
3. Crea `.env` en el servidor con:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (clave larga aleatoria)
   - `APP_URL=https://tudominio.cl`
   - `MP_ACCESS_TOKEN` (producción o sandbox)
   - `WHATSAPP_NUMBER`
4. Ejecuta `npm install` en el terminal de Hostinger.
5. Activa SSL/HTTPS (obligatorio para cookies seguras y HSTS).

## Estructura

```
app.js              → Entrada (PORT dinámico)
models/store.js     → Datos in-memory
routes/             → auth, cliente, proveedor, admin, pagos, legal
config/company.js   → WhatsApp, comisiones, DPO
middleware/security.js → Headers HTTP, rate limiting
views/legal/        → Privacidad, términos, cookies
public/             → CSS, JS, iconos SVG
```

## Panel Admin

- Servicios ON/OFF en tiempo real
- Pagos Mercado Pago y comisiones
- Liquidación a proveedores (15% plataforma)
- Reclamos y disputas
- Chat soporte vía WhatsApp
- Consentimiento de datos (Ley 19.628)
- Auditoría de ciberseguridad

## Legal

- `/legal/privacidad` — Política de privacidad
- `/legal/terminos` — Términos y condiciones
- `/legal/cookies` — Política de cookies
- Banner de consentimiento en todas las páginas

## Seguridad

- Headers: X-Frame-Options, CSP básico, HSTS en producción
- Cookies HttpOnly + SameSite
- Rate limiting por IP
- Logs de auditoría (login, pagos, cambios admin)
- Sin almacenamiento de datos de tarjeta (Mercado Pago)

## GitHub

```bash
git init
git add .
git commit -m "Zilo v1.0"
gh auth login
gh repo create zilo --public --source=. --push
```

## Licencia

Propietario — Zilo SpA
