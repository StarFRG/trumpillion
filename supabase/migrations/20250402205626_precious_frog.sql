/*
  # Update auth policies for public access

  1. Changes
    - Verify and update auth policies for pixels table
    - Configure storage policies for public access
    - Add explicit auth handling

  2. Security
    - Allow public access as needed
    - Maintain data integrity
*/

-- First verify existing policies
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- List current policies
    RAISE NOTICE 'Current policies:';
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
    LOOP
        RAISE NOTICE 'Schema: %, Table: %, Policy: %',
            policy_record.schemaname,
            policy_record.tablename,
            policy_record.policyname;
    END LOOP;
END $$;

-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
DROP POLICY IF EXISTS "Anyone can insert pixels" ON pixels;
DROP POLICY IF EXISTS "Anyone can update pixels" ON pixels;

-- Create updated policies for pixels table
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

-- Verify storage bucket exists and is public
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('pixel-images', 'pixel-images', true)
    ON CONFLICT (id) DO UPDATE
    SET public = true;
END $$;

-- Update storage policies
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;

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

-- Final verification
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    RAISE NOTICE 'Verifying final policy configuration:';
    
    -- Check pixels table policies
    FOR policy_record IN
        SELECT policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' 
        AND tablename = 'pixels'
        ORDER BY policyname
    LOOP
        RAISE NOTICE 'Pixels Policy: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- Check storage policies
    FOR policy_record IN
        SELECT policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'storage' 
        AND tablename = 'objects'
        ORDER BY policyname
    LOOP
        RAISE NOTICE 'Storage Policy: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- Verify RLS is enabled
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'pixels'
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on pixels table';
    END IF;

    -- Verify storage bucket
    IF NOT EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'pixel-images'
        AND public = true
    ) THEN
        RAISE EXCEPTION 'pixel-images bucket not found or not public';
    END IF;
END $$;