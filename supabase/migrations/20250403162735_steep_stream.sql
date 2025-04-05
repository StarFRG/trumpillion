/*
  # Update Database Security Configuration

  1. Changes
    - Drop and recreate core policies
    - Enable row level security
    - Configure storage access
    - Enable realtime updates

  2. Security
    - Allow public access with basic validation
    - Configure storage permissions
    - Enable realtime functionality
*/

-- Drop existing policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can insert pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can update pixels" ON pixels;
END $$;

-- Ensure RLS is enabled
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Create secure policies with validation
CREATE POLICY "Anyone can view pixels"
  ON pixels
  FOR SELECT
  USING (true);

CREATE POLICY "Validate pixel insert"
  ON pixels
  FOR INSERT
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

CREATE POLICY "Validate pixel update"
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

-- Configure storage
DO $$
BEGIN
    -- Ensure bucket exists and is public
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('pixel-images', 'pixel-images', true)
    ON CONFLICT (id) DO UPDATE
    SET public = true;

    -- Update storage policies
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;

    -- Create storage policies
    CREATE POLICY "Public pixel image access"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'pixel-images');

    CREATE POLICY "Validate pixel image upload"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'pixel-images');

    CREATE POLICY "Restrict pixel image updates"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'pixel-images');

    CREATE POLICY "Allow pixel image deletion"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'pixel-images');
END $$;

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