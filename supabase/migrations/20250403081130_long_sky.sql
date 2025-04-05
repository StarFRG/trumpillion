-- Drop existing policies to ensure clean state
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can insert pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can update pixels" ON pixels;
END $$;

-- Ensure RLS is enabled
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Create fresh policies
CREATE POLICY "Anyone can view pixels"
  ON pixels
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert pixels"
  ON pixels
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update pixels"
  ON pixels
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Verify configuration
DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*)
    INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' 
    AND tablename = 'pixels';

    IF policy_count != 3 THEN
        RAISE EXCEPTION 'Expected exactly 3 policies, found %', policy_count;
    END IF;

    -- Check if realtime is enabled without trying to add it again
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE tablename = 'pixels'
        AND schemaname = 'public'
    ) THEN
        -- Only try to add to publication if not already present
        ALTER PUBLICATION supabase_realtime ADD TABLE pixels;
    END IF;

    RAISE NOTICE 'Successfully configured realtime and policies';
END $$;