DO $$ BEGIN
  CREATE TYPE lead_stage AS ENUM ('novo', 'contato', 'visita', 'proposta', 'aprovado', 'perdido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('open', 'waiting', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE message_author AS ENUM ('lead', 'broker', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('received', 'processing', 'draft', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  name varchar(160) NOT NULL,
  phone_normalized varchar(40),
  email public.citext,
  source varchar(80),
  stage lead_stage NOT NULL DEFAULT 'novo',
  interest varchar(160),
  next_action varchar(200),
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, broker_id, id),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES brokers(workspace_id, id)
);
CREATE INDEX leads_broker_updated_idx ON leads(workspace_id, broker_id, updated_at DESC, id);
CREATE INDEX leads_workspace_broker_created_idx ON leads(workspace_id, broker_id, created_at, id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  status conversation_status NOT NULL DEFAULT 'open',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, broker_id, id),
  UNIQUE (workspace_id, broker_id, id, lead_id),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES brokers(workspace_id, id),
  FOREIGN KEY (workspace_id, broker_id, lead_id)
    REFERENCES leads(workspace_id, broker_id, id)
);
CREATE INDEX conversations_broker_updated_idx ON conversations(workspace_id, broker_id, updated_at DESC, id);
CREATE INDEX conversations_workspace_broker_created_idx ON conversations(workspace_id, broker_id, created_at, id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  external_message_id varchar(255),
  direction message_direction NOT NULL,
  author message_author NOT NULL,
  status message_status NOT NULL DEFAULT 'received',
  content text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, broker_id, conversation_id)
    REFERENCES conversations(workspace_id, broker_id, id),
  UNIQUE (broker_id, external_message_id)
);
CREATE INDEX messages_conversation_occurred_idx ON messages(conversation_id, occurred_at);
CREATE INDEX messages_workspace_broker_conversation_idx ON messages(workspace_id, broker_id, conversation_id);
CREATE INDEX messages_workspace_broker_created_idx ON messages(workspace_id, broker_id, created_at, id);
