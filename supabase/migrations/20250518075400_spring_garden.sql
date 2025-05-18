/*
  # Fix Function Security Issues

  1. Changes
    - Remove redundant set_config function
    - Add proper schema qualification
    - Set search_path explicitly
    - Update function permissions
    
  2. Security
    - Add SECURITY DEFINER to all functions
    - Set search_path explicitly for each function
    - Remove unnecessary permissions
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS public.update_settings_update() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_col() CASCADE;
DROP FUNCTION IF EXISTS public.lock_and_check_pixel(integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.set_config(text, text, boolean) CASCADE;

-- Create updated functions with proper security
CREATE OR REPLACE FUNCTION public.update_settings_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_col()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_and_check_pixel(p_x integer, p_y integer)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  lock_key bigint;
BEGIN
  -- Validate coordinates
  IF p_x < 0 OR p_x >= 1000 OR p_y < 0 OR p_y >= 1000 THEN
    RAISE EXCEPTION 'INVALID_COORDINATES';
  END IF;

  -- Generate unique lock key
  lock_key := (p_x::bigint * 1000 + p_y::bigint);
  
  -- Acquire advisory lock
  PERFORM pg_advisory_xact_lock(lock_key);
  
  -- Check if pixel exists
  IF EXISTS (
    SELECT 1 
    FROM public.pixels 
    WHERE x = p_x AND y = p_y
  ) THEN
    RAISE EXCEPTION 'PIXEL_ALREADY_TAKEN';
  END IF;

  RETURN true;
END;
$$;

-- Set proper permissions
REVOKE ALL ON FUNCTION public.update_settings_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_col() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_and_check_pixel(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_settings_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_col() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_and_check_pixel(integer, integer) TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION public.update_settings_update() IS 'Trigger function to update settings updated_at timestamp';
COMMENT ON FUNCTION public.update_updated_at_col() IS 'Trigger function to update updated_at timestamp';
COMMENT ON FUNCTION public.lock_and_check_pixel(integer, integer) IS 'Atomic locking and validation for pixel coordinates';