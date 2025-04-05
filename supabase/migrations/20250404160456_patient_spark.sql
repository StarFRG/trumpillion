-- Drop existing policies first
DROP POLICY IF EXISTS "Public pixel access" ON pixels;
DROP POLICY IF EXISTS "Pixel insert validation" ON pixels;
DROP POLICY IF EXISTS "Pixel update validation" ON pixels;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;

-- Enable RLS
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create pixel policies
CREATE POLICY "Public pixel access"
  ON pixels
  FOR SELECT
  USING (true);

CREATE POLICY "Pixel insert validation"
  ON pixels
  FOR INSERT
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

CREATE POLICY "Pixel update validation"
  ON pixels
  FOR UPDATE
  USING (true)
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

-- Configure storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('pixel-images', 'pixel-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

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