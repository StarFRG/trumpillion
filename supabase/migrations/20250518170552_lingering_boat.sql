/*
  # Update Storage Policies and Validation

  1. Changes
    - Drop existing storage policies
    - Ensure pixel-images bucket exists and is public
    - Create new storage policies with proper header checks
    - Add validation function in public schema
    - Add trigger for request validation
    
  2. Security
    - Validate wallet header presence
    - Enforce proper file naming
    - Restrict operations to bucket owners
*/

-- Drop existing storage policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public read access" ON storage.objects;
  DROP POLICY IF EXISTS "Public image upload" ON storage.objects;
  DROP POLICY IF EXISTS "Owner can update image" ON storage.objects;
  DROP POLICY IF EXISTS "Owner can delete image" ON storage.objects;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Ensure bucket exists and is public
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('pixel-images', 'pixel-images', true)
  ON CONFLICT (id) DO UPDATE
  SET public = true;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Create new storage policies with proper header checks
DO $$
BEGIN
  -- Public read access
  CREATE POLICY "Public read access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'pixel-images');

  -- Public upload with validation
  CREATE POLICY "Public image upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'pixel-images'
      AND length(name) <= 255
      AND name ~ '^pixel_[0-9]+_[0-9]+\.(jpg|jpeg|png|gif)$'
      AND current_setting('request.headers.wallet', true) IS NOT NULL
    );

  -- Owner update with validation
  CREATE POLICY "Owner can update image"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'pixel-images'
      AND owner::text = current_setting('request.headers.wallet', true)
    )
    WITH CHECK (
      bucket_id = 'pixel-images'
      AND length(name) <= 255
      AND name ~ '^pixel_[0-9]+_[0-9]+\.(jpg|jpeg|png|gif)$'
    );

  -- Owner delete
  CREATE POLICY "Owner can delete image"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'pixel-images'
      AND owner::text = current_setting('request.headers.wallet', true)
    );
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Add function to validate headers (in public schema)
CREATE OR REPLACE FUNCTION public.validate_storage_request()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('request.headers.wallet', true) IS NULL THEN
    RAISE EXCEPTION 'Missing wallet header';
  END IF;
  RETURN NEW;
END;
$$;

-- Add trigger to validate headers on insert/update
DO $$
BEGIN
  DROP TRIGGER IF EXISTS validate_storage_request ON storage.objects;
  
  CREATE TRIGGER validate_storage_request
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_storage_request();
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;