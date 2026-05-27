-- 009_sync_heartbeat.sql
-- Adds tables for nightly sync run logging and laptop heartbeats.
-- Uses IF NOT EXISTS throughout so it is safe to run against a DB that
-- already has these tables from the PaaSRTSM migrations.

CREATE SCHEMA IF NOT EXISTS ingest;

CREATE TABLE IF NOT EXISTS ingest.sync_runs (
  sync_run_id  bigserial    PRIMARY KEY,
  sync_type    text         NOT NULL,
  branch_code  text,
  started_at   timestamptz  NOT NULL,
  finished_at  timestamptz,
  status       text         NOT NULL CHECK (status IN ('queued','running','success','failed')),
  records_read integer      NOT NULL DEFAULT 0 CHECK (records_read >= 0),
  records_sent integer      NOT NULL DEFAULT 0 CHECK (records_sent >= 0),
  message      text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_branch_started
  ON ingest.sync_runs (branch_code, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
  ON ingest.sync_runs (started_at DESC);

-- Laptop heartbeat: one row each time a branch laptop wakes up and
-- starts the sync script. Used to distinguish "sync failed" from
-- "laptop was off all night".
CREATE TABLE IF NOT EXISTS ingest.laptop_heartbeats (
  heartbeat_id  bigserial    PRIMARY KEY,
  branch_code   text         NOT NULL,
  laptop_name   text,
  event         text         NOT NULL DEFAULT 'startup',
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laptop_heartbeats_branch_created
  ON ingest.laptop_heartbeats (branch_code, created_at DESC);
