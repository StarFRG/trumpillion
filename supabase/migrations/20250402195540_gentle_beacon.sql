/*
  # Update RLS policies for wallet-based authentication

  1. Changes
    - Remove existing auth.uid() based policies
    - Add new policies that work with public access
    - Configure storage bucket and policies

  2. Security
    - Maintains public read access
    - Allows public writes (controlled by application logic)
    - Sets up storage policies for pixel images
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
DROP POLICY IF EXISTS "Authenticated users can insert pixels" ON pixels;
DROP POLICY IF EXISTS "Users can update their own pixels" ON pixels;

-- Create new policies for pixels table
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

-- Create storage bucket if it doesn't exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('pixel-images', 'pixel-images', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;

-- Create storage policies
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