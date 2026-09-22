REVOKE ALL ON FUNCTION auth_broker_for_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_broker_for_user(uuid, uuid) TO pacaembu_app;
ALTER FUNCTION auth_broker_for_user(uuid, uuid) SET search_path = public, pg_temp;
