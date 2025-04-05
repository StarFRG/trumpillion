-- Remove all existing pixels
TRUNCATE TABLE public.pixels;

-- Reset the settings table main image to default
UPDATE settings 
SET value = '{"url": "/mosaic.jpg"}'::jsonb
WHERE key = 'main_image';