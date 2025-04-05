/*
  # Final policy verification

  1. Changes
    - Verify all policies are correctly set
    - Ensure no duplicate policies exist
    - Confirm bucket configuration

  2. Security
    - Verify RLS is enabled
    - Confirm policy permissions
*/

-- Verify RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'pixels'
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on pixels table';
    END IF;
END $$;

-- List and verify all current policies
DO $$
DECLARE
    policy_record RECORD;
    pixel_policy_count INT := 0;
    storage_policy_count INT := 0;
BEGIN
    -- Check pixels policies
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pixels'
        ORDER BY policyname
    LOOP
        pixel_policy_count := pixel_policy_count + 1;
        RAISE NOTICE 'Pixel Policy: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- Check storage policies
    FOR policy_record IN
        SELECT policyname, permissive, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        ORDER BY policyname
    LOOP
        storage_policy_count := storage_policy_count + 1;
        RAISE NOTICE 'Storage Policy: %, Command: %, USING: %, WITH CHECK: %',
            policy_record.policyname,
            policy_record.cmd,
            policy_record.qual,
            policy_record.with_check;
    END LOOP;

    -- Verify policy counts
    IF pixel_policy_count != 3 THEN
        RAISE EXCEPTION 'Expected 3 pixel policies, found %', pixel_policy_count;
    END IF;

    IF storage_policy_count != 4 THEN
        RAISE EXCEPTION 'Expected 4 storage policies, found %', storage_policy_count;
    END IF;

    -- Verify storage bucket
    IF NOT EXISTS (
        SELECT 1
        FROM storage.buckets
        WHERE id = 'pixel-images' AND public = true
    ) THEN
        RAISE EXCEPTION 'pixel-images bucket not found or not public';
    END IF;

    RAISE NOTICE 'All policies and configurations verified successfully';
END $$;