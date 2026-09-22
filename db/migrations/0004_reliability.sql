CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  broker_id uuid,
  operation varchar(160) NOT NULL,
  resource_type varchar(120) NOT NULL,
  resource_id uuid,
  key varchar(128) NOT NULL,
  request_hash varchar(128) NOT NULL,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, operation, key),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES brokers(workspace_id, id),
  CHECK ((response_status IS NULL AND response_body IS NULL) OR (response_status IS NOT NULL AND response_body IS NOT NULL))
);
CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);
CREATE INDEX idempotency_user_idx ON idempotency_records(user_id);
CREATE INDEX idempotency_workspace_broker_idx ON idempotency_records(workspace_id, broker_id, created_at, id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  broker_id uuid,
  event_type varchar(160) NOT NULL,
  resource_type varchar(120) NOT NULL,
  resource_id uuid,
  request_id varchar(160) NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, broker_id) REFERENCES brokers(workspace_id, id)
);
CREATE INDEX audit_events_workspace_created_idx ON audit_events(workspace_id, created_at DESC);
CREATE INDEX audit_events_workspace_broker_created_idx ON audit_events(workspace_id, broker_id, created_at, id);
CREATE INDEX audit_events_actor_user_idx ON audit_events(actor_user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO pacaembu_app';
    EXECUTE 'GRANT SELECT, INSERT ON workspaces, users, workspace_memberships, auth_sessions, brokers, leads, conversations, messages, agents, agent_capabilities, workspace_agents, agent_sessions, agent_runs, agent_events, idempotency_records, audit_events TO pacaembu_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_events FROM pacaembu_app';
  END IF;
END $$;

ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY brokers_scope ON brokers USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND id::text = current_setting('app.broker_id', true)
);
CREATE POLICY leads_scope ON leads USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY conversations_scope ON conversations USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY messages_scope ON messages USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY agent_sessions_scope ON agent_sessions USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY agent_runs_scope ON agent_runs USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY agent_events_scope ON agent_events USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND broker_id::text = current_setting('app.broker_id', true)
);
CREATE POLICY workspace_agents_scope ON workspace_agents USING (
  workspace_id::text = current_setting('app.workspace_id', true)
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
);
CREATE POLICY audit_scope ON audit_events USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND (broker_id IS NULL OR broker_id::text = current_setting('app.broker_id', true))
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND (broker_id IS NULL OR broker_id::text = current_setting('app.broker_id', true))
);
