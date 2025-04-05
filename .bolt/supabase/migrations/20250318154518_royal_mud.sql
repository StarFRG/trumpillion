/*
  # Update main image URL in settings table

  1. Changes
    - Updates the main image URL in settings table
    - Uses the new image from guengoer.ch

  2. Security
    - Maintains existing RLS policies
    - No structural changes
*/

UPDATE settings 
SET value = '{"url": "https://guengoer.ch/mosaic.jpg"}'::jsonb
WHERE key = 'main_image';