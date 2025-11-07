-- LaunchSecure MVP Database Schema
-- Based on PRODUCT_SPECIFICATION.md

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CLIENT MANAGEMENT (Required for Steampipe)
-- ============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name VARCHAR(255) NOT NULL,
  business_description TEXT,
  industry VARCHAR(100),
  employee_count_range VARCHAR(50),
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  assigned_frameworks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_clients_status ON clients(status);

-- Credentials: Cloud API credentials for Steampipe
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  encrypted_credentials JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  region VARCHAR(100),
  account_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credentials_client_id ON credentials(client_id);
CREATE INDEX idx_credentials_provider ON credentials(provider);

-- ============================================
-- SCAN EXECUTION (Powerpipe Results)
-- ============================================

CREATE TABLE compliance_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  frameworks JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress',
  total_controls INTEGER DEFAULT 0,
  passed_controls INTEGER DEFAULT 0,
  failed_controls INTEGER DEFAULT 0,
  error_controls INTEGER DEFAULT 0,
  skip_controls INTEGER DEFAULT 0,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  powerpipe_output JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_compliance_checks_client_id ON compliance_checks(client_id);
CREATE INDEX idx_compliance_checks_status ON compliance_checks(status);

-- Findings: Individual control results from Powerpipe
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  
  -- Control Metadata (from Powerpipe output)
  control_id VARCHAR(255) NOT NULL,
  control_title VARCHAR(500) NOT NULL,
  control_description TEXT,
  framework VARCHAR(50) NOT NULL,
  domain VARCHAR(100),
  category VARCHAR(100),
  
  -- Scan Results (from Powerpipe)
  scan_status VARCHAR(20) NOT NULL,
  scan_reason TEXT,
  scan_resources JSONB,
  
  -- Remediation Tracking (UI/User managed)
  remediation_status VARCHAR(20) DEFAULT 'open',
  assigned_owner_id UUID REFERENCES client_owners(id),
  notes TEXT,
  status_history JSONB DEFAULT '[]'::jsonb,
  
  -- AI-Generated Content (enhances Powerpipe output)
  ai_business_context TEXT,
  ai_remediation_guidance TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_findings_client_id ON findings(client_id);
CREATE INDEX idx_findings_compliance_check_id ON findings(compliance_check_id);
CREATE INDEX idx_findings_framework ON findings(framework);
CREATE INDEX idx_findings_scan_status ON findings(scan_status);
CREATE INDEX idx_findings_remediation_status ON findings(remediation_status);
CREATE INDEX idx_findings_control_id ON findings(control_id);

-- Unique constraint to prevent duplicate findings for the same control in the same scan
CREATE UNIQUE INDEX idx_findings_unique_control_per_scan ON findings(compliance_check_id, control_id);

-- Findings History: Archive table for old scan data (for compliance progress tracking)
CREATE TABLE findings_history (
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

CREATE INDEX idx_findings_history_client_id ON findings_history(client_id);
CREATE INDEX idx_findings_history_compliance_check_id ON findings_history(compliance_check_id);
CREATE INDEX idx_findings_history_framework ON findings_history(framework);
CREATE INDEX idx_findings_history_archived_at ON findings_history(archived_at);
CREATE INDEX idx_findings_history_control_id ON findings_history(control_id);

-- ============================================
-- USER MANAGEMENT
-- ============================================

-- Client Owners: Stakeholders assigned to findings
CREATE TABLE client_owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_client_owners_client_id ON client_owners(client_id);

-- Client Users: Authentication for client portal
CREATE TABLE client_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,  -- NULL for super_admin
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'client_user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_client_users_email ON client_users(email);
CREATE INDEX idx_client_users_client_id ON client_users(client_id);

-- ============================================
-- SUPPORTING DATA
-- ============================================

-- Questionnaire Responses: For AI context generation
CREATE TABLE questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  questionnaire_type VARCHAR(50),
  responses JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_questionnaire_responses_client_id ON questionnaire_responses(client_id);

-- Reports: Generated compliance reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_type VARCHAR(50),
  file_path VARCHAR(500),
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reports_client_id ON reports(client_id);

-- Control Metadata: Persistent user data that survives across scans
CREATE TABLE control_metadata (
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

CREATE TRIGGER update_control_metadata_updated_at BEFORE UPDATE ON control_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_checks_updated_at BEFORE UPDATE ON compliance_checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_findings_updated_at BEFORE UPDATE ON findings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_owners_updated_at BEFORE UPDATE ON client_owners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_users_updated_at BEFORE UPDATE ON client_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questionnaire_responses_updated_at BEFORE UPDATE ON questionnaire_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

