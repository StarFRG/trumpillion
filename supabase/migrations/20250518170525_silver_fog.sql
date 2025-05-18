/*
  # Storage Policies Update

  1. Changes
    - Fix UUID comparison in policies
    - Add proper header validation
    - Update bucket configuration
    
  2. Security
    - Validate wallet header presence
    - Ensure proper type casting for UUID comparisons
    - Add trigger for request validation
*/

-- Drop existing storage policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public read access" ON storage.objects;
  DROP POLICY IF EXISTS "Public image upload" ON storage.objects;
  DROP POLICY IF EXISTS "Owner can update image" ON storage.objects;
  DROP POLICY IF EXISTS "Owner can delete image" ON storage.objects;
END $$;

-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('pixel-images', 'pixel-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Create new storage policies with proper header checks
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'pixel-images');

CREATE POLICY "Public image upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pixel-images'
  AND length(name) <= 255
  AND name ~ '^pixel_[0-9]+_[0-9]+\.(jpg|jpeg|png|gif)$'
  AND current_setting('request.headers.wallet', true) IS NOT NULL
);

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

CREATE POLICY "Owner can delete image"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'pixel-images'
  AND owner::text = current_setting('request.headers.wallet', true)
);

-- Add function to validate headers
CREATE OR REPLACE FUNCTION storage.validate_request()
RETURNS trigger AS $$
BEGIN
  IF current_setting('request.headers.wallet', true) IS NULL THEN
    RAISE EXCEPTION 'Missing wallet header';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to validate headers on insert/update
DROP TRIGGER IF EXISTS validate_storage_request ON storage.objects;
CREATE TRIGGER validate_storage_request
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION storage.validate_request();