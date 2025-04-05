/*
  # Create pixels table for Trump mosaic

  1. New Tables
    - `pixels`
      - `id` (uuid, primary key)
      - `x` (integer) - X coordinate of pixel
      - `y` (integer) - Y coordinate of pixel
      - `owner` (uuid) - Reference to auth.users
      - `image_url` (text) - URL of uploaded image
      - `nft_url` (text, nullable) - URL of minted NFT
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `pixels` table
    - Add policies for:
      - Anyone can view pixels
      - Only authenticated users can insert pixels
      - Only pixel owners can update their pixels
*/

-- Drop existing table and related objects if they exist
DROP TABLE IF EXISTS pixels CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Create pixels table
CREATE TABLE pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x integer NOT NULL,
  y integer NOT NULL,
  owner uuid REFERENCES auth.users(id),
  image_url text NOT NULL,
  nft_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure x,y coordinates are unique
  CONSTRAINT unique_pixel_coordinates UNIQUE (x, y),
  
  -- Validate coordinate ranges
  CONSTRAINT valid_coordinates CHECK (
    x >= 0 AND x < 1000 AND 
    y >= 0 AND y < 1000
  )
);

-- Enable RLS
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view pixels" ON pixels;
DROP POLICY IF EXISTS "Authenticated users can insert pixels" ON pixels;
DROP POLICY IF EXISTS "Users can update their own pixels" ON pixels;

-- Create policies
CREATE POLICY "Anyone can view pixels"
  ON pixels
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert pixels" 
  ON pixels
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner);

CREATE POLICY "Users can update their own pixels"
  ON pixels
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner)
  WITH CHECK (auth.uid() = owner);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pixels_updated_at
  BEFORE UPDATE ON pixels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX pixels_owner_idx ON pixels(owner);
CREATE INDEX pixels_coordinates_idx ON pixels(x, y);