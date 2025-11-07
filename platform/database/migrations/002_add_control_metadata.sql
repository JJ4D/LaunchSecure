-- Migration: Add persistent control metadata table
-- This stores user notes, assignments, and remediation status that persist across scans
-- Keyed by client_id + control_id (not tied to specific scan)

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

CREATE INDEX idx_control_metadata_client_id ON control_metadata(client_id);
CREATE INDEX idx_control_metadata_control_id ON control_metadata(control_id);
CREATE INDEX idx_control_metadata_remediation_status ON control_metadata(remediation_status);

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

