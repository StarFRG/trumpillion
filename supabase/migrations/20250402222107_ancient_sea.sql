/*
  # Update RLS policies for public access

  1. Changes
    - Drop existing auth-based policies
    - Create new public access policies
    - Configure storage bucket and policies

  2. Security
    - Enable public access as needed
    - Maintain data integrity
*/

-- First check and drop existing policies if they exist
DO $$
BEGIN
    -- Drop pixel policies if they exist
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels' 
        AND policyname = 'Anyone can view pixels'
    ) THEN
        DROP POLICY "Anyone can view pixels" ON pixels;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels' 
        AND policyname = 'Anyone can insert pixels'
    ) THEN
        DROP POLICY "Anyone can insert pixels" ON pixels;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels' 
        AND policyname = 'Anyone can update pixels'
    ) THEN
        DROP POLICY "Anyone can update pixels" ON pixels;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels' 
        AND policyname = 'Authenticated users can insert pixels'
    ) THEN
        DROP POLICY "Authenticated users can insert pixels" ON pixels;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'pixels' 
        AND policyname = 'Users can update their own pixels'
    ) THEN
        DROP POLICY "Users can update their own pixels" ON pixels;
    END IF;
END $$;

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
  ON CONFLICT (id) DO UPDATE
  SET public = true;
END $$;

-- Check and drop existing storage policies
DO $$
BEGIN
    -- Drop storage policies if they exist
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Public Access'
    ) THEN
        DROP POLICY "Public Access" ON storage.objects;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Anyone can upload'
    ) THEN
        DROP POLICY "Anyone can upload" ON storage.objects;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Anyone can update'
    ) THEN
        DROP POLICY "Anyone can update" ON storage.objects;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Anyone can delete'
    ) THEN
        DROP POLICY "Anyone can delete" ON storage.objects;
    END IF;
END $$;

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