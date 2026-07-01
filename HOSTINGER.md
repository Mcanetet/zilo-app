# Desplegar Zilo en Hostinger

## Si sale "Unsupported framework or invalid project structure"

Ese error aparece en el asistente **quick-install-node-addon** (Codex). Zilo es **Express.js**, no una app React/Next. Usa uno de estos métodos:

---

## Método 1 — Subir ZIP (más fiable)

1. En tu Mac, en la carpeta del proyecto:
   ```bash
   node scripts/create-deploy-zip.js
   ```
2. Se crea **`zilo-hostinger.zip`** en la raíz del proyecto.
3. En hPanel → **Websites** → **Add Website** → **Node.js Web Apps**
4. Elige **Upload your website files** (subir archivos, NO GitHub)
5. Sube `zilo-hostinger.zip`
6. Configuración manual:
   - **Framework:** Express.js (o **Other**)
   - **Entry file:** `app.js`
   - **Build command:** `npm run build`
   - **Start command:** `npm start`
   - **Node.js:** 20.x
7. Añade variables de entorno (copia de `.env.example`)
8. **Deploy**

---

## Método 2 — GitHub (flujo correcto)

**No uses** el addon "quick-install-node-addon".

1. hPanel → **Websites** → **Add Website**
2. **Node.js Web Apps** (aplicación web Node.js)
3. **Import Git Repository**
4. Repo: `https://github.com/Mcanetet/zilo-app`
5. Rama: `main`
6. Si no detecta Express, pon manualmente:
   - Entry: `index.js`
   - Build: `npm run build`
   - Start: `npm start`

---

## Variables de entorno obligatorias

```
NODE_ENV=production
PORT=3000
SESSION_SECRET=clave-larga-aleatoria-min-32-chars
APP_URL=https://tudominio.cl
```

---

## Comprobar que funciona

Abre: `https://tudominio.cl/health`  
Debe responder: `{"ok":true,"app":"zilo",...}`

---

## Requisitos del plan

- Plan **Business** o **Cloud** (Node.js no está en hosting PHP básico)
- **SSL/HTTPS** activado
