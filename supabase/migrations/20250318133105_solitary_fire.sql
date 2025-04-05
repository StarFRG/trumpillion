/*
  # Add test data for pixel grid

  1. Changes
    - Create test users in auth.users
    - Add test pixels with valid user references
    - Use real image URLs for visualization

  2. Security
    - Maintains existing RLS policies
    - Creates proper user references
*/

DO $$
DECLARE
    test_user_id uuid;
BEGIN
    -- Create a test user if it doesn't exist
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'test@example.com',
        '$2a$10$Q7PJZT2yFk6S.v6HHpHCzeRwUHcZnH5pQHEt1DY9XN7r3VkzCKX6O', -- 'password123'
        now(),
        now(),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        now(),
        now(),
        '',
        '',
        '',
        ''
    )
    RETURNING id INTO test_user_id;

    -- Add test pixels with the created user
    INSERT INTO public.pixels (x, y, image_url, owner)
    VALUES 
        (100, 100, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=100&q=80', test_user_id),
        (200, 200, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=100&q=80', test_user_id),
        (300, 300, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=100&q=80', test_user_id)
    ON CONFLICT (x, y) DO UPDATE 
    SET 
        image_url = EXCLUDED.image_url,
        owner = EXCLUDED.owner,
        updated_at = now();
END $$;