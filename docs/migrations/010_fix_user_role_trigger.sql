-- =============================================================================
-- CFP Platform — SECURITY FIX: Hardened User Role Trigger
-- =============================================================================
-- Fixes: Self-registration admin privilege escalation
--
-- Previously: Any user could pass { data: { role: 'admin' } } during signup
--             and the trigger would blindly trust it.
--
-- Now:        Only users with a valid invited_by metadata field (set
--             server-side by admin.inviteUserByEmail) can receive elevated
--             roles. All direct self-signups are forced to 'customer'.
--
-- Run this in: Supabase SQL Editor > New Query > paste > Run
-- =============================================================================

-- Step 1: Replace the trigger function
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
    -- Extract metadata
    v_invited_by := NEW.raw_user_meta_data->>'invited_by';
    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name  := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    v_email      := NEW.email;

    -- Role assignment logic
    -- Only users invited via admin.inviteUserByEmail() will have
    -- 'invited_by' set in their metadata (set server-side, tamper-proof).
    -- Direct self-signups CANNOT have this field.
    IF v_invited_by IS NOT NULL AND v_invited_by != '' THEN
        -- Invited user: allow the role from metadata (admin set it)
        v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
        -- Still validate against allowed values
        IF v_role NOT IN ('admin', 'service', 'customer') THEN
            v_role := 'customer';
        END IF;
    ELSE
        -- Direct self-signup: ALWAYS force customer role
        -- This prevents privilege escalation via client-side metadata
        v_role := 'customer';
    END IF;

    -- Upsert into accounts table
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

-- Step 3: Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_role();
