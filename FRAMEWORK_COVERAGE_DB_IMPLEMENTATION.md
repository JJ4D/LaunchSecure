# Framework Coverage Database - Implementation Plan

## Overview

This document provides the implementation plan for Phase 1: Framework Coverage Database - the foundation for cross-verifying compliance scans against official framework sources.

## Database Schema

```sql
-- Official framework control definitions
CREATE TABLE framework_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL, -- HIPAA, SOC2, ISO27001, NIST, PCI-DSS, GDPR, FedRAMP
  framework_version VARCHAR(50) NOT NULL, -- e.g., "2003", "v3.1", "rev5", "v4.0"
  control_id VARCHAR(255) NOT NULL, -- Official control ID (e.g., "164.312(a)(1)", "CC1.1")
  control_title TEXT NOT NULL,
  control_description TEXT,
  control_category VARCHAR(100), -- Access Control, Encryption, Monitoring, etc.
  control_family VARCHAR(100), -- For NIST: AC (Access Control), SC (System and Communications Protection)
  requirement_type VARCHAR(50) DEFAULT 'Required', -- Required, Recommended, Optional
  applicable_providers TEXT[] DEFAULT ARRAY['aws', 'azure', 'gcp'], -- Which cloud providers this applies to
  official_source_url TEXT,
  official_source_text TEXT, -- Extracted text from official documentation
  metadata JSONB, -- Additional metadata (tags, related controls, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(framework, framework_version, control_id)
);

CREATE INDEX idx_framework_controls_framework ON framework_controls(framework, framework_version);
CREATE INDEX idx_framework_controls_category ON framework_controls(control_category);
CREATE INDEX idx_framework_controls_control_id ON framework_controls(control_id);

-- Mapping between official framework controls and Powerpipe benchmark controls
CREATE TABLE framework_control_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  powerpipe_benchmark VARCHAR(255) NOT NULL, -- e.g., "aws_compliance.benchmark.hipaa_security_rule_2003"
  powerpipe_control_id VARCHAR(255) NOT NULL, -- Powerpipe's control ID
  mapping_confidence VARCHAR(50) DEFAULT 'approximate', -- 'exact', 'approximate', 'manual', 'unverified'
  mapping_method VARCHAR(50), -- 'automated_id_match', 'manual_review', 'semantic_similarity'
  mapped_at TIMESTAMP DEFAULT NOW(),
  mapped_by VARCHAR(100), -- User/system that created the mapping
  notes TEXT,
  verified BOOLEAN DEFAULT FALSE, -- Whether mapping has been manually verified
  verified_at TIMESTAMP,
  verified_by VARCHAR(100),
  UNIQUE(framework_control_id, powerpipe_benchmark, powerpipe_control_id)
);

CREATE INDEX idx_mappings_framework_control ON framework_control_mappings(framework_control_id);
CREATE INDEX idx_mappings_powerpipe ON framework_control_mappings(powerpipe_benchmark, powerpipe_control_id);
CREATE INDEX idx_mappings_confidence ON framework_control_mappings(mapping_confidence);

-- Coverage analysis results per scan
CREATE TABLE scan_coverage_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  framework VARCHAR(50) NOT NULL,
  framework_version VARCHAR(50) NOT NULL,
  total_official_controls INTEGER NOT NULL,
  controls_covered INTEGER NOT NULL,
  controls_missing INTEGER NOT NULL,
  coverage_percentage NUMERIC(5,2) NOT NULL,
  coverage_gaps JSONB, -- Array of missing control IDs with details
  analysis_metadata JSONB, -- Additional analysis data
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scan_coverage_compliance_check ON scan_coverage_analysis(compliance_check_id);
CREATE INDEX idx_scan_coverage_framework ON scan_coverage_analysis(framework, framework_version);
```

## Data Sources

### HIPAA Security Rule (45 CFR Part 164)

**Source:** HHS official documentation
- **Section 164.308**: Administrative Safeguards (~100 controls)
- **Section 164.310**: Physical Safeguards (~50 controls)
- **Section 164.312**: Technical Safeguards (~50 controls)
- **Section 164.314**: Organizational Requirements (~20 controls)
- **Section 164.316**: Policies and Procedures (~20 controls)

**Total:** ~240 controls

**Import Method:**
1. Download official HHS PDF documentation
2. Extract text and structure
3. Parse into structured control definitions
4. Map to Powerpipe `aws_compliance.benchmark.hipaa_security_rule_2003`

### SOC 2 Trust Services Criteria

**Source:** AICPA Trust Services Criteria
- **CC1**: Control Environment (~20 controls)
- **CC2**: Communication and Information (~15 controls)
- **CC3**: Risk Assessment (~20 controls)
- **CC4**: Monitoring Activities (~15 controls)
- **CC5**: Control Activities (~30 controls)
- **CC6**: Logical and Physical Access Controls (~25 controls)
- **CC7**: System Operations (~20 controls)

**Total:** ~145 controls

**Import Method:**
1. AICPA official documentation
2. Map to Powerpipe `aws_compliance.benchmark.soc_2`

### ISO 27001:2022

**Source:** ISO/IEC 27001:2022 Annex A
- **93 controls** across 4 categories:
  - Organizational (37 controls)
  - People (8 controls)
  - Physical (14 controls)
  - Technological (34 controls)

**Import Method:**
1. ISO standard documentation
2. Map to Powerpipe `aws_compliance.benchmark.iso_27001`

### NIST 800-53 Rev 5

**Source:** NIST SP 800-53 Rev 5
- **20 control families** (AC, AT, AU, CA, CM, CP, IA, IR, MA, MP, PE, PL, PS, RA, SA, SC, SI, SR, PM, PT)
- **~1000+ controls** total

**Import Method:**
1. NIST official JSON/XML catalog
2. Map to Powerpipe `aws_compliance.benchmark.nist_800_53_rev_5`

### PCI-DSS v4.0

**Source:** PCI SSC official documentation
- **12 Requirements** with multiple sub-requirements
- **~300+ controls** total

**Import Method:**
1. PCI DSS official documentation
2. Map to Powerpipe `aws_compliance.benchmark.pci_dss_v321`

## Implementation Steps

### Step 1: Create Database Schema

```bash
# Add to platform/database/migrations/004_framework_coverage_database.sql
```

### Step 2: Build Control Import Scripts

Create Python/Node.js scripts to import framework controls:

```typescript
// platform/orchestrator/src/lib/framework-import/hipaa-importer.ts
export async function importHIPAAControls() {
  // Parse HHS documentation
  // Extract control definitions
  // Insert into framework_controls table
}

// platform/orchestrator/src/lib/framework-import/soc2-importer.ts
export async function importSOC2Controls() {
  // Parse AICPA documentation
  // Extract control definitions
  // Insert into framework_controls table
}
```

### Step 3: Build Control Mapping Tool

```typescript
// platform/orchestrator/src/lib/framework-import/control-mapper.ts

export async function mapPowerpipeToFramework(
  framework: string,
  powerpipeBenchmark: string
) {
  // 1. Get all official framework controls
  // 2. Get all Powerpipe benchmark controls (via discoverAvailableBenchmarks + benchmark detail)
  // 3. Attempt automatic mapping:
  //    - Exact control ID match
  //    - Semantic similarity (title/description)
  //    - Manual review queue for unmatched
  // 4. Store mappings in framework_control_mappings table
}
```

### Step 4: Build Coverage Analysis API

```typescript
// platform/orchestrator/src/api/verification.ts

// GET /api/verification/coverage/:framework
router.get('/coverage/:framework', async (req, res, next) => {
  // 1. Get all official framework controls
  // 2. Get all Powerpipe controls for framework
  // 3. Compare and identify gaps
  // 4. Return coverage report
});

// GET /api/verification/coverage/scan/:scanId
router.get('/coverage/scan/:scanId', async (req, res, next) => {
  // 1. Get scan results
  // 2. Get official framework controls
  // 3. Compare what was scanned vs. what should be scanned
  // 4. Return coverage analysis
});
```

### Step 5: Integrate Coverage Check into Scan Flow

```typescript
// platform/orchestrator/src/api/scans.ts

async function executeScan(...) {
  // ... existing scan logic ...
  
  // After scan completes:
  // 1. Run coverage analysis
  const coverageAnalysis = await analyzeCoverage(
    complianceCheckId,
    framework,
    scannedControls
  );
  
  // 2. Store coverage analysis
  await db.query(
    'INSERT INTO scan_coverage_analysis (...) VALUES (...)',
    [coverageAnalysis]
  );
  
  // 3. Alert if coverage is low
  if (coverageAnalysis.coverage_percentage < 95) {
    console.warn(`⚠️ Low coverage: ${coverageAnalysis.coverage_percentage}%`);
    // Add to verification warnings
  }
}
```

## Quick Start: HIPAA Implementation

### 1. Create Migration

```sql
-- platform/database/migrations/004_framework_coverage_database.sql

-- Framework controls table
CREATE TABLE framework_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL,
  framework_version VARCHAR(50) NOT NULL,
  control_id VARCHAR(255) NOT NULL,
  control_title TEXT NOT NULL,
  control_description TEXT,
  control_category VARCHAR(100),
  requirement_type VARCHAR(50) DEFAULT 'Required',
  applicable_providers TEXT[] DEFAULT ARRAY['aws', 'azure', 'gcp'],
  official_source_url TEXT,
  official_source_text TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(framework, framework_version, control_id)
);

-- Control mappings table
CREATE TABLE framework_control_mappings (
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

-- Coverage analysis table
CREATE TABLE scan_coverage_analysis (
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

CREATE INDEX idx_framework_controls_framework ON framework_controls(framework, framework_version);
CREATE INDEX idx_mappings_framework_control ON framework_control_mappings(framework_control_id);
CREATE INDEX idx_mappings_powerpipe ON framework_control_mappings(powerpipe_benchmark, powerpipe_control_id);
CREATE INDEX idx_scan_coverage_compliance_check ON scan_coverage_analysis(compliance_check_id);
```

### 2. Manual HIPAA Control Import (Initial)

Start with a small subset of HIPAA controls manually imported:

```sql
-- Example: HIPAA 164.312(a)(1) - Access Control
INSERT INTO framework_controls (
  framework, framework_version, control_id, control_title, 
  control_description, control_category, requirement_type
) VALUES (
  'HIPAA',
  '2003',
  '164.312(a)(1)',
  'Access Control',
  'Implement technical policies and procedures for electronic information systems that maintain electronic protected health information to allow access only to those persons or software programs that have been granted access rights as specified in § 164.308(a)(4).',
  'Access Control',
  'Required'
);
```

### 3. Build Mapping Tool (Basic)

```typescript
// platform/orchestrator/src/lib/framework-verification/coverage-analyzer.ts

export async function analyzeFrameworkCoverage(
  framework: string,
  frameworkVersion: string,
  powerpipeBenchmark: string
): Promise<CoverageReport> {
  // 1. Get official framework controls
  const officialControls = await db.query(
    'SELECT * FROM framework_controls WHERE framework = $1 AND framework_version = $2',
    [framework, frameworkVersion]
  );
  
  // 2. Get Powerpipe benchmark controls
  const benchmarkName = getBenchmarkName(framework, 'aws'); // Assuming AWS
  const powerpipeControls = await getBenchmarkControls(benchmarkName);
  
  // 3. Get mappings
  const mappings = await db.query(
    `SELECT fc.control_id, fcm.powerpipe_control_id, fcm.mapping_confidence
     FROM framework_controls fc
     JOIN framework_control_mappings fcm ON fc.id = fcm.framework_control_id
     WHERE fc.framework = $1 AND fc.framework_version = $2
       AND fcm.powerpipe_benchmark = $3`,
    [framework, frameworkVersion, powerpipeBenchmark]
  );
  
  // 4. Calculate coverage
  const mappedControls = new Set(mappings.rows.map(m => m.control_id));
  const missingControls = officialControls.rows
    .filter(c => !mappedControls.has(c.control_id))
    .map(c => ({
      control_id: c.control_id,
      control_title: c.control_title,
      reason: 'not_in_benchmark'
    }));
  
  const coveragePercentage = 
    (mappedControls.size / officialControls.rows.length) * 100;
  
  return {
    framework,
    framework_version: frameworkVersion,
    total_official_controls: officialControls.rows.length,
    controls_covered: mappedControls.size,
    controls_missing: missingControls.length,
    coverage_percentage: coveragePercentage,
    missing_controls: missingControls
  };
}
```

## Next Steps

1. **Run Migration**: Create database tables
2. **Manual Import**: Import 10-20 key HIPAA controls manually
3. **Build Mapping Tool**: Create basic mapping between Powerpipe and HIPAA
4. **Test Coverage Analysis**: Run coverage analysis on existing scan
5. **Iterate**: Expand to more controls and frameworks

## Resources

- **HIPAA**: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/
- **SOC 2**: https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html
- **ISO 27001**: https://www.iso.org/isoiec-27001-information-security.html
- **NIST 800-53**: https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final
- **PCI-DSS**: https://www.pcisecuritystandards.org/document_library/

## Success Criteria

- ✅ Database schema created
- ✅ 50+ HIPAA controls imported
- ✅ Mapping tool can map Powerpipe controls to HIPAA controls
- ✅ Coverage analysis API returns coverage percentage
- ✅ Coverage gaps identified for at least one scan


