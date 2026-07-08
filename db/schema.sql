-- Fundez — esquema MySQL (Hostinger)

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

CREATE TABLE IF NOT EXISTS modules (
  id VARCHAR(64) PRIMARY KEY,
  audience ENUM('client', 'provider') NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('client', 'provider', 'admin', 'tecnico') NOT NULL,
  parent_id VARCHAR(64) DEFAULT NULL,
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

ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN parent_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE users MODIFY COLUMN role ENUM('client', 'provider', 'admin', 'tecnico') NOT NULL;

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
