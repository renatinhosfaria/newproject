ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS membership_role membership_role NOT NULL DEFAULT 'broker';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'workspace_memberships'::regclass
      AND conname IN (
        'workspace_memberships_workspace_user_role_unique',
        'workspace_memberships_workspace_id_user_id_role_key'
      )
  ) THEN
    ALTER TABLE workspace_memberships
      ADD CONSTRAINT workspace_memberships_workspace_user_role_unique
      UNIQUE (workspace_id, user_id, role);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_sessions'::regclass
      AND conname = 'agent_sessions_membership_role_check'
  ) THEN
    ALTER TABLE agent_sessions
      ADD CONSTRAINT agent_sessions_membership_role_check
      CHECK (membership_role = 'broker');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_sessions'::regclass
      AND conname IN (
        'agent_sessions_workspace_user_role_fk',
        'agent_sessions_workspace_id_user_id_membership_role_fkey'
      )
  ) THEN
    ALTER TABLE agent_sessions
      ADD CONSTRAINT agent_sessions_workspace_user_role_fk
      FOREIGN KEY (workspace_id, user_id, membership_role)
      REFERENCES workspace_memberships (workspace_id, user_id, role);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agent_sessions'::regclass
      AND conname IN (
        'agent_sessions_workspace_broker_user_fk',
        'agent_sessions_workspace_id_broker_id_user_id_fkey'
      )
  ) THEN
    ALTER TABLE agent_sessions
      ADD CONSTRAINT agent_sessions_workspace_broker_user_fk
      FOREIGN KEY (workspace_id, broker_id, user_id)
      REFERENCES brokers (workspace_id, id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_sessions_membership_user_idx
  ON agent_sessions (workspace_id, user_id, membership_role);
CREATE INDEX IF NOT EXISTS agent_sessions_broker_user_idx
  ON agent_sessions (workspace_id, broker_id, user_id);
CREATE INDEX IF NOT EXISTS agent_sessions_agent_scope_idx
  ON agent_sessions (workspace_id, agent_id);
CREATE INDEX IF NOT EXISTS agent_sessions_lead_scope_idx
  ON agent_sessions (workspace_id, broker_id, lead_id);
CREATE INDEX IF NOT EXISTS agent_sessions_conversation_scope_idx
  ON agent_sessions (workspace_id, broker_id, conversation_id);

CREATE OR REPLACE FUNCTION assert_agent_session_agent_available() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM agents a
    JOIN workspace_agents wa ON wa.agent_id = a.id
    WHERE a.id = NEW.agent_id
      AND a.status = 'active'
      AND wa.workspace_id = NEW.workspace_id
      AND wa.enabled
  ) THEN
    RAISE EXCEPTION 'agent is not enabled for this workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_session_availability_guard ON agent_sessions;
CREATE TRIGGER agent_session_availability_guard
  BEFORE INSERT OR UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION assert_agent_session_agent_available();

CREATE OR REPLACE FUNCTION assert_agent_available() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  session_agent_id uuid;
BEGIN
  SELECT s.agent_id INTO session_agent_id
  FROM agent_sessions s
  WHERE s.workspace_id = NEW.workspace_id
    AND s.broker_id = NEW.broker_id
    AND s.id = NEW.session_id;
  IF NOT EXISTS (
    SELECT 1
    FROM agents a
    JOIN workspace_agents wa ON wa.agent_id = a.id
    WHERE a.id = session_agent_id
      AND a.status = 'active'
      AND wa.workspace_id = NEW.workspace_id
      AND wa.enabled
  ) THEN
    RAISE EXCEPTION 'agent is not enabled for this workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_run_availability_guard ON agent_runs;
CREATE TRIGGER agent_run_availability_guard
  BEFORE INSERT OR UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION assert_agent_available();
