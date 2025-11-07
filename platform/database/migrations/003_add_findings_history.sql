-- Migration: Add findings_history table for archiving old scan data
-- This allows us to track compliance progress over time while keeping
-- the findings table clean with only the latest scan results

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

