/*
  # Add settings table for main image configuration

  1. New Tables
    - `settings`
      - `id` (uuid, primary key)
      - `key` (text, unique) - Setting identifier
      - `value` (jsonb) - Setting value
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on settings table
    - Add policies for:
      - Anyone can view settings
      - Only authenticated users can modify settings
*/

CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view settings"
  ON settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only authenticated users can modify settings"
  ON settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_updated_at();

-- Insert default main image setting
INSERT INTO settings (key, value)
VALUES ('main_image', '{"url": "/trump.jpg"}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;