/*
  # Update main image URL to Unsplash Trump image

  1. Changes
    - Updates the main image URL in settings table to use an Unsplash image
    - Ensures high-quality image suitable for the mosaic background

  2. Security
    - Maintains existing RLS policies
    - No structural changes
*/

UPDATE settings 
SET value = '{"url": "https://images.unsplash.com/photo-1580128660010-fd027e1e587a?auto=format&fit=crop&w=1000&h=1000&q=80"}'::jsonb
WHERE key = 'main_image';