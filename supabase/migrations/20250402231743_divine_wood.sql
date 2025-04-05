/*
  # Verify current policy configuration

  1. Changes
    - Check number of policies on pixels table
    - Check number of storage policies
    - List all active policies
    - Verify RLS status

  2. Security
    - No changes to policies
    - Only verification
*/

DO $$
DECLARE
    policy_count INT;
    storage_policy_count INT;
    r RECORD;
BEGIN
    -- Check pixels table policies
    SELECT COUNT(*)
    INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' 
    AND tablename = 'pixels';

    -- Check storage policies
    SELECT COUNT(*)
    INTO storage_policy_count
    FROM pg_policies
    WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND qual::text LIKE '%pixel-images%';

    -- Log results
    RAISE NOTICE 'Current policy status:';
    RAISE NOTICE '- Pixels table policies: %', policy_count;
    RAISE NOTICE '- Storage policies for pixel-images: %', storage_policy_count;

    -- List all current policies
    RAISE NOTICE 'Detailed policy list:';
    FOR r IN (
        SELECT schemaname, tablename, policyname, cmd
        FROM pg_policies
        WHERE (schemaname = 'public' AND tablename = 'pixels')
        OR (schemaname = 'storage' AND tablename = 'objects' AND qual::text LIKE '%pixel-images%')
        ORDER BY schemaname, tablename, policyname
    ) LOOP
        RAISE NOTICE '% -> %.% (%)', r.cmd, r.schemaname, r.tablename, r.policyname;
    END LOOP;

    -- Verify RLS is enabled
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'pixels'
        AND rowsecurity = true
    ) THEN
        RAISE NOTICE 'Warning: RLS is not enabled on pixels table';
    ELSE
        RAISE NOTICE 'RLS is properly enabled on pixels table';
    END IF;
END $$;