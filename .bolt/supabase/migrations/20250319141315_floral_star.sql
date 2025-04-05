/*
  # Add test pixels to visualize the grid

  1. Changes
    - Add some test pixels with images
    - Use real image URLs
    - Add in different positions to test the grid

  2. Security
    - Maintains existing RLS policies
    - Creates proper references
*/

INSERT INTO pixels (x, y, image_url)
VALUES 
  (100, 100, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=100&q=80'),
  (200, 200, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=100&q=80'),
  (300, 300, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=100&q=80'),
  (400, 400, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=100&q=80'),
  (500, 500, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=100&q=80')
ON CONFLICT (x, y) DO UPDATE 
SET 
  image_url = EXCLUDED.image_url,
  updated_at = now();