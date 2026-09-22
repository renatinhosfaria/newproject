DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE agent_session_status AS ENUM ('active', 'stopped', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE agent_run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(80) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description text NOT NULL DEFAULT '',
  status agent_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  key varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, key)
);

CREATE TABLE workspace_agents (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent_id)
);
CREATE INDEX workspace_agents_workspace_enabled_idx ON workspace_agents(workspace_id, enabled);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  user_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  lead_id uuid,
  conversation_id uuid,
  title varchar(160) NOT NULL DEFAULT '',
  status agent_session_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, broker_id, id),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES brokers(workspace_id, id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id),
  FOREIGN KEY (workspace_id, agent_id) REFERENCES workspace_agents(workspace_id, agent_id),
  FOREIGN KEY (workspace_id, broker_id, lead_id) REFERENCES leads(workspace_id, broker_id, id),
  FOREIGN KEY (workspace_id, broker_id, conversation_id) REFERENCES conversations(workspace_id, broker_id, id),
  CHECK (conversation_id IS NULL OR lead_id IS NOT NULL)
);
CREATE INDEX agent_sessions_broker_updated_idx ON agent_sessions(workspace_id, broker_id, updated_at DESC, id);

CREATE OR REPLACE FUNCTION assert_agent_session_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.workspace_id = NEW.workspace_id AND c.broker_id = NEW.broker_id
      AND c.id = NEW.conversation_id AND c.lead_id = NEW.lead_id
  ) THEN
    RAISE EXCEPTION 'agent session conversation must belong to lead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_session_scope_guard
  BEFORE INSERT OR UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION assert_agent_session_scope();

CREATE TABLE agent_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  session_id uuid NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'queued',
  input_content text NOT NULL,
  result_json jsonb,
  error_code varchar(120),
  output_message_id uuid,
  events_expire_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, broker_id, run_id),
  UNIQUE (workspace_id, broker_id, session_id, run_id),
  FOREIGN KEY (workspace_id, broker_id, session_id)
    REFERENCES agent_sessions(workspace_id, broker_id, id)
);
CREATE INDEX agent_runs_queued_idx ON agent_runs(workspace_id, broker_id, created_at) WHERE status = 'queued';
CREATE INDEX agent_runs_running_idx ON agent_runs(workspace_id, broker_id, updated_at) WHERE status = 'running';
CREATE INDEX agent_runs_session_created_idx ON agent_runs(session_id, created_at DESC);

CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  broker_id uuid NOT NULL,
  session_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  type varchar(160) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id varchar(160) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence),
  FOREIGN KEY (workspace_id, broker_id, session_id, run_id)
    REFERENCES agent_runs(workspace_id, broker_id, session_id, run_id)
);
CREATE INDEX agent_events_replay_idx ON agent_events(workspace_id, broker_id, session_id, run_id, sequence);
CREATE INDEX agent_events_expiry_idx ON agent_events(occurred_at);
