-- Migración incremental: promociones en MySQL (v1.2.0)
-- Ejecutar en Hostinger si la tabla no existe tras actualizar.

CREATE TABLE IF NOT EXISTS promos (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  code VARCHAR(64),
  color VARCHAR(16),
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO promos (id, title, description, code, color, sort_order, enabled) VALUES
  ('first', '20% en tu 1er servicio', 'Código BIENVENIDO al pagar', 'BIENVENIDO', '#B8956B', 1, 1),
  ('refer', 'Invita y gana $5.000', 'Tú y tu amigo reciben crédito', NULL, '#8B7355', 2, 1),
  ('gift', 'Regala un servicio', 'Modo Guardián para tu familia', NULL, '#A67C52', 3, 1)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description);
