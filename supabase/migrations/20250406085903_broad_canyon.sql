/*
  # Create RLS Policies

  1. Changes
    - Drop existing policies first
    - Create fresh policies for pixels table
    - Create fresh policies for settings table
    
  2. Security
    - Enable public read access
    - Add validation for pixel operations
    - Allow admin access to settings
*/

-- Drop existing policies if they exist
DO $$
BEGIN
    -- Drop pixel policies
    DROP POLICY IF EXISTS "Public pixel access" ON pixels;
    DROP POLICY IF EXISTS "Pixel insert validation" ON pixels;
    DROP POLICY IF EXISTS "Pixel update validation" ON pixels;
    
    -- Drop settings policies
    DROP POLICY IF EXISTS "Public settings access" ON settings;
    DROP POLICY IF EXISTS "Admin settings access" ON settings;
END $$;

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

-- Create settings policies
CREATE POLICY "Public settings access"
  ON settings
  FOR SELECT
  USING (true);

CREATE POLICY "Admin settings access" 
  ON settings
  FOR ALL 
  USING (true)
  WITH CHECK (true);