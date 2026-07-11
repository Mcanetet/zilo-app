-- Aland IA — tablas de agente, conocimiento y mensajes (v1.3.0)

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

INSERT INTO modules (id, audience, name, description, sort_order, enabled) VALUES
  ('client_aland', 'client', 'Chat Aland IA', 'Asistente IA por servicio antes de solicitar visita', 11, 1),
  ('provider_mensajes', 'provider', 'Mensajes Aland IA', 'Consultas derivadas por Aland IA desde clientes', 9, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
