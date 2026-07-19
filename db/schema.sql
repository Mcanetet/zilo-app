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

CREATE TABLE IF NOT EXISTS pricing_config (
  id VARCHAR(32) PRIMARY KEY,
  config JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
ALTER TABLE users ADD COLUMN billing JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN mfa JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN admin_access JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN provider_contract JSON DEFAULT NULL;
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

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  event VARCHAR(80) NOT NULL,
  channel ENUM('email', 'whatsapp', 'system') NOT NULL DEFAULT 'system',
  status ENUM('sent', 'queued', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
  recipient VARCHAR(190),
  subject VARCHAR(255),
  body TEXT,
  meta JSON,
  request_id VARCHAR(64),
  user_id VARCHAR(64),
  error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_request (request_id),
  INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promos (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  code VARCHAR(64),
  color VARCHAR(16),
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  discount_percent INT NULL DEFAULT NULL,
  show_banner TINYINT(1) NOT NULL DEFAULT 1,
  checkout_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_backups (
  id VARCHAR(64) PRIMARY KEY,
  backup_type VARCHAR(32) NOT NULL,
  triggered_by VARCHAR(190),
  created_at DATETIME NOT NULL,
  manifest JSON NOT NULL,
  snapshot LONGTEXT NOT NULL,
  folder_name VARCHAR(191),
  includes_uploads TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_app_backups_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aland_config (
  id VARCHAR(32) PRIMARY KEY,
  config JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aland_knowledge (
  id VARCHAR(64) PRIMARY KEY,
  source_type ENUM('company', 'service', 'pricing', 'custom', 'upload') NOT NULL DEFAULT 'custom',
  service_id VARCHAR(64),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_aland_knowledge_service (service_id),
  INDEX idx_aland_knowledge_source (source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aland_conversations (
  id VARCHAR(64) PRIMARY KEY,
  service_id VARCHAR(64) NOT NULL,
  service_name VARCHAR(120) NOT NULL,
  client_id VARCHAR(64),
  client_name VARCHAR(120) NOT NULL,
  client_email VARCHAR(190),
  provider_id VARCHAR(64),
  provider_name VARCHAR(120),
  status ENUM('ai_active', 'awaiting_provider', 'awaiting_admin', 'closed') NOT NULL DEFAULT 'ai_active',
  escalated_at DATETIME,
  provider_notified_at DATETIME,
  admin_escalated_at DATETIME,
  last_message_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aland_conv_status (status),
  INDEX idx_aland_conv_provider (provider_id),
  INDEX idx_aland_conv_client (client_id),
  INDEX idx_aland_conv_last (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aland_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  sender_type ENUM('client', 'aland', 'provider', 'admin', 'system') NOT NULL,
  sender_id VARCHAR(64),
  sender_name VARCHAR(120),
  body TEXT NOT NULL,
  meta JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aland_msg_conv (conversation_id, created_at),
  CONSTRAINT fk_aland_msg_conv FOREIGN KEY (conversation_id) REFERENCES aland_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coverage_communes (
  region_code VARCHAR(64) NOT NULL,
  commune_code VARCHAR(64) NOT NULL,
  region_name VARCHAR(160) NOT NULL,
  commune_name VARCHAR(120) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (region_code, commune_code),
  INDEX idx_coverage_enabled (enabled),
  INDEX idx_coverage_region (region_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coverage_regions (
  region_code VARCHAR(64) PRIMARY KEY,
  region_name VARCHAR(160) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coverage_regions_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users ADD COLUMN address_lat DECIMAL(10, 7) NULL;
ALTER TABLE users ADD COLUMN address_lng DECIMAL(10, 7) NULL;
ALTER TABLE users ADD COLUMN address_place_id VARCHAR(32) NULL;

ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verification_code_hash VARCHAR(128) NULL;
ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verification_sent_at DATETIME NULL;

ALTER TABLE consent_records ADD COLUMN purpose VARCHAR(255) NULL;
ALTER TABLE consent_records ADD COLUMN legal_basis VARCHAR(64) NULL;
ALTER TABLE consent_records ADD COLUMN source VARCHAR(64) NULL;
ALTER TABLE consent_records ADD COLUMN withdrawn_at DATETIME NULL;
ALTER TABLE consent_records ADD COLUMN meta JSON NULL;
