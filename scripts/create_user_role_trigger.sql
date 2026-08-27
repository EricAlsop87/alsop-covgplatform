-- =============================================================================
-- CFP Platform — User Role Propagation Trigger
-- =============================================================================
-- Purpose:
--   When a user accepts an invite and their auth.users record is created/confirmed,
--   this trigger copies role + name from auth metadata → accounts table.
--
-- How invite metadata flows:
--   1. Admin calls POST /api/admin/invite
--   2. Supabase inviteUserByEmail() stores { role, first_name, last_name, invited_by }
--      in auth.users.raw_user_meta_data
--   3. On INSERT to auth.users (invite accepted), this trigger fires
--   4. It upserts the accounts row with the correct role
--
-- Run this in Supabase SQL editor or as a migration.
-- =============================================================================

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role        TEXT;
    v_first_name  TEXT;
    v_last_name   TEXT;
    v_email       TEXT;
    v_invited_by  TEXT;
BEGIN
    -- Extract values from auth metadata
    v_invited_by := NEW.raw_user_meta_data->>'invited_by';
    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name  := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    v_email      := NEW.email;

    -- ─── Hardened role assignment ─────────────────────────────────────
    -- Only users invited via admin.inviteUserByEmail() have 'invited_by'
    -- set server-side in their metadata (tamper-proof).
    -- Direct self-signups CANNOT have this field, so they are forced to
    -- 'customer' regardless of what they pass in metadata.
    IF v_invited_by IS NOT NULL AND v_invited_by != '' THEN
        -- Invited user: trust the admin-assigned role
        v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
        IF v_role NOT IN ('admin', 'service', 'customer') THEN
            v_role := 'customer';
        END IF;
    ELSE
        -- Direct self-signup: ALWAYS force customer role
        v_role := 'customer';
    END IF;

    -- Upsert into accounts table
    -- If the user already has a partial record (e.g. from CSV import), update it
    -- If not, insert a new one
    INSERT INTO public.accounts (
        id,
        email,
        role,
        first_name,
        last_name,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_email,
        v_role,
        v_first_name,
        v_last_name,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        role       = EXCLUDED.role,
        first_name = CASE WHEN EXCLUDED.first_name != '' THEN EXCLUDED.first_name ELSE accounts.first_name END,
        last_name  = CASE WHEN EXCLUDED.last_name != '' THEN EXCLUDED.last_name ELSE accounts.last_name END,
        email      = COALESCE(EXCLUDED.email, accounts.email),
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- Step 2: Drop existing trigger if it exists (safe to re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 3: Create the trigger — fires on INSERT to auth.users
--         This fires when:
--         - A user accepts an invite (new auth.users row created)
--         - A user signs up directly
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_role();

-- =============================================================================
-- Verification query (run after applying trigger):
-- =============================================================================
-- Check existing users without a matching accounts row:
-- SELECT au.id, au.email, au.raw_user_meta_data->>'role' as meta_role
-- FROM auth.users au
-- LEFT JOIN public.accounts a ON a.id = au.id
-- WHERE a.id IS NULL;
--
-- Backfill existing users who are already in auth.users but missing from accounts:
-- INSERT INTO public.accounts (id, email, role, first_name, last_name, created_at, updated_at)
-- SELECT
--     au.id,
--     au.email,
--     COALESCE(au.raw_user_meta_data->>'role', 'customer') AS role,
--     COALESCE(au.raw_user_meta_data->>'first_name', '') AS first_name,
--     COALESCE(au.raw_user_meta_data->>'last_name', '') AS last_name,
--     NOW(), NOW()
-- FROM auth.users au
-- LEFT JOIN public.accounts a ON a.id = au.id
-- WHERE a.id IS NULL
-- ON CONFLICT (id) DO NOTHING;
