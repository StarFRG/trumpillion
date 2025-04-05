/*
  # Remove test images from pixels table

  1. Changes
    - Removes all test data from the pixels table
    - Keeps table structure and policies intact
    - Ensures data integrity

  2. Security
    - Maintains existing RLS policies
    - No structural changes to the database
*/

-- Remove all test data from pixels table
TRUNCATE TABLE public.pixels;