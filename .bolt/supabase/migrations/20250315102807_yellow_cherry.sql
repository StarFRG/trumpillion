/*
  # Testdaten aus der Pixel-Tabelle entfernen

  1. Änderungen
    - Löscht alle Testpixel aus der pixels-Tabelle
    - Behält die Tabellenstruktur und Policies bei
    - Sichert die Datenintegrität

  2. Sicherheit
    - Verwendet sichere DELETE-Operation mit spezifischen Koordinaten
    - Behält RLS-Policies bei
*/

DELETE FROM public.pixels 
WHERE (x, y) IN (
    (500, 500),
    (100, 100),
    (900, 100),
    (100, 900),
    (900, 900)
);