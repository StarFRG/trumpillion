/*
  # Check and clean up policies

  1. Changes
    - First list all existing policies
    - Drop any old policies
    - Create fresh policies for both pixels and storage
    - Ensure only the new policies are active

  2. Security
    - Maintain public access as intended
    - Clean up any conflicting policies
*/

-- First, let's check what policies exist
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- List all existing policies for pixels table
    RAISE NOTICE 'Current policies for pixels table:';
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pixels'
    LOOP
        RAISE NOTICE 'Policy: %, Type: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.permissive,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- List all existing policies for storage.objects
    RAISE NOTICE 'Current policies for storage.objects:';
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        RAISE NOTICE 'Policy: %, Type: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.permissive,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;
END $$;

-- Drop all existing policies
DO $$
BEGIN
    -- Drop pixel policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pixels') THEN
        DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
        DROP POLICY IF EXISTS "Anyone can insert pixels" ON pixels;
        DROP POLICY IF EXISTS "Anyone can update pixels" ON pixels;
        DROP POLICY IF EXISTS "Authenticated users can insert pixels" ON pixels;
        DROP POLICY IF EXISTS "Users can update their own pixels" ON pixels;
    END IF;

    -- Drop storage policies if they exist
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') THEN
        DROP POLICY IF EXISTS "Public Access" ON storage.objects;
        DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
        DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
        DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;
    END IF;
END $$;

-- Create fresh policies for pixels table
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

-- Ensure storage bucket exists
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('pixel-images', 'pixel-images', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Create fresh storage policies
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pixel-images');

CREATE POLICY "Anyone can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pixel-images');

CREATE POLICY "Anyone can update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pixel-images');

CREATE POLICY "Anyone can delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pixel-images');

-- Verify final policies
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- List final policies for pixels table
    RAISE NOTICE 'Final policies for pixels table:';
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pixels'
    LOOP
        RAISE NOTICE 'Policy: %, Type: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.permissive,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- List final policies for storage.objects
    RAISE NOTICE 'Final policies for storage.objects:';
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        RAISE NOTICE 'Policy: %, Type: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.permissive,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;
END $$;