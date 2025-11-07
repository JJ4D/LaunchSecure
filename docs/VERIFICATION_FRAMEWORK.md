# Compliance Scan Verification Framework

## Current Implementation Analysis

### 1. Benchmark Selection & Control Mapping

**Current State:**
- Benchmark mapping is hardcoded in `powerpipe.ts`:
  - HIPAA: `aws_compliance.benchmark.hipaa_security_rule_2003`
  - SOC2: `aws_compliance.benchmark.soc_2`
- Control extraction uses recursive parsing of Powerpipe JSON output
- Controls are deduplicated by `control_id` (good)
- Status mapping: `alarm > 0` = fail, `error > 0` = error, `ok > 0` = pass, else = skip

**Potential Issues:**
- No verification that benchmark name is correct/available
- No validation that all expected controls are present
- No comparison against official framework control lists
- Control IDs may not match official framework control IDs

### 2. Permission Error Handling

**Current State:**
- Errors detected via `control.summary?.error > 0` or `control.run_error`
- Error status is set but may not distinguish permission issues from other errors
- No specific detection of `AccessDenied`, `UnauthorizedOperation`, etc.

**Potential Issues:**
- Permission errors may be masked as generic "error" status
- Missing controls due to insufficient permissions may not be reported
- No way to know if low control count is due to:
  - Missing permissions (should fail loudly)
  - Resources not existing (acceptable)
  - Benchmark not covering all controls (critical gap)

### 3. Powerpipe Benchmark Configuration

**Current State:**
- Uses standard Powerpipe AWS compliance benchmarks
- Credentials configured via Steampipe config file + environment variables
- Region can be set to `["*"]` for all regions or specific region

**Potential Issues:**
- No verification that benchmark actually exists/is installed
- No check that all expected controls are in the benchmark
- Multi-region scanning may miss region-specific resources

## Verification Framework Components

### Component 1: Benchmark Coverage Verification

**Purpose:** Verify that Powerpipe benchmarks cover all required framework controls

**Implementation:**
1. **Control List Database** - Store official framework control lists
   - HIPAA: Official controls from HHS documentation
   - SOC2: Official Trust Services Criteria controls
   - Include: Control ID, Title, Description, Required/Recommended

2. **Benchmark Inventory** - Query Powerpipe to get all available controls
   ```sql
   -- Query Powerpipe benchmark to list all controls
   SELECT control_id, title FROM powerpipe_benchmark_controls 
   WHERE benchmark = 'aws_compliance.benchmark.hipaa_security_rule_2003'
   ```

3. **Coverage Analysis** - Compare benchmark controls vs. official framework
   - Identify missing controls
   - Identify extra controls (not in official framework)
   - Flag controls with mismatched IDs/titles

4. **Validation Report** - Generate coverage report
   - % of framework controls covered
   - List of missing controls
   - Recommendations for gaps

### Component 2: Permission Verification System

**Purpose:** Detect and report permission issues that may cause missing controls

**Implementation:**
1. **Permission Error Detection**
   - Parse `reason` and `run_error` fields for permission-related keywords:
     - "AccessDenied"
     - "UnauthorizedOperation" 
     - "InvalidUserID.NotFound"
     - "AccessDeniedException"
     - "Forbidden"
   - Track controls with permission errors separately

2. **Required Permissions Audit**
   - Document minimum IAM permissions required for each benchmark
   - Create IAM policy template for full benchmark coverage
   - Validate credentials have required permissions before scan

3. **Permission Error Reporting**
   - Add new field: `permission_error: boolean`
   - Flag controls that failed due to permissions
   - Generate permission report showing:
     - Which controls couldn't be checked due to permissions
     - Which IAM permissions are missing
     - Impact on compliance assessment

4. **Low Control Count Detection**
   - Set expected control count ranges per framework:
     - HIPAA AWS: ~200-300 controls (verify this)
     - SOC2 AWS: ~150-200 controls
   - Alert if control count is below threshold
   - Investigate if due to permissions vs. actual coverage

### Component 3: Scan Result Validation

**Purpose:** Verify scan results are accurate and complete

**Implementation:**
1. **Control Count Validation**
   - Expected minimum control counts per framework/provider
   - Alert if count is suspiciously low
   - Compare against known good scan results

2. **Control Status Distribution Analysis**
   - Expected ratios: Most should be pass/fail, few errors
   - High error rate may indicate permission issues
   - All "skip" may indicate resource filtering issues

3. **Control ID Format Validation**
   - Verify control IDs match expected format
   - HIPAA: Should map to actual HIPAA sections (e.g., 164.312(a)(1))
   - SOC2: Should map to CC series controls

4. **Resource Coverage Validation**
   - Verify controls check expected AWS resources
   - Flag if critical resources (S3, IAM, EC2, etc.) aren't checked
   - Check for region-specific gaps

### Component 4: Automated Verification Checks

**Purpose:** Automated checks that run during/after scans

**Implementation:**
1. **Pre-Scan Validation**
   - Verify benchmark exists and is accessible
   - Verify credentials have minimum permissions
   - Check benchmark version/completeness

2. **During-Scan Validation**
   - Monitor for high error rates
   - Track permission errors in real-time
   - Alert if control count is unexpectedly low

3. **Post-Scan Validation**
   - Compare control count vs. expected ranges
   - Analyze error distribution
   - Generate verification report
   - Flag potential issues for manual review

### Component 5: Manual Verification Tools

**Purpose:** Tools for manual verification and testing

**Implementation:**
1. **Benchmark Explorer**
   - UI to browse available Powerpipe benchmarks
   - View all controls in a benchmark
   - Compare benchmark controls vs. framework requirements

2. **Permission Test Tool**
   - Test AWS credentials with minimal permissions
   - Identify which controls fail due to permissions
   - Generate IAM policy for full coverage

3. **Control Comparison Tool**
   - Compare scan results across multiple scans
   - Identify controls that appear/disappear
   - Track control count trends

4. **Framework Reference Database**
   - Store official framework control lists
   - Link Powerpipe controls to official controls
   - Track coverage gaps

## Implementation Plan

### Phase 1: Critical Verification (Immediate)
1. **Verify HIPAA Benchmark Coverage**
   - Query Powerpipe to get actual control count for `hipaa_security_rule_2003`
   - Compare against official HIPAA Security Rule requirements
   - Document expected control count

2. **Add Permission Error Detection**
   - Enhance error parsing to detect permission issues
   - Add `permission_error` flag to findings
   - Report permission errors separately

3. **Control Count Validation**
   - Set expected ranges for HIPAA (131 seems low - verify)
   - Add warnings if count is below threshold
   - Log benchmark output for analysis

### Phase 2: Automated Verification
1. **Pre-scan validation checks**
2. **Post-scan validation reports**
3. **Control count monitoring**

### Phase 3: Framework Coverage Database
1. **Import official framework control lists**
2. **Build comparison tool**
3. **Generate coverage reports**

### Phase 4: Advanced Verification
1. **Permission audit system**
2. **Benchmark explorer UI**
3. **Historical comparison tools**

## Immediate Actions for 131 HIPAA Controls

1. **Verify Actual Benchmark Control Count**
   ```bash
   # Run Powerpipe benchmark and count controls
   docker exec launchsecure-steampipe-powerpipe powerpipe benchmark run aws_compliance.benchmark.hipaa_security_rule_2003 --output json | jq '.controls | length'
   ```

2. **Check Official HIPAA Security Rule Requirements**
   - HIPAA Security Rule (45 CFR Part 164) has multiple sections
   - Each section may have multiple controls
   - Expected: 200-300+ controls for comprehensive AWS HIPAA coverage

3. **Investigate Why 131 Controls**
   - Is benchmark only covering subset of HIPAA?
   - Are controls being filtered/grouped?
   - Are some controls missing due to permissions?
   - Is benchmark version incomplete?

4. **Compare Against Other Sources**
   - AWS HIPAA whitepaper requirements
   - Other compliance tools' HIPAA control counts
   - Powerpipe documentation/community

## Success Criteria

- ✅ All official framework controls are covered or explicitly documented as out of scope
- ✅ Permission errors are detected and reported separately
- ✅ Control count matches expected ranges for each framework
- ✅ Missing controls are identified and flagged
- ✅ Verification reports are generated automatically
- ✅ Manual verification tools are available

