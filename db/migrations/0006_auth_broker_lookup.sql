-- Login needs the broker context before a session can establish RLS settings.
-- Keep this narrow lookup SECURITY DEFINER and expose only id/status.
CREATE OR REPLACE FUNCTION auth_broker_for_user(p_user_id uuid, p_workspace_id uuid)
RETURNS TABLE(id uuid, status broker_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.status
  FROM brokers b
  WHERE b.user_id = p_user_id AND b.workspace_id = p_workspace_id;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION auth_broker_for_user(uuid, uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth_broker_for_user(uuid, uuid) TO pacaembu_app';
  END IF;
END $$;
