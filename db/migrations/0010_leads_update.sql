DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    GRANT UPDATE (
      name,
      phone_normalized,
      email,
      stage,
      interest,
      next_action,
      updated_at
    ) ON leads TO pacaembu_app;
  END IF;
END $$;
