/*
  # Clean up old auth.uid() policies and ensure public access

  1. Changes
    - Drop all existing auth.uid() based policies
    - Recreate only the public access policies
    - Verify final policy configuration

  2. Security
    - Remove authentication requirements
    - Enable public access for all operations
    - Maintain RLS enabled status
*/

-- First drop ALL existing policies to ensure clean state
DO $$
BEGIN
    -- Drop all policies that might contain auth.uid()
    DROP POLICY IF EXISTS "Authenticated users can insert pixels" ON pixels;
    DROP POLICY IF EXISTS "Users can update their own pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can insert pixels" ON pixels;
    DROP POLICY IF EXISTS "Anyone can update pixels" ON pixels;
END $$;

-- Create fresh policies without auth.uid()
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
    
    -- Check for any remaining auth.uid() policies
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'pixels'
        AND qual::text LIKE '%auth.uid%'
    ) THEN
        RAISE EXCEPTION 'Found remaining auth.uid() policies';
    END IF;

    -- List all current policies
    FOR policy_record IN
        SELECT schemaname, tablename, policyname, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname IN ('public', 'storage')
        ORDER BY schemaname, tablename, policyname
    LOOP
        RAISE NOTICE 'Policy: %.%.% (%), USING: %, WITH CHECK: %',
            policy_record.schemaname,
            policy_record.tablename,
            policy_record.policyname,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- Verify RLS is still enabled
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'pixels'
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on pixels table';
    END IF;

    -- Verify storage bucket configuration
    IF NOT EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'pixel-images'
        AND public = true
    ) THEN
        RAISE EXCEPTION 'pixel-images bucket not found or not public';
    END IF;

    RAISE NOTICE 'Policy verification complete - all auth.uid() policies removed';
END $$;