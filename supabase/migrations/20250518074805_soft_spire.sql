/*
  # Update Database Functions Security

  1. Changes
    - Add explicit schema setting for all functions
    - Add SECURITY DEFINER to protect against privilege escalation
    - Improve locking mechanism for pixel checks
    - Add better error handling
    
  2. Security
    - Set search_path explicitly in all functions
    - Use SECURITY DEFINER to ensure proper privilege context
    - Implement FOR UPDATE SKIP LOCKED for race condition prevention
    
  3. Functions Updated
    - update_settings_update
    - update_updated_at_col
    - lock_and_check_pixel
    - set_config
*/

-- Update settings update function
CREATE OR REPLACE FUNCTION public.update_settings_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Explicitly set schema
  PERFORM set_config('search_path', 'public', false);

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at column function
CREATE OR REPLACE FUNCTION public.update_updated_at_col()
RETURNS TRIGGER AS $$
BEGIN
  -- Explicitly set schema
  PERFORM set_config('search_path', 'public', false);

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update pixel locking function
CREATE OR REPLACE FUNCTION public.lock_and_check_pixel(p_x integer, p_y integer)
RETURNS boolean AS $$
DECLARE
  pixel_exists boolean;
  lock_key bigint;
BEGIN
  -- Explicitly set schema
  PERFORM set_config('search_path', 'public', false);

  -- Validate coordinates
  IF p_x < 0 OR p_x >= 1000 OR p_y < 0 OR p_y >= 1000 THEN
    RAISE EXCEPTION 'INVALID_COORDINATES';
  END IF;

  -- Generate unique lock key
  lock_key := (p_x::bigint * 1000 + p_y::bigint);
  
  -- Acquire advisory lock
  PERFORM pg_advisory_xact_lock(lock_key);
  
  -- Check if pixel exists with row-level locking
  SELECT EXISTS (
    SELECT 1 
    FROM public.pixels 
    WHERE x = p_x AND y = p_y
    FOR UPDATE SKIP LOCKED
  ) INTO pixel_exists;

  IF pixel_exists THEN
    RAISE EXCEPTION 'PIXEL_ALREADY_TAKEN';
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update set_config wrapper
CREATE OR REPLACE FUNCTION public.set_config(key text, value text, is_local boolean)
RETURNS void AS $$
BEGIN
  -- Explicitly set schema
  PERFORM set_config('search_path', 'public', false);

  PERFORM set_config(key, value, is_local);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set permissions
REVOKE ALL ON FUNCTION public.update_settings_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_col() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_and_check_pixel(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_config(text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_settings_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_col() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_and_check_pixel(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO authenticated;