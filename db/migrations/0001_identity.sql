CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE TYPE workspace_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('broker', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE broker_status AS ENUM ('onboarding', 'active', 'suspended', 'offboarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  timezone varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  status workspace_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  status user_status NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role membership_role NOT NULL,
  status user_status NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, id, user_id),
  UNIQUE (workspace_id, user_id, role)
);

CREATE INDEX workspace_memberships_user_idx ON workspace_memberships(user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  membership_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, membership_id, user_id)
    REFERENCES workspace_memberships (workspace_id, id, user_id)
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_workspace_idx ON auth_sessions(workspace_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions(expires_at);
CREATE INDEX auth_sessions_membership_idx ON auth_sessions(workspace_id, membership_id);

CREATE TABLE brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL,
  display_name varchar(160) NOT NULL,
  registration_code varchar(80),
  status broker_status NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, user_id),
  UNIQUE (workspace_id, user_id),
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_memberships (workspace_id, user_id),
  UNIQUE (workspace_id, registration_code)
);
CREATE INDEX brokers_workspace_status_idx ON brokers(workspace_id, status);
