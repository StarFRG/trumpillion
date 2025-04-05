-- Drop existing policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public pixel access" ON pixels;
    DROP POLICY IF EXISTS "Pixel insert validation" ON pixels;
    DROP POLICY IF EXISTS "Pixel update validation" ON pixels;
END $$;

-- Ensure RLS is enabled
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Create secure policies with validation
CREATE POLICY "Public pixel access"
  ON pixels
  FOR SELECT
  USING (true);

CREATE POLICY "Pixel insert validation"
  ON pixels
  FOR INSERT
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

CREATE POLICY "Pixel update validation"
  ON pixels
  FOR UPDATE
  USING (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000
  )
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

-- Enable realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE tablename = 'pixels'
        AND schemaname = 'public'
        AND pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE pixels;
    END IF;
END $$;

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

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE tablename = 'pixels'
        AND schemaname = 'public'
    ) THEN
        RAISE EXCEPTION 'Realtime not enabled for pixels table';
    END IF;

    RAISE NOTICE 'Successfully configured security and realtime';
END $$;