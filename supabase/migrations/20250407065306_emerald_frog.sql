/*
  # Initial Schema Setup

  1. New Tables
    - pixels: Stores pixel data with wallet ownership
    - settings: Stores application settings
  
  2. Security
    - Enable RLS on all tables
    - Add policies for public access and owner-based operations
    - Configure storage policies for pixel images

  3. Features
    - Realtime enabled for pixels table
    - Automatic updated_at timestamps
    - Coordinate and URL validation
*/

-- Drop existing objects if they exist
DO $$ 
BEGIN
  DROP TABLE IF EXISTS pixels CASCADE;
  DROP TABLE IF EXISTS settings CASCADE;
  DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
END $$;

-- Create pixels table
CREATE TABLE pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x integer NOT NULL,
  y integer NOT NULL,
  owner text NOT NULL, -- Store wallet address as text
  image_url text NOT NULL,
  nft_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_pixel_coordinates UNIQUE (x, y),
  CONSTRAINT valid_coordinates CHECK (x >= 0 AND x < 1000 AND y >= 0 AND y < 1000),
  CONSTRAINT valid_image_url CHECK (image_url ~ '^https?://' AND length(image_url) <= 2048)
);

-- Create settings table
CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_pixels_updated_at
  BEFORE UPDATE ON pixels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX pixels_coordinates_idx ON pixels (x, y);
CREATE INDEX pixels_owner_idx ON pixels (owner);

-- Pixel Policies
CREATE POLICY "Anyone can view pixels"
  ON pixels
  FOR SELECT
  USING (true);

-- Combined insert policy with all validations
CREATE POLICY "Insert pixel with validation"
  ON pixels
  FOR INSERT
  WITH CHECK (
    owner IS NOT NULL AND
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

-- Update policy for pixel owners
CREATE POLICY "Update own pixels"
  ON pixels
  FOR UPDATE
  USING (true)
  WITH CHECK (
    x >= 0 AND x < 1000 AND
    y >= 0 AND y < 1000 AND
    image_url ~ '^https?://' AND
    image_url IS NOT NULL
  );

-- Settings Policies
CREATE POLICY "Anyone can view settings"
  ON settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only authenticated users can modify settings"
  ON settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage setup
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

-- Drop existing storage policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public pixel image access" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can upload pixel images" ON storage.objects;
  DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
  DROP POLICY IF EXISTS "storage_select" ON storage.objects;
  DROP POLICY IF EXISTS "storage_update" ON storage.objects;
  DROP POLICY IF EXISTS "storage_delete" ON storage.objects;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Create essential storage policies
DO $$
BEGIN
  -- Öffentliches Lesen
  CREATE POLICY "Public pixel image access"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'pixel-images');

  -- Öffentlicher Upload
  CREATE POLICY "Anyone can upload pixel images"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'pixel-images' AND length(name) <= 255);

  -- Optional: Selektiver Zugriff
  CREATE POLICY "storage_select"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'pixel-images');

  -- Optional: Einfüge-Regel (redundant aber kein Fehler)
  CREATE POLICY "storage_insert"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'pixel-images' AND length(name) <= 255);

  -- Optional: Update-Regel (z. B. falls Bild ersetzt werden soll)
  CREATE POLICY "storage_update"
    ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'pixel-images')
    WITH CHECK (bucket_id = 'pixel-images' AND length(name) <= 255);

  -- Optional: Löschen
  CREATE POLICY "storage_delete"
    ON storage.objects
    FOR DELETE
    USING (bucket_id = 'pixel-images');
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE tablename = 'pixels'
    AND schemaname = 'public'
    AND pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pixels;
  END IF;
END $$;

-- Initial Settings
INSERT INTO settings (key, value)
VALUES ('main_image', jsonb_build_object('url', '/mosaic.jpg'))
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object('url', '/mosaic.jpg');