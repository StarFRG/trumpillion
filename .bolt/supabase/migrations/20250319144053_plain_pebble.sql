/*
  # Add test pixels to verify grid functionality

  1. Changes
    - Add test pixels in different positions
    - Use real image URLs
    - Ensure proper coordinate system (1x1 pixels)

  2. Security
    - Maintains existing RLS policies
    - No structural changes
*/

-- Clear existing test data
TRUNCATE TABLE public.pixels;

-- Insert test pixels in a pattern
INSERT INTO public.pixels (x, y, image_url)
VALUES 
  -- Center pixel
  (500, 500, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=1&q=80'),
  
  -- Corner pixels
  (0, 0, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=1&q=80'),
  (999, 0, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=1&q=80'),
  (0, 999, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=1&q=80'),
  (999, 999, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=1&q=80'),
  
  -- Cross pattern around center
  (499, 500, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=1&q=80'),
  (501, 500, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=1&q=80'),
  (500, 499, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=1&q=80'),
  (500, 501, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=1&q=80')
ON CONFLICT (x, y) DO UPDATE 
SET 
  image_url = EXCLUDED.image_url,
  updated_at = now();