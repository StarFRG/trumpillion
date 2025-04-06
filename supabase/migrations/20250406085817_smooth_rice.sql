/*
  # Set Main Image

  1. Changes
    - Set default main image in settings table
    
  2. Security
    - No security changes
*/

-- Set main image
INSERT INTO settings (key, value)
VALUES ('main_image', jsonb_build_object('url', '/mosaic.jpg'))
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object('url', '/mosaic.jpg');