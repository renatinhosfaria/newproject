DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    GRANT SELECT ON schema_migrations TO pacaembu_app;
  END IF;
END $$;
