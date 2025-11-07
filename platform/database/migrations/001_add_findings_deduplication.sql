-- Migration: Add deduplication constraint and error/skip tracking
-- This migration adds:
-- 1. Unique constraint on (compliance_check_id, control_id) to prevent duplicates
-- 2. error_controls and skip_controls columns to compliance_checks table

-- Add new columns to compliance_checks (if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'compliance_checks' AND column_name = 'error_controls'
  ) THEN
    ALTER TABLE compliance_checks ADD COLUMN error_controls INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'compliance_checks' AND column_name = 'skip_controls'
  ) THEN
    ALTER TABLE compliance_checks ADD COLUMN skip_controls INTEGER DEFAULT 0;
  END IF;
END $$;

-- Remove duplicate findings before adding unique constraint
-- Keep the most recent finding for each (compliance_check_id, control_id) pair
DELETE FROM findings f1
WHERE f1.id NOT IN (
  SELECT DISTINCT ON (compliance_check_id, control_id) id
  FROM findings f2
  WHERE f2.compliance_check_id = f1.compliance_check_id
    AND f2.control_id = f1.control_id
  ORDER BY compliance_check_id, control_id, created_at DESC
);

-- Add unique constraint (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_findings_unique_control_per_scan'
  ) THEN
    CREATE UNIQUE INDEX idx_findings_unique_control_per_scan 
    ON findings(compliance_check_id, control_id);
  END IF;
END $$;

