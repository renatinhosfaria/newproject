ALTER TABLE agent_runs ADD COLUMN request_id varchar(160) NOT NULL DEFAULT 'legacy-run';
CREATE UNIQUE INDEX agent_runs_output_message_unique ON agent_runs(output_message_id) WHERE output_message_id IS NOT NULL;
-- A disabled agent must still be able to transition to failed/cancelled.
DROP TRIGGER agent_run_availability_guard ON agent_runs;
CREATE TRIGGER agent_run_availability_guard BEFORE INSERT OR UPDATE ON agent_runs
  FOR EACH ROW WHEN (NEW.status IN ('queued','running','completed')) EXECUTE FUNCTION assert_agent_available();

-- The worker has no request context at startup. This read-only definer exposes
-- only routing identifiers, never prompts, contacts, results or provider secrets.
-- Its pinned owner-managed search_path cannot be redirected by an app caller.
CREATE FUNCTION pending_agent_run_scopes() RETURNS TABLE (
  run_id uuid, workspace_id uuid, broker_id uuid, user_id uuid,
  membership_id uuid, request_id varchar, status agent_run_status
) LANGUAGE sql SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT r.run_id, r.workspace_id, r.broker_id, s.user_id, m.id,
    r.request_id, r.status
  FROM agent_runs r JOIN agent_sessions s ON s.id=r.session_id
  JOIN workspace_memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id
  WHERE r.status IN ('queued','running') ORDER BY r.created_at, r.run_id LIMIT 100
$$;
REVOKE ALL ON FUNCTION pending_agent_run_scopes() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pacaembu_app') THEN
    GRANT EXECUTE ON FUNCTION pending_agent_run_scopes() TO pacaembu_app;
    GRANT UPDATE ON agent_runs TO pacaembu_app;
  END IF;
END $$;
