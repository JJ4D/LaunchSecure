# Framework Control Database - Data Sources & Architecture

## Key Questions Answered

### 1. Where is the data coming from?

**Official Framework Documentation Sources:**

1. **HIPAA Security Rule (45 CFR Part 164)**
   - **Source**: HHS.gov official documentation
   - **URL**: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/
   - **Format**: Federal regulations (PDF/text)
   - **Controls**: ~240 controls across 5 sections
   - **Access**: Public domain, free

2. **SOC 2 Trust Services Criteria**
   - **Source**: AICPA (American Institute of CPAs)
   - **URL**: https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html
   - **Format**: Official AICPA documentation
   - **Controls**: ~145 controls across 7 Common Criteria
   - **Access**: Requires purchase/license (but widely available)

3. **ISO 27001:2022**
   - **Source**: ISO (International Organization for Standardization)
   - **URL**: https://www.iso.org/isoiec-27001-information-security.html
   - **Format**: ISO standard (PDF)
   - **Controls**: 93 controls in Annex A
   - **Access**: Requires purchase (but references available)

4. **NIST 800-53 Rev 5**
   - **Source**: NIST (National Institute of Standards and Technology)
   - **URL**: https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final
   - **Format**: Official NIST SP publication (PDF, XML, JSON)
   - **Controls**: ~1000+ controls across 20 families
   - **Access**: Public domain, free (NIST also provides JSON/XML catalogs)

5. **PCI-DSS v4.0**
   - **Source**: PCI SSC (Payment Card Industry Security Standards Council)
   - **URL**: https://www.pcisecuritystandards.org/document_library/
   - **Format**: Official PCI DSS standard
   - **Controls**: ~300+ controls across 12 requirements
   - **Access**: Requires registration (free)

6. **GDPR (General Data Protection Regulation)**
   - **Source**: EU official documentation
   - **URL**: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
   - **Format**: EU regulation
   - **Controls**: Articles-based structure
   - **Access**: Public domain, free

7. **FedRAMP Moderate Rev 4**
   - **Source**: NIST/FedRAMP
   - **URL**: https://www.fedramp.gov/
   - **Format**: Based on NIST 800-53 with additional requirements
   - **Controls**: NIST 800-53 controls + FedRAMP-specific
   - **Access**: Public domain, free

**Data Import Methods:**
- **Manual**: Start with key controls manually entered (for MVP)
- **Automated**: Parse official PDFs/text documents (for scale)
- **API**: Where available (NIST provides JSON catalogs)
- **Third-party**: Some frameworks have structured data available

---

### 2. Is this standard practice? Do other tools maintain massive DBs?

**YES - This is the industry standard approach:**

1. **Unified Control Framework (UCF)**
   - Tools like Vanta, Drata, Secureframe use a **centralized compliance database**
   - This serves as the **single source of truth** for all framework controls
   - They maintain their own normalized schema

2. **How it works:**
   ```
   Official Framework Docs → Framework Control DB (UCF) → Mapping Layer → Tool Outputs
                                                              ↓
                                                      Powerpipe / AWS Config / etc.
   ```

3. **Key Insight**: The framework database is **NOT** queried by scans. Instead:
   - Framework DB = **Source of Truth** (what controls exist)
   - Scans = **Evidence Collection** (what controls are checked)
   - Mapping Layer = **Correlation** (which scan results map to which framework controls)

4. **Industry Examples:**
   - **Vanta**: Maintains framework control database, maps to 1,200+ automated tests
   - **Drata**: Unified control framework with mappings to multiple evidence sources
   - **Secureframe**: Framework registry with automated/manual control classification
   - **6clicks**: Automated compliance mapping across frameworks

---

### 3. Schema/Naming Mismatches - How do we handle this?

**The Challenge:**
- **Official Framework**: Uses "164.312(a)(1)" (HIPAA)
- **Powerpipe**: Uses "hipaa_164_312_a_1" or "aws_compliance.benchmark.hipaa_security_rule_2003.control.xyz"
- **Other Tools**: Use different conventions

**Solution: Mapping Layer with Confidence Levels**

```typescript
// Our approach: Three-tier mapping system

// Tier 1: Official Framework Controls (Source of Truth)
framework_controls {
  control_id: "164.312(a)(1)"  // Official ID
  control_title: "Access Control"
  control_type: "automated" | "manual" | "hybrid"
}

// Tier 2: Mapping Layer (Correlation)
framework_control_mappings {
  framework_control_id → "164.312(a)(1)"
  powerpipe_benchmark → "aws_compliance.benchmark.hipaa_security_rule_2003"
  powerpipe_control_id → "hipaa_164_312_a_1"  // Powerpipe's ID
  mapping_confidence: "exact" | "approximate" | "manual" | "unverified"
  mapping_method: "automated_id_match" | "semantic_similarity" | "manual_review"
}

// Tier 3: Scan Results (Evidence)
findings {
  control_id: "hipaa_164_312_a_1"  // Powerpipe's ID
  framework: "HIPAA"
  // ... scan results
}
```

**Mapping Strategies:**

1. **Exact Match** (confidence: "exact")
   - Control IDs match exactly after normalization
   - Example: "164.312(a)(1)" → "164_312_a_1" → "hipaa_164_312_a_1"

2. **Semantic Similarity** (confidence: "approximate")
   - Match by title/description similarity
   - Use NLP/text similarity algorithms
   - Requires manual verification

3. **Manual Review** (confidence: "manual")
   - Human review and mapping
   - Highest accuracy but time-consuming

4. **Unverified** (confidence: "unverified")
   - No mapping found yet
   - Requires investigation

**Handling Unmapped Controls:**

- **If Powerpipe has control but no framework mapping**: Flag for manual review
- **If Framework has control but no Powerpipe mapping**: Identify as manual control
- **If both exist but don't match**: Use similarity matching, flag for review

---

### 4. Will this inform manual controls? YES!

**Critical Design Decision:**

The framework control database is the **single source of truth** for ALL controls (automated AND manual).

```sql
-- Framework controls table includes control_type
CREATE TABLE framework_controls (
  ...
  control_type VARCHAR(50) NOT NULL, -- 'automated', 'manual', 'hybrid'
  evidence_required TEXT[], -- ['policy_upload', 'self_attestation', 'training_record', 'technical_scan']
  ...
);
```

**How it works:**

1. **Framework DB defines all controls** (automated + manual)
2. **Mapping layer identifies which are automated** (have Powerpipe mappings)
3. **Remaining controls = manual controls** (no Powerpipe mapping, or control_type = 'manual')

**Example:**
```sql
-- HIPAA 164.308(a)(5)(i) - Security Awareness and Training
-- This is a MANUAL control (requires HR evidence)

framework_control {
  control_id: "164.308(a)(5)(i)",
  control_title: "Security Awareness and Training",
  control_type: "manual",
  evidence_required: ["training_records", "policy_acknowledgment", "self_attestation"]
}

-- No Powerpipe mapping exists (or mapping_confidence = 'not_applicable')
-- This becomes a manual control in the UI
```

**Benefits:**
- ✅ Single source of truth for all controls
- ✅ Automatic identification of manual vs automated
- ✅ Coverage gaps identified (missing controls)
- ✅ Evidence requirements defined per control
- ✅ Auditor-ready: Shows all required controls, not just automated ones

---

## Architecture: How Scans Query Against Framework DB

**Important Clarification:**

Scans do **NOT** query the framework database. Instead:

1. **Framework DB** = Source of truth (what controls exist)
2. **Powerpipe Scans** = Evidence collection (what we can check automatically)
3. **Mapping Layer** = Correlates scan results to framework controls
4. **Coverage Analysis** = Compares what we scanned vs what we should scan

**Flow:**
```
1. Framework DB defines: "164.312(a)(1) - Access Control" (required)
2. Powerpipe scan runs: Returns "hipaa_164_312_a_1" (pass)
3. Mapping layer: Maps "hipaa_164_312_a_1" → "164.312(a)(1)"
4. Coverage analysis: Checks if all framework controls are covered
5. Report: Shows coverage % and missing controls
```

**For Manual Controls:**
```
1. Framework DB defines: "164.308(a)(5)(i) - Security Training" (required, manual)
2. Powerpipe scan: No mapping found
3. Coverage analysis: Identifies as manual control needing evidence
4. UI: Shows manual control requiring policy/training evidence upload
```

---

## Updated Database Schema

```sql
CREATE TABLE framework_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL,
  framework_version VARCHAR(50) NOT NULL,
  control_id VARCHAR(255) NOT NULL,
  control_title TEXT NOT NULL,
  control_description TEXT,
  control_category VARCHAR(100),
  control_type VARCHAR(50) NOT NULL DEFAULT 'automated', -- 'automated', 'manual', 'hybrid'
  evidence_required TEXT[], -- ['policy_upload', 'self_attestation', 'training_record', 'technical_scan', 'audit_log']
  applicable_providers TEXT[] DEFAULT ARRAY['aws', 'azure', 'gcp', 'all'],
  requirement_type VARCHAR(50) DEFAULT 'Required', -- Required, Recommended, Optional
  official_source_url TEXT,
  official_source_text TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(framework, framework_version, control_id)
);

-- Mapping table (unchanged, but now includes control_type awareness)
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
```

---

## Implementation Strategy

### Phase 1: Framework DB + Automated Controls
1. Import official framework controls
2. Map Powerpipe controls to framework controls
3. Identify automated controls (those with mappings)
4. Coverage analysis for automated controls

### Phase 2: Manual Controls
1. Identify manual controls (no Powerpipe mapping, or control_type = 'manual')
2. Build manual control UI
3. Evidence upload system
4. Self-attestation system
5. Coverage analysis includes manual controls

### Phase 3: Hybrid Controls
1. Some controls require BOTH automated scan + manual evidence
2. Example: "Access logs reviewed" = automated (scan) + manual (reviewer attestation)
3. Combine evidence from multiple sources

---

## Success Criteria

- ✅ Framework DB is single source of truth for ALL controls
- ✅ Automated controls mapped to Powerpipe
- ✅ Manual controls identified and surfaced in UI
- ✅ Coverage analysis shows total coverage (automated + manual)
- ✅ Evidence requirements defined per control
- ✅ Auditor-ready: Shows complete control inventory

---

## Next Steps

1. **Update schema** to include `control_type` and `evidence_required`
2. **Import framework controls** (start with HIPAA, SOC2)
3. **Build mapping layer** (Powerpipe → Framework)
4. **Coverage analysis** (automated controls first)
5. **Manual control identification** (controls without mappings)
6. **Build manual control UI** (evidence upload, attestation)


