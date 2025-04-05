/*
  # Enable realtime for pixels table

  1. Changes
    - Create supabase_realtime publication if it doesn't exist
    - Add pixels table to the publication
    - Verify configuration

  2. Security
    - No changes to existing security policies
    - Maintains RLS settings
*/

-- Enable realtime for pixels table
DO $$
BEGIN
    -- Check if publication exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        -- Create publication if it doesn't exist
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Check if table is in publication
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE tablename = 'pixels'
        AND schemaname = 'public'
        AND pubname = 'supabase_realtime'
    ) THEN
        -- Add table to publication if not already present
        ALTER PUBLICATION supabase_realtime ADD TABLE pixels;
    END IF;

    -- Verify configuration
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE tablename = 'pixels'
        AND schemaname = 'public'
        AND pubname = 'supabase_realtime'
    ) THEN
        RAISE EXCEPTION 'Failed to enable realtime for pixels table';
    END IF;

    RAISE NOTICE 'Successfully enabled realtime for pixels table';
END $$;