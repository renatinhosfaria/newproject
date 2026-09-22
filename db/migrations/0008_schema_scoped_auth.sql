-- Upgrade already-migrated installations as well as new isolated schemas.
-- The migration runner pins search_path to the owner-managed schema, pg_temp last.
ALTER FUNCTION auth_broker_for_user(uuid, uuid) SET search_path FROM CURRENT;
REVOKE ALL ON FUNCTION auth_broker_for_user(uuid, uuid) FROM PUBLIC;
ALTER FUNCTION assert_agent_session_scope() SET search_path FROM CURRENT;
ALTER FUNCTION assert_agent_session_agent_available() SET search_path FROM CURRENT;
ALTER FUNCTION assert_agent_available() SET search_path FROM CURRENT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    GRANT EXECUTE ON FUNCTION auth_broker_for_user(uuid, uuid) TO pacaembu_app;
    GRANT UPDATE ON auth_sessions TO pacaembu_app;
  END IF;
END $$;
