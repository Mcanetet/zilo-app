-- ============================================================
-- Fundez — Datos demo para MySQL (Hostinger)
-- ============================================================
-- Cómo usar en Hostinger:
--   1. hPanel -> Bases de datos -> phpMyAdmin de tu base (u482073296_fundezapp_bd)
--   2. Pestaña "Importar" -> Selecciona este archivo -> Continuar
--   3. Se crean las tablas (si faltan) y se cargan los usuarios demo.
--
-- Se puede re-importar sin duplicar (usa ON DUPLICATE KEY / INSERT IGNORE).
--
-- Credenciales demo:
--   Cliente:   cliente@zilo.cl   / cliente123
--   Proveedor: pedro@zilo.cl     / proveedor123
--   Admin:     admin@zilo.cl     / admin123
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ---------- Esquema (crea las tablas si no existen) ----------

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  icon VARCHAR(64),
  color VARCHAR(16),
  visit_price INT NOT NULL DEFAULT 0,
  basic_min INT NOT NULL DEFAULT 0,
  basic_max INT NOT NULL DEFAULT 0,
  description TEXT,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('client', 'provider', 'admin') NOT NULL,
  phone VARCHAR(40),
  address TEXT,
  referral_code VARCHAR(32),
  zilo_points INT NOT NULL DEFAULT 0,
  credits_clp INT NOT NULL DEFAULT 0,
  referrals_count INT NOT NULL DEFAULT 0,
  services_count INT NOT NULL DEFAULT 0,
  used_welcome_promo TINYINT(1) NOT NULL DEFAULT 0,
  used_referral TINYINT(1) NOT NULL DEFAULT 0,
  member_since DATE,
  onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
  onboarding_completed_at DATETIME,
  specialties JSON,
  rating DECIMAL(3, 2),
  reviews_count INT NOT NULL DEFAULT 0,
  online TINYINT(1) NOT NULL DEFAULT 0,
  avatar VARCHAR(8),
  bio TEXT,
  reviews JSON,
  verification JSON,
  location_share JSON,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_requests (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  provider_id VARCHAR(64),
  service_id VARCHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending_payment',
  payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  payload JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_requests_client (client_id),
  INDEX idx_requests_provider (provider_id),
  INDEX idx_requests_status (status),
  INDEX idx_requests_payment (payment_status),
  CONSTRAINT fk_requests_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_requests_provider FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_requests_service FOREIGN KEY (service_id) REFERENCES services (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS home_logbook (
  id VARCHAR(64) PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  address TEXT,
  service_name VARCHAR(120),
  category VARCHAR(64),
  entry_date DATE,
  note TEXT,
  health_impact INT NOT NULL DEFAULT 5,
  provider_name VARCHAR(120),
  INDEX idx_logbook_client (client_id),
  CONSTRAINT fk_logbook_client FOREIGN KEY (client_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS complaints (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64),
  client_name VARCHAR(120),
  client_email VARCHAR(190),
  type VARCHAR(40),
  subject VARCHAR(255),
  description TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'abierto',
  priority VARCHAR(20),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chats (
  id VARCHAR(64) PRIMARY KEY,
  client_name VARCHAR(120),
  client_phone VARCHAR(40),
  last_message TEXT,
  channel VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'activo',
  unread INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consent_records (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64),
  ip VARCHAR(64),
  type VARCHAR(40) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 1,
  version VARCHAR(16),
  user_agent VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_consent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_logs (
  id VARCHAR(64) PRIMARY KEY,
  event VARCHAR(80) NOT NULL,
  detail TEXT,
  `user` VARCHAR(190),
  ip VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Servicios ----------

INSERT INTO services (id, name, icon, color, visit_price, basic_min, basic_max, description, enabled) VALUES
('electrico', 'Eléctrico', 'electrico', '#F59E0B', 25000, 40000, 60000, 'Instalaciones, cortocircuitos, tableros y emergencias eléctricas.', 1),
('gasfiter', 'Gásfiter', 'gasfiter', '#3B82F6', 25000, 45000, 70000, 'Fugas, cañerías, grifería y destapes en baño y cocina.', 1),
('cerrajero', 'Cerrajero', 'cerrajero', '#8B5CF6', 30000, 50000, 90000, 'Apertura de puertas, cambio de cerraduras y copias de llaves.', 1),
('termos', 'Reparación de Termos', 'termos', '#EF4444', 28000, 55000, 120000, 'Mantención, cambio de resistencia y reparación de termos eléctricos.', 1),
('lavavajillas', 'Lavavajillas', 'lavavajillas', '#06B6D4', 25000, 45000, 85000, 'Reparación de bombas, fugas y programas de lavado.', 1),
('lavadora', 'Lavadora', 'lavadora', '#10B981', 25000, 40000, 80000, 'Centrifugado, drenaje, tambor y tarjetas electrónicas.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), icon = VALUES(icon), color = VALUES(color),
  visit_price = VALUES(visit_price), basic_min = VALUES(basic_min),
  basic_max = VALUES(basic_max), description = VALUES(description), enabled = VALUES(enabled);

-- ---------- Usuarios demo ----------

INSERT INTO users (
  id, email, password, name, role, phone, address, referral_code,
  zilo_points, credits_clp, referrals_count, services_count,
  used_welcome_promo, used_referral, member_since,
  onboarding_completed, onboarding_completed_at,
  specialties, rating, reviews_count, online, avatar, bio, reviews, verification, location_share
) VALUES
(
  'client-1', 'cliente@zilo.cl', 'cliente123', 'María González', 'client',
  '+56 9 8765 4321', 'Av. Providencia 2650, Providencia, Santiago', 'MARIA2026',
  350, 5000, 2, 4, 0, 0, '2025-11-01', 0, NULL,
  '[]', NULL, 0, 0, NULL, NULL, '[]', NULL, NULL
),
(
  'provider-pedro', 'pedro@zilo.cl', 'proveedor123', 'Pedro Gómez', 'provider',
  '+56 9 2234 5678', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, NULL,
  '["gasfiter"]', 4.80, 94, 0, 'PG',
  'Gásfiter maestro con 10 años de experiencia en edificios y hogares de Santiago.',
  '[{"author":"Camila T.","rating":5,"text":"Excelente disposición, solucionó la filtración del lavaplatos muy rápido","date":"2025-05-18"},{"author":"Diego M.","rating":5,"text":"Muy puntual y dejó todo limpio después del trabajo.","date":"2025-04-30"},{"author":"Sofía L.","rating":4,"text":"Buen precio y trabajo bien hecho en la cañería.","date":"2025-04-12"}]',
  '{"status":"verified","idCardFront":"demo","idCardBack":"demo","certificates":[],"selfie":null,"faceVerified":true,"faceScore":94,"faceVerifiedAt":"2025-10-01T12:00:00.000Z","submittedAt":"2025-10-01T12:00:00.000Z"}',
  '{"consent":true,"consentAt":"2025-10-01T12:00:00.000Z","lat":-33.442,"lng":-70.654,"updatedAt":"2025-10-01T12:00:00.000Z"}'
),
(
  'provider-marta', 'marta@zilo.cl', 'proveedor123', 'Marta Quiroz', 'provider',
  '+56 9 3345 6789', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, NULL,
  '["electrico"]', 4.90, 112, 0, 'MQ',
  'Electricista certificada SEC. Especialista en instalaciones residenciales y comerciales.',
  '[{"author":"Andrés P.","rating":5,"text":"Certificada SEC, instaló las luminarias del pasillo de forma impecable","date":"2025-05-22"},{"author":"Valentina R.","rating":5,"text":"Profesional y muy clara al explicar el trabajo realizado.","date":"2025-05-05"},{"author":"Jorge H.","rating":5,"text":"Solucionó un cortocircuito complejo en menos de una hora.","date":"2025-04-20"}]',
  '{"status":"incomplete","idCardFront":null,"idCardBack":null,"certificates":[],"selfie":null,"faceVerified":false,"faceScore":null,"faceVerifiedAt":null,"submittedAt":null}',
  '{"consent":false,"consentAt":null,"lat":null,"lng":null,"updatedAt":null}'
),
(
  'provider-juan', 'juancarlos@zilo.cl', 'proveedor123', 'Juan Carlos', 'provider',
  '+56 9 4456 7890', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, NULL,
  '["cerrajero"]', 4.70, 78, 0, 'JC',
  'Cerrajero profesional 24/7. Apertura sin daños y cambio de cerraduras de seguridad.',
  '[{"author":"Patricia N.","rating":5,"text":"Llegó en 20 minutos y abrió la puerta del departamento sin daños","date":"2025-05-15"},{"author":"Felipe A.","rating":4,"text":"Rápido y eficiente, cambió la cerradura completa.","date":"2025-04-28"},{"author":"Daniela C.","rating":5,"text":"Muy confiable, lo llamaré de nuevo sin dudarlo.","date":"2025-04-10"}]',
  '{"status":"incomplete","idCardFront":null,"idCardBack":null,"certificates":[],"selfie":null,"faceVerified":false,"faceScore":null,"faceVerifiedAt":null,"submittedAt":null}',
  '{"consent":false,"consentAt":null,"lat":null,"lng":null,"updatedAt":null}'
),
(
  'provider-ana', 'ana@zilo.cl', 'proveedor123', 'Ana Rojas', 'provider',
  '+56 9 5567 8901', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, NULL,
  '["termos","lavavajillas","lavadora"]', 4.90, 67, 0, 'AR',
  'Técnica certificada en electrodomésticos. Especialista en termos, lavadoras y lavavajillas.',
  '[{"author":"Luis V.","rating":5,"text":"Reparó el termo el mismo día, muy profesional.","date":"2025-05-20"},{"author":"Carmen S.","rating":5,"text":"Excelente con la lavadora, explicó todo con claridad.","date":"2025-05-08"}]',
  '{"status":"incomplete","idCardFront":null,"idCardBack":null,"certificates":[],"selfie":null,"faceVerified":false,"faceScore":null,"faceVerifiedAt":null,"submittedAt":null}',
  '{"consent":false,"consentAt":null,"lat":null,"lng":null,"updatedAt":null}'
),
(
  'admin-1', 'admin@zilo.cl', 'admin123', 'Admin Fundez', 'admin',
  '+56 9 0000 0000', NULL, NULL, 0, 0, 0, 0, 0, 0, NULL, 0, NULL,
  '[]', NULL, 0, 0, NULL, NULL, '[]', NULL, NULL
)
ON DUPLICATE KEY UPDATE
  email = VALUES(email), password = VALUES(password), name = VALUES(name), role = VALUES(role),
  phone = VALUES(phone), address = VALUES(address), referral_code = VALUES(referral_code),
  zilo_points = VALUES(zilo_points), credits_clp = VALUES(credits_clp),
  referrals_count = VALUES(referrals_count), services_count = VALUES(services_count),
  used_welcome_promo = VALUES(used_welcome_promo), used_referral = VALUES(used_referral),
  member_since = VALUES(member_since), specialties = VALUES(specialties),
  rating = VALUES(rating), reviews_count = VALUES(reviews_count), online = VALUES(online),
  avatar = VALUES(avatar), bio = VALUES(bio), reviews = VALUES(reviews),
  verification = VALUES(verification), location_share = VALUES(location_share);

-- ---------- Pasaporte Hogar (bitácora) ----------

INSERT IGNORE INTO home_logbook (id, client_id, address, service_name, category, entry_date, note, health_impact, provider_name) VALUES
('log-001', 'client-1', 'Av. Providencia 2650, Providencia, Santiago', 'Gásfiter', 'gasfiter', '2025-11-15', 'Revisión de cañería bajo lavaplatos — sin fugas detectadas', 8, 'Pedro Gómez'),
('log-002', 'client-1', 'Av. Providencia 2650, Providencia, Santiago', 'Eléctrico', 'electrico', '2026-01-20', 'Instalación de luminarias LED en pasillo y verificación de tablero', 10, 'Marta Quiroz'),
('log-003', 'client-1', 'Av. Providencia 2650, Providencia, Santiago', 'Reparación de Termos', 'termos', '2026-03-08', 'Cambio de resistencia y limpieza de sedimentos', 12, 'Ana Rojas');

-- ---------- Reclamos ----------

INSERT IGNORE INTO complaints (id, request_id, client_name, client_email, type, subject, description, status, priority, created_at, resolved_at) VALUES
('rec-001', NULL, 'Jorge Muñoz', 'jorge@email.cl', 'calidad', 'Trabajo incompleto en instalación eléctrica', 'El técnico se fue sin terminar el empalme del tablero.', 'abierto', 'alta', '2026-06-28 14:30:00', NULL),
('rec-002', NULL, 'Carolina Díaz', 'carolina@email.cl', 'cobro', 'Cobro diferente al presupuesto', 'Me cobraron $20.000 más de lo acordado en la visita.', 'en_revision', 'media', '2026-06-27 09:15:00', NULL),
('rec-003', NULL, 'Andrés Vega', 'andres@email.cl', 'demora', 'Proveedor no llegó en el tiempo estimado', 'Esperé más de 2 horas y nadie llegó.', 'resuelto', 'baja', '2026-06-25 18:00:00', '2026-06-26 10:00:00');

-- ---------- Chats ----------

INSERT IGNORE INTO chats (id, client_name, client_phone, last_message, channel, status, unread, updated_at) VALUES
('chat-001', 'María González', '+56 9 8765 4321', '¿A qué hora llega el técnico?', 'whatsapp', 'activo', 2, '2026-06-30 18:00:00'),
('chat-002', 'Roberto Soto', '+56 9 5555 1234', 'Necesito factura del servicio', 'whatsapp', 'activo', 0, '2026-06-30 15:30:00'),
('chat-003', 'Valentina Ríos', '+56 9 7777 8899', 'Gracias, todo resuelto', 'whatsapp', 'cerrado', 0, '2026-06-29 11:00:00');

-- ---------- Consentimientos ----------

INSERT IGNORE INTO consent_records (id, user_id, ip, type, granted, version, user_agent, created_at) VALUES
('c-1', 'client-1', NULL, 'privacidad', 1, '1.0', NULL, '2026-06-01 10:00:00'),
('c-2', 'client-1', NULL, 'cookies', 1, '1.0', NULL, '2026-06-01 10:00:00'),
('c-3', NULL, '192.168.1.1', 'cookies', 1, '1.0', NULL, '2026-06-15 08:00:00');

-- ---------- Registros de seguridad ----------

INSERT IGNORE INTO security_logs (id, event, detail, `user`, ip, created_at) VALUES
('sec-1', 'login_ok', NULL, 'admin@zilo.cl', '10.0.0.1', '2026-06-30 08:00:00'),
('sec-2', 'login_ok', NULL, 'cliente@zilo.cl', '10.0.0.2', '2026-06-30 09:30:00'),
('sec-3', 'pago_demo', 'Pago simulado aprobado', NULL, '10.0.0.2', '2026-06-30 10:00:00');

SET FOREIGN_KEY_CHECKS = 1;
