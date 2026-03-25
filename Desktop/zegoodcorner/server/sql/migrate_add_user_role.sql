USE zegoodcorner;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role ENUM('acheteur', 'vendeur', 'admin') NOT NULL DEFAULT 'acheteur' AFTER display_name;

UPDATE users
SET role = 'acheteur'
WHERE role IS NULL OR role = '';
