-- Stelle sicher, dass das Hauptbild korrekt gesetzt ist
UPDATE settings 
SET value = jsonb_build_object('url', '/mosaic.jpg')
WHERE key = 'main_image';

-- Füge das Hauptbild ein, falls es noch nicht existiert
INSERT INTO settings (key, value)
VALUES ('main_image', jsonb_build_object('url', '/mosaic.jpg'))
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object('url', '/mosaic.jpg');