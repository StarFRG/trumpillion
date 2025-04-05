/*
  # Remove all test pixels from database

  1. Changes
    - Removes all existing test pixels from the pixels table
    - Ensures clean state for production
    - Maintains table structure and policies

  2. Security
    - Maintains existing RLS policies
    - No structural changes to the database
*/

-- Remove all existing pixels
TRUNCATE TABLE public.pixels;

-- Reset the settings table main image to default
UPDATE settings 
SET value = '{"url": "/mosaic.jpg"}'::jsonb
WHERE key = 'main_image';