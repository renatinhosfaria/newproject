DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pacaembu_app') THEN
    GRANT DELETE ON idempotency_records TO pacaembu_app;
  END IF;
END $$;

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY idempotency_scope ON idempotency_records USING (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND user_id::text = current_setting('app.user_id', true)
  AND (broker_id IS NULL OR broker_id::text = current_setting('app.broker_id', true))
) WITH CHECK (
  workspace_id::text = current_setting('app.workspace_id', true)
  AND user_id::text = current_setting('app.user_id', true)
  AND (broker_id IS NULL OR broker_id::text = current_setting('app.broker_id', true))
);
