-- Restrict Realtime channel subscriptions to authenticated users only.
-- Postgres Changes broadcasts already respect RLS on source tables, so per-row
-- payloads are filtered by each table's existing RLS policies (get_data_owner_id).
-- This adds an additional gate so anonymous users cannot subscribe to realtime
-- channels at all.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive realtime broadcasts" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can send realtime messages" ON realtime.messages;
CREATE POLICY "Authenticated users can send realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);
