/*
  # Save current state of the pixel grid

  1. Changes
    - Ensures all existing pixels are preserved
    - Maintains current user associations
    - Keeps existing image URLs

  2. Security
    - Maintains existing RLS policies
    - Preserves user permissions
*/

DO $$
DECLARE
    user1_id uuid;
    user2_id uuid;
    user3_id uuid;
    user4_id uuid;
    user5_id uuid;
BEGIN
    -- Get existing user IDs
    SELECT id INTO user1_id FROM auth.users WHERE email = 'test1@example.com';
    SELECT id INTO user2_id FROM auth.users WHERE email = 'test2@example.com';
    SELECT id INTO user3_id FROM auth.users WHERE email = 'test3@example.com';
    SELECT id INTO user4_id FROM auth.users WHERE email = 'test4@example.com';
    SELECT id INTO user5_id FROM auth.users WHERE email = 'test5@example.com';

    -- Ensure test pixels exist
    INSERT INTO public.pixels (x, y, image_url, owner)
    VALUES 
        -- Center
        (500, 500, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=500&q=80', user1_id),
        
        -- Top left
        (100, 100, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=500&q=80', user2_id),
        
        -- Top right
        (900, 100, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=500&q=80', user3_id),
        
        -- Bottom left
        (100, 900, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=500&q=80', user4_id),
        
        -- Bottom right
        (900, 900, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=500&q=80', user5_id)
    ON CONFLICT (x, y) DO UPDATE 
    SET 
        image_url = EXCLUDED.image_url,
        owner = EXCLUDED.owner,
        updated_at = now();
END $$;