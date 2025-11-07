-- Combined Migration Script
-- Run this after starting your database container
-- This applies both migrations: deduplication and control metadata

-- ============================================
-- Migration 001: Add deduplication constraint
-- ============================================

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

-- ============================================
-- Migration 002: Add control metadata table
-- ============================================

CREATE TABLE IF NOT EXISTS control_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  control_id VARCHAR(255) NOT NULL,
  
  -- User-managed remediation tracking (persists across scans)
  remediation_status VARCHAR(20) DEFAULT 'open',
  assigned_owner_id UUID REFERENCES client_owners(id),
  notes TEXT,
  status_history JSONB DEFAULT '[]'::jsonb,
  
  -- AI-generated content (can be regenerated per scan but preserved here)
  ai_business_context TEXT,
  ai_remediation_guidance TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one metadata record per control per client
  UNIQUE(client_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_control_metadata_client_id ON control_metadata(client_id);
CREATE INDEX IF NOT EXISTS idx_control_metadata_control_id ON control_metadata(control_id);
CREATE INDEX IF NOT EXISTS idx_control_metadata_remediation_status ON control_metadata(remediation_status);

-- Copy existing notes/assignments from findings to metadata table
-- This preserves user data before we start fresh scans
INSERT INTO control_metadata (client_id, control_id, remediation_status, assigned_owner_id, notes, status_history, ai_business_context, ai_remediation_guidance)
SELECT DISTINCT ON (f.client_id, f.control_id)
  f.client_id,
  f.control_id,
  f.remediation_status,
  f.assigned_owner_id,
  f.notes,
  f.status_history,
  f.ai_business_context,
  f.ai_remediation_guidance
FROM findings f
WHERE f.notes IS NOT NULL 
   OR f.assigned_owner_id IS NOT NULL
   OR f.remediation_status != 'open'
   OR f.ai_business_context IS NOT NULL
   OR f.ai_remediation_guidance IS NOT NULL
ORDER BY f.client_id, f.control_id, f.updated_at DESC
ON CONFLICT (client_id, control_id) DO NOTHING;

-- Add trigger for updated_at if function exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_control_metadata_updated_at ON control_metadata;
    CREATE TRIGGER update_control_metadata_updated_at BEFORE UPDATE ON control_metadata
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- Migration 003: Add findings_history table
-- ============================================

-- Create findings_history table (same structure as findings, plus archived_at)
CREATE TABLE IF NOT EXISTS findings_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_finding_id UUID,  -- Reference to original finding ID
  client_id UUID NOT NULL,
  compliance_check_id UUID NOT NULL,
  
  -- Control Metadata
  control_id VARCHAR(255) NOT NULL,
  control_title VARCHAR(500) NOT NULL,
  control_description TEXT,
  framework VARCHAR(50) NOT NULL,
  domain VARCHAR(100),
  category VARCHAR(100),
  
  -- Scan Results
  scan_status VARCHAR(20) NOT NULL,
  scan_reason TEXT,
  scan_resources JSONB,
  
  -- Remediation Tracking (snapshot at archive time)
  remediation_status VARCHAR(20),
  assigned_owner_id UUID,
  notes TEXT,
  status_history JSONB,
  
  -- AI-Generated Content
  ai_business_context TEXT,
  ai_remediation_guidance TEXT,
  
  -- Original timestamps
  original_created_at TIMESTAMP,
  original_updated_at TIMESTAMP,
  
  -- Archive metadata
  archived_at TIMESTAMP DEFAULT NOW(),
  archived_by_scan_id UUID  -- The compliance_check_id that triggered the archive
);

CREATE INDEX IF NOT EXISTS idx_findings_history_client_id ON findings_history(client_id);
CREATE INDEX IF NOT EXISTS idx_findings_history_compliance_check_id ON findings_history(compliance_check_id);
CREATE INDEX IF NOT EXISTS idx_findings_history_framework ON findings_history(framework);
CREATE INDEX IF NOT EXISTS idx_findings_history_archived_at ON findings_history(archived_at);
CREATE INDEX IF NOT EXISTS idx_findings_history_control_id ON findings_history(control_id);

