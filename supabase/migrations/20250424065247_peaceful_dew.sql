/*
  # Add Pixel Locking Function

  1. New Functions
    - `lock_and_check_pixel`: Provides atomic locking and validation for pixel coordinates
      - Parameters:
        - p_x: integer (x coordinate)
        - p_y: integer (y coordinate)
      - Returns: boolean
      - Throws exceptions for invalid cases
      
  2. Security
    - Function runs with SECURITY DEFINER
    - Only authenticated users can execute
    
  3. Features
    - Validates coordinate bounds (0-999)
    - Uses advisory locks for race condition prevention
    - Checks pixel availability
    - Provides clear error messages
*/

-- Create the locking function
CREATE OR REPLACE FUNCTION public.lock_and_check_pixel(p_x integer, p_y integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  lock_key bigint;
BEGIN
  -- Validate coordinates
  IF p_x < 0 OR p_x >= 1000 OR p_y < 0 OR p_y >= 1000 THEN
    RAISE EXCEPTION 'INVALID_COORDINATES';
  END IF;

  -- Generate a unique lock key using the coordinates
  lock_key := (p_x::bigint * 1000 + p_y::bigint);
  
  -- Acquire advisory lock
  PERFORM pg_advisory_xact_lock(lock_key);
  
  -- Check if pixel already exists
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

-- Set permissions
REVOKE ALL ON FUNCTION public.lock_and_check_pixel(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_and_check_pixel(integer, integer) TO authenticated;

-- Add documentation
COMMENT ON FUNCTION public.lock_and_check_pixel(integer, integer) 
IS 'Provides atomic locking and validation for pixel coordinates during minting. Returns true if pixel is available, throws exception otherwise.';