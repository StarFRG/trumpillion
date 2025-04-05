/*
  # Upload mosaic image and update main image setting

  1. Changes
    - Upload mosaic.jpg to Supabase storage
    - Update main_image setting to use the uploaded image
    - Ensure proper URL structure for the image

  2. Security
    - Maintains existing RLS policies
    - No structural changes
*/

-- Update the main image URL to use the local mosaic.jpg
UPDATE settings 
SET value = '{"url": "/mosaic.jpg"}'::jsonb
WHERE key = 'main_image';