/*
  # Update security policies and storage configuration

  1. Changes
    - Drop existing policies
    - Create new validated policies for pixels table
    - Configure storage bucket and policies
    - Enable realtime updates

  2. Security
    - Enable RLS on all tables
    - Add validation for coordinates and URLs
    - Configure secure storage access
*/

-- Drop existing policies first
DO $$
BEGIN
    -- Drop pixel policies
    DROP POLICY IF EXISTS "Public pixel access" ON pixels;
    DROP POLICY IF EXISTS "Pixel insert validation" ON pixels;
    DROP POLICY IF EXISTS "Pixel update validation" ON pixels;
    
    -- Drop storage policies
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;
END $$;

-- Enable RLS
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create pixel policies with strict validation
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
    image_url IS NOT NULL AND
    length(image_url) <= 2048
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
    image_url IS NOT NULL AND
    length(image_url) <= 2048
  );

-- Add constraints for data integrity
ALTER TABLE pixels ADD CONSTRAINT valid_image_url 
  CHECK (image_url ~ '^https?://' AND length(image_url) <= 2048);

-- Configure storage with validation
INSERT INTO storage.buckets (id, name, public)
VALUES ('pixel-images', 'pixel-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Create storage policies with validation
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pixel-images');

CREATE POLICY "Storage upload validation"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pixel-images' AND
    length(name) <= 255
  );

CREATE POLICY "Storage update validation"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pixel-images')
  WITH CHECK (
    bucket_id = 'pixel-images' AND
    length(name) <= 255
  );

CREATE POLICY "Storage delete validation"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pixel-images');

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
        RAISE EXCEPTION 'Expected exactly 3 policies for pixels table, found %', policy_count;
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