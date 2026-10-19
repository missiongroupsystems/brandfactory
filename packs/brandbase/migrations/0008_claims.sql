-- The caller and a guest's capability come from the core's claims table (core migration 0007),
-- not from settings, which a statement could change where the database lets it: Supabase.
CREATE OR REPLACE FUNCTION brandbase.caller() RETURNS text
  LANGUAGE sql STABLE
  RETURN claims.user_id();

CREATE OR REPLACE FUNCTION brandbase.capability() RETURNS text
  LANGUAGE sql STABLE
  RETURN claims.capability();
