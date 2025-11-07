-- =============================================
-- Framework Coverage Database Migration
-- =============================================
-- Adds new tables to store official framework controls,
-- mappings to Powerpipe benchmarks, and coverage analysis
-- results. Existing tables remain untouched.

-- Official framework control definitions
CREATE TABLE IF NOT EXISTS framework_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL,
  framework_version VARCHAR(50) NOT NULL,
  control_id VARCHAR(255) NOT NULL,
  control_title TEXT NOT NULL,
  control_description TEXT,
  control_category VARCHAR(100),
  control_type VARCHAR(50) NOT NULL DEFAULT 'automated',
  evidence_required TEXT[],
  applicable_providers TEXT[] DEFAULT ARRAY['aws', 'azure', 'gcp'],
  requirement_type VARCHAR(50) DEFAULT 'Required',
  official_source_url TEXT,
  official_source_text TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(framework, framework_version, control_id)
);

-- Mapping between framework controls and Powerpipe controls
CREATE TABLE IF NOT EXISTS framework_control_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  powerpipe_benchmark VARCHAR(255) NOT NULL,
  powerpipe_control_id VARCHAR(255) NOT NULL,
  mapping_confidence VARCHAR(50) DEFAULT 'approximate',
  mapping_method VARCHAR(50),
  mapped_at TIMESTAMP DEFAULT NOW(),
  mapped_by VARCHAR(100),
  notes TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  verified_by VARCHAR(100),
  UNIQUE(framework_control_id, powerpipe_benchmark, powerpipe_control_id)
);

-- Coverage analysis results per scan
CREATE TABLE IF NOT EXISTS scan_coverage_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  framework VARCHAR(50) NOT NULL,
  framework_version VARCHAR(50) NOT NULL,
  total_official_controls INTEGER NOT NULL,
  controls_covered INTEGER NOT NULL,
  controls_missing INTEGER NOT NULL,
  coverage_percentage NUMERIC(5,2) NOT NULL,
  coverage_gaps JSONB,
  analysis_metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes to improve lookup performance
CREATE INDEX IF NOT EXISTS idx_framework_controls_framework
  ON framework_controls(framework, framework_version);

CREATE INDEX IF NOT EXISTS idx_mappings_framework_control
  ON framework_control_mappings(framework_control_id);

CREATE INDEX IF NOT EXISTS idx_mappings_powerpipe
  ON framework_control_mappings(powerpipe_benchmark, powerpipe_control_id);

CREATE INDEX IF NOT EXISTS idx_scan_coverage_compliance_check
  ON scan_coverage_analysis(compliance_check_id);
