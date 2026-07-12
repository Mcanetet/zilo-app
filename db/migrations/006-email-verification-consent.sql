-- Verificación de correo + consentimientos Ley 21.719
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verification_code_hash VARCHAR(128) NULL;
ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verification_sent_at DATETIME NULL;

ALTER TABLE consent_records ADD COLUMN purpose VARCHAR(255) NULL;
ALTER TABLE consent_records ADD COLUMN legal_basis VARCHAR(64) NULL;
ALTER TABLE consent_records ADD COLUMN source VARCHAR(64) NULL;
ALTER TABLE consent_records ADD COLUMN withdrawn_at DATETIME NULL;
ALTER TABLE consent_records ADD COLUMN meta JSON NULL;

-- Cuentas existentes: considerar correo verificado
UPDATE users SET email_verified_at = COALESCE(created_at, NOW()) WHERE email_verified_at IS NULL;
