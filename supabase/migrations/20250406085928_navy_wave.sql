/*
  # Configure storage policies

  1. Changes
    - Drop existing storage policies
    - Create storage bucket if not exists
    - Create fresh storage policies
    
  2. Security
    - Enable public read access
    - Add validation for uploads
    - Restrict operations to pixel-images bucket
*/

-- Drop existing storage policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "storage_select" ON storage.objects;
    DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
    DROP POLICY IF EXISTS "storage_update" ON storage.objects;
    DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
END $$;

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('pixel-images', 'pixel-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Create storage policies
CREATE POLICY "storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pixel-images');

CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pixel-images' AND
    length(name) <= 255
  );

CREATE POLICY "storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pixel-images')
  WITH CHECK (
    bucket_id = 'pixel-images' AND
    length(name) <= 255
  );

CREATE POLICY "storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pixel-images');