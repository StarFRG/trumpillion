/*
  # Update policies for pixels table and storage

  1. Changes
    - Drop all existing policies first
    - Create fresh policies with validation
    - Configure storage bucket and policies
    - Enable realtime

  2. Security
    - Maintain RLS
    - Add validation for coordinates and URLs
    - Ensure proper storage access
*/

-- First drop ALL existing policies
DO $$
DECLARE
    policy_name text;
BEGIN
    -- Drop pixel table policies
    FOR policy_name IN (
        SELECT policyname::text
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels'
    )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON pixels', policy_name);
    END LOOP;

    -- Drop storage policies
    FOR policy_name IN (
        SELECT policyname::text
        FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects'
        AND qual::text LIKE '%pixel-images%'
    )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);
    END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Create fresh policies with validation
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

-- Configure storage
DO $$
BEGIN
    -- Ensure bucket exists and is public
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('pixel-images', 'pixel-images', true)
    ON CONFLICT (id) DO UPDATE
    SET public = true;

    -- Create storage policies
    CREATE POLICY "Public pixel image access"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'pixel-images');

    CREATE POLICY "Pixel image upload validation"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'pixel-images');

    CREATE POLICY "Pixel image update validation"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'pixel-images');

    CREATE POLICY "Pixel image deletion"
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