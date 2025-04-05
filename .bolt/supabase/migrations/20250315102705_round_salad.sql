/*
  # Testdaten für Pixel-Grid hinzufügen

  1. Änderungen
    - Prüft auf existierende Testbenutzer
    - Erstellt nur fehlende Testbenutzer
    - Fügt Testpixel mit den Benutzern hinzu
    - Verwendet Unsplash-Bilder als Beispiele

  2. Sicherheit
    - Benutzer werden nur erstellt, wenn sie nicht existieren
    - Alle Pixel sind öffentlich sichtbar
*/

DO $$
DECLARE
    user1_id uuid;
    user2_id uuid;
    user3_id uuid;
    user4_id uuid;
    user5_id uuid;
BEGIN
    -- Prüfe und hole existierende Benutzer oder erstelle neue
    SELECT id INTO user1_id FROM auth.users WHERE email = 'test1@example.com';
    IF user1_id IS NULL THEN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test1@example.com', 'test', now(), now(), now())
        RETURNING id INTO user1_id;
    END IF;

    SELECT id INTO user2_id FROM auth.users WHERE email = 'test2@example.com';
    IF user2_id IS NULL THEN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test2@example.com', 'test', now(), now(), now())
        RETURNING id INTO user2_id;
    END IF;

    SELECT id INTO user3_id FROM auth.users WHERE email = 'test3@example.com';
    IF user3_id IS NULL THEN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test3@example.com', 'test', now(), now(), now())
        RETURNING id INTO user3_id;
    END IF;

    SELECT id INTO user4_id FROM auth.users WHERE email = 'test4@example.com';
    IF user4_id IS NULL THEN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test4@example.com', 'test', now(), now(), now())
        RETURNING id INTO user4_id;
    END IF;

    SELECT id INTO user5_id FROM auth.users WHERE email = 'test5@example.com';
    IF user5_id IS NULL THEN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test5@example.com', 'test', now(), now(), now())
        RETURNING id INTO user5_id;
    END IF;

    -- Füge Testpixel mit den korrekten Benutzer-IDs ein
    INSERT INTO public.pixels (x, y, image_url, owner)
    VALUES 
        -- Zentrum
        (500, 500, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=500&q=80', user1_id),
        
        -- Oben links
        (100, 100, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=500&q=80', user2_id),
        
        -- Oben rechts
        (900, 100, 'https://images.unsplash.com/photo-1682687221080-5cb261c645cb?w=500&q=80', user3_id),
        
        -- Unten links
        (100, 900, 'https://images.unsplash.com/photo-1682687221038-404670f05144?w=500&q=80', user4_id),
        
        -- Unten rechts
        (900, 900, 'https://images.unsplash.com/photo-1682687220742-aba19a74b2d6?w=500&q=80', user5_id)
    ON CONFLICT (x, y) DO UPDATE 
    SET 
        image_url = EXCLUDED.image_url,
        owner = EXCLUDED.owner,
        updated_at = now();
END $$;