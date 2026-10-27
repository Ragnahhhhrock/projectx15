-- Collective flight counters (the Pages Function also creates this if missing).
CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
