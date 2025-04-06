/*
  # Initial Schema Setup

  1. Changes
    - Create pixels table if not exists
    - Create settings table if not exists
    - Enable RLS
    - Add constraints
    
  2. Security
    - Enable RLS on both tables
    - Add validation constraints
*/

-- Create pixels table if not exists
CREATE TABLE IF NOT EXISTS pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  x integer NOT NULL,
  y integer NOT NULL,
  owner uuid,
  image_url text NOT NULL,
  nft_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Add unique constraint for coordinates
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_pixel_coordinates'
    ) THEN
        ALTER TABLE pixels 
        ADD CONSTRAINT unique_pixel_coordinates 
        UNIQUE (x, y);
    END IF;

    -- Add coordinate validation
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'valid_coordinates'
    ) THEN
        ALTER TABLE pixels 
        ADD CONSTRAINT valid_coordinates 
        CHECK (x >= 0 AND x < 1000 AND y >= 0 AND y < 1000);
    END IF;

    -- Add URL validation
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'valid_image_url'
    ) THEN
        ALTER TABLE pixels 
        ADD CONSTRAINT valid_image_url 
        CHECK (image_url ~ '^https?://' AND length(image_url) <= 2048);
    END IF;
END $$;

-- Create settings table if not exists
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;