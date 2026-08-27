-- =========================================================
-- DB Migration: Severity Values → Priority Values (3-tier)
-- Run this in Supabase SQL Editor (one-time migration)
-- =========================================================

-- 1. Update existing policy_flags records
UPDATE policy_flags SET severity = 'high'   WHERE severity = 'critical';
-- 'high' stays as 'high' — no change needed
UPDATE policy_flags SET severity = 'medium' WHERE severity = 'warning';
UPDATE policy_flags SET severity = 'low'    WHERE severity = 'info';

-- 2. Update flag_definitions records 
UPDATE flag_definitions SET default_severity = 'high'   WHERE default_severity = 'critical';
UPDATE flag_definitions SET default_severity = 'medium' WHERE default_severity = 'warning';
UPDATE flag_definitions SET default_severity = 'low'    WHERE default_severity = 'info';

-- 3. Verify the migration
SELECT severity, COUNT(*) FROM policy_flags GROUP BY severity ORDER BY severity;
SELECT default_severity, COUNT(*) FROM flag_definitions GROUP BY default_severity ORDER BY default_severity;
