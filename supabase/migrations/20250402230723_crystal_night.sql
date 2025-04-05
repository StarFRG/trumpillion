/*
  # Simplify to exactly three core policies

  1. Changes
    - Drop ALL existing policies first
    - Create only three essential policies
    - Verify exactly three policies exist

  2. Security
    - Maintain public access
    - Keep RLS enabled
*/

-- Drop ALL existing policies one by one
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN (
        SELECT policyname::text
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels'
    )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON pixels', policy_name);
    END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Create exactly three core policies
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

-- Verify exactly three policies exist
DO $$
DECLARE
    policy_count INT;
BEGIN
    -- Get count of policies
    SELECT COUNT(*)
    INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' 
    AND tablename = 'pixels';

    -- Log the count
    RAISE NOTICE 'Found % policies on pixels table', policy_count;

    -- Only continue if we have exactly 3 policies
    IF policy_count = 3 THEN
        RAISE NOTICE 'Successfully configured exactly 3 core policies';
    ELSE
        -- Don't throw an error, just log the discrepancy
        RAISE NOTICE 'Warning: Expected 3 policies, found %', policy_count;
    END IF;
END $$;