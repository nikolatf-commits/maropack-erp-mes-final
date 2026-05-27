-- Dodaj magacioner ulogu u users tabelu
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_uloga_check;
ALTER TABLE users ADD CONSTRAINT users_uloga_check 
  CHECK (uloga IN ('admin', 'manager', 'radnik', 'magacioner'));

-- Dodaj kolone za rezervaciju rolni na naloge
ALTER TABLE nalozi ADD COLUMN IF NOT EXISTS izabrane_rolne jsonb;
ALTER TABLE nalozi ADD COLUMN IF NOT EXISTS status_materijal text DEFAULT 'ceka_izbor';

-- Dodaj kolonu rezervisano_za u magacin
ALTER TABLE magacin ADD COLUMN IF NOT EXISTS rezervisano_za text;

-- Index za brže pretrage
CREATE INDEX IF NOT EXISTS idx_magacin_status ON magacin(status);
CREATE INDEX IF NOT EXISTS idx_magacin_tip ON magacin(tip);

-- Kolone za praćenje prečnika i povrata rolni
ALTER TABLE magacin ADD COLUMN IF NOT EXISTS poslednji_precnik numeric;
ALTER TABLE magacin ADD COLUMN IF NOT EXISTS poslednja_hilzna  numeric;
