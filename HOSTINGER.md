# Desplegar Fundez en Hostinger

## Si sale "Unsupported framework or invalid project structure"

Ese error aparece en el asistente **quick-install-node-addon** (Codex). Fundez es **Express.js**, no una app React/Next. Usa uno de estos métodos:

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
   - **Entry file:** `index.js` (o `app.js` si el panel lo pide)
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

## Si sale error 503 en zilo.cl

Significa que **la app Node.js no arrancó**. Casi siempre es por variables de entorno o MySQL.

### Checklist rápido

1. hPanel → tu sitio → **Node.js** → **Environment Variables**
2. Añade estas variables (recomendado, una por una):

```
NODE_ENV=production
SESSION_SECRET=clave-larga-aleatoria-min-32-caracteres
APP_URL=https://zilo.cl
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u482073296_zilo_bd
DB_USER=u482073296_zilo_user
DB_PASSWORD=tu-clave-mysql
```

3. Verifica configuración de la app:
   - **Entry file:** `index.js`
   - **Build:** `npm run build`
   - **Start:** `npm start`
   - **Node.js:** 20.x

4. Clic en **Redeploy**

5. Revisa **Runtime logs** (o archivo `stderr.log` en la carpeta de la app).  
   Busca: `No se pudo iniciar Fundez` o `DATABASE_URL`.

> **Importante:** `.env` de tu Mac **no se sube a GitHub**. Las variables deben estar en el panel de Hostinger.

---

## Variables de entorno obligatorias

```
NODE_ENV=production
PORT=3000
SESSION_SECRET=clave-larga-aleatoria-min-32-chars
APP_URL=https://zilo.cl
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u482073296_zilo_bd
DB_USER=u482073296_zilo_user
DB_PASSWORD=tu-clave-mysql
```

(O usa `DATABASE_URL=mysql://usuario:clave@localhost:3306/u482073296_zilo_bd`)

---

## MySQL (obligatorio)

Fundez guarda usuarios, servicios y solicitudes en **MySQL**. Sin `DATABASE_URL` la app no arranca.

### 1. Base de datos en Hostinger

Ya tienes:
- **Base de datos:** `u482073296_zilo_bd`
- **Usuario:** `u482073296_zilo_user`

En variables de entorno del Node.js app, añade:

```
DATABASE_URL=mysql://u482073296_zilo_user:TU_CLAVE@localhost:3306/u482073296_zilo_bd
```

> En Hostinger el host suele ser `localhost` cuando la app y MySQL están en el mismo servidor.

### 2. Inicializar tablas y usuarios demo

Tras el primer deploy, en la terminal SSH de Hostinger:

```bash
npm run db:setup
```

Esto crea las tablas e inserta los usuarios demo:

| Rol | Email | Contraseña |
|-----|-------|------------|
| Cliente | `cliente@zilo.cl` | `cliente123` |
| Proveedor verificado | `pedro@zilo.cl` | `proveedor123` |
| Proveedor nuevo | `marta@zilo.cl` | `proveedor123` |
| Admin | `admin@zilo.cl` | `admin123` |

> Si la BD ya tiene usuarios, el seed se omite (no borra datos existentes).

### 3. Desarrollo local

```bash
# Crea una BD local llamada "zilo", copia .env.example a .env y ajusta DATABASE_URL
npm run db:setup
npm start
```

---

## Comprobar que funciona

Abre: `https://tudominio.cl/health`  
Debe responder: `{"ok":true,"app":"zilo","database":"connected",...}`

---

## Requisitos del plan

- Plan **Business** o **Cloud** (Node.js no está en hosting PHP básico)
- **SSL/HTTPS** activado
