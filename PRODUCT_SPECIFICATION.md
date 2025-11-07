# LaunchSecure Platform - Product Specification
## Simplified MVP for Fresh Build

**Version:** 2.1 (Modern MVP with Vanta-Inspired Design)  
**Last Updated:** 2025-01-XX  
**Status:** Fresh Build - MVP Focus  
**Purpose:** Simplified specification for rebuilding from scratch with Steampipe/Powerpipe only

---

## Table of Contents

1. [Overview](#overview)
2. [Steampipe/Powerpipe Architecture](#steampipepowerpipe-architecture)
3. [Database Schema (Steampipe/Powerpipe Data Flow)](#database-schema-steampipepowerpipe-data-flow)
4. [Core Architecture](#core-architecture)
5. [Compliance Scanning Workflow](#compliance-scanning-workflow)
6. [Client Management](#client-management)
7. [Findings & Remediation Tracking](#findings--remediation-tracking)
8. [Multi-Tenant Dashboards](#multi-tenant-dashboards)
9. [Modern UI/UX Design (Vanta-Inspired)](#modern-uiux-design-vanta-inspired)
10. [AI Content Generation](#ai-content-generation)
11. [Basic Reporting](#basic-reporting)
12. [Fresh Build Guide](#fresh-build-guide)

---

## Overview

LaunchSecure is a compliance automation platform that helps organizations achieve and maintain compliance through **automated scanning with Steampipe/Powerpipe** and **simple remediation tracking**.

### MVP Core Value Proposition

- **Automated Compliance Scanning**: Use Powerpipe benchmarks to scan cloud infrastructure via Steampipe
- **Multi-Tenant Management**: Consulting firms manage multiple client organizations
- **Simple Remediation Tracking**: Clients can log in to track and update remediation status
- **Basic Reporting**: Generate simple compliance status reports

### Target Users (MVP)

1. **Super Admins (LaunchSecure Team)**: Manage all clients, run scans, view all dashboards
2. **Client Users**: Log in to see their organization's compliance status and track remediation

---

## Steampipe/Powerpipe Architecture

### Overview

**LaunchSecure uses Steampipe and Powerpipe as the primary and only scanning tools** for compliance automation. This architecture provides comprehensive coverage for cloud infrastructure compliance across multiple frameworks.

### How Steampipe Works

**Steampipe** is a SQL-based tool that:
- Connects to cloud APIs (AWS, Azure, GCP) and SaaS tools
- Provides a unified SQL interface to query cloud resources
- Runs as a service (port 9193) accessible via HTTP
- Supports 140+ cloud and SaaS integrations
- Uses plugins for each provider (aws, azure, gcp, okta, github, etc.)

**Steampipe Service**:
- Runs in Docker container
- Listens on port 9193
- Accepts SQL queries via HTTP API
- Returns JSON results
- Requires credentials to be configured per client/provider

**Example Steampipe Query**:
```sql
SELECT * FROM aws_s3_bucket WHERE encryption_enabled = false;
```

### How Powerpipe Works

**Powerpipe** is a compliance benchmarking tool that:
- Uses Steampipe as its data source
- Runs compliance benchmarks (HIPAA, SOC2, ISO27001, etc.)
- Executes via `docker exec` into Powerpipe container
- Outputs JSON with control results (pass/fail)
- Each benchmark contains multiple controls to check

**Powerpipe Execution Flow**:
1. Powerpipe container receives benchmark command
2. Powerpipe connects to Steampipe service (port 9193)
3. Powerpipe executes SQL queries against cloud APIs via Steampipe
4. Powerpipe evaluates controls and determines pass/fail
5. Returns JSON output with control results

**Example Powerpipe Command**:
```bash
powerpipe benchmark run aws_compliance.benchmark.hipaa --output json
```

### Supported Frameworks (via Powerpipe)

Powerpipe provides compliance benchmarks for:
- **CIS Benchmarks**: `aws_compliance.benchmark.cis_v140`, `azure_compliance.benchmark.cis_v200`
- **HIPAA**: `aws_compliance.benchmark.hipaa`, `azure_compliance.benchmark.hipaa`
- **SOC 2**: `aws_compliance.benchmark.soc_2`
- **ISO 27001**: `aws_compliance.benchmark.iso_27001`
- **NIST**: `aws_compliance.benchmark.nist_800_53_rev_5`
- **PCI-DSS**: `aws_compliance.benchmark.pci_dss_v321`
- **GDPR**: `aws_compliance.benchmark.gdpr`
- **FedRAMP**: `aws_compliance.benchmark.fedramp_moderate`

**Note**: Each benchmark supports multiple cloud providers (AWS, Azure, GCP) where applicable.

### Powerpipe Output Structure

Powerpipe JSON output contains:
```json
{
  "benchmark": "aws_compliance.benchmark.hipaa",
  "controls": [
    {
      "control_id": "hipaa_164_312_a_1",
      "title": "Access Control",
      "description": "Implement technical policies and procedures...",
      "status": "fail",
      "reason": "S3 bucket encryption not enabled",
      "resources": [
        {
          "resource": "aws_s3_bucket.example",
          "status": "fail"
        }
      ]
    }
  ],
  "summary": {
    "total": 100,
    "passed": 85,
    "failed": 15
  }
}
```

### Credential Configuration for Steampipe

**Steampipe requires credentials to be configured** before executing queries:

1. **AWS Credentials**:
   - Access Key ID and Secret Key
   - Configured in Steampipe config file
   - Can be set per client via environment variables

2. **Azure Credentials**:
   - Service Principal (Client ID, Secret, Tenant ID)
   - Subscription ID
   - Configured in Steampipe config

3. **GCP Credentials**:
   - Service Account JSON
   - Project ID
   - Configured in Steampipe config

**Credential Management**:
- Credentials stored encrypted in `credentials` table
- Decrypted and passed to Steampipe when needed
- Test connection before running scans
- Support multiple providers per client

### Data Flow: Powerpipe → Database → UI

1. **Scan Trigger**: Super Admin clicks "Run Compliance Check"
2. **Powerpipe Execution**: 
   - Orchestrator executes `powerpipe benchmark run` via docker exec
   - Powerpipe connects to Steampipe service
   - Steampipe queries cloud APIs using client credentials
   - Powerpipe evaluates controls and returns JSON
3. **Database Storage**:
   - Parse Powerpipe JSON output
   - Create `compliance_check` record
   - Create `findings` records for each control
   - Store control metadata (ID, title, description, status)
4. **UI Display**:
   - Query findings from database
   - Display organized by framework/domain
   - Show status, remediation tracking, AI-generated context

---

## Database Schema (Steampipe/Powerpipe Data Flow)

### Schema Overview

The database schema is designed to store and organize data from Steampipe/Powerpipe scans. Each table maps directly to the scanning workflow.

### Core Tables (Mapped to Steampipe/Powerpipe Flow)

```sql
-- ============================================
-- CLIENT MANAGEMENT (Required for Steampipe)
-- ============================================

-- Clients: Organizations to scan
clients (
  id UUID PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  business_description TEXT,                    -- For AI context
  industry VARCHAR(100),                        -- For AI context
  employee_count_range VARCHAR(50),             -- For AI context
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',         -- active/paused/inactive
  assigned_frameworks JSONB NOT NULL,           -- ['HIPAA', 'SOC2'] - maps to Powerpipe benchmarks
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: clients.status for filtering active clients

-- Credentials: Cloud API credentials for Steampipe
credentials (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,                -- 'aws', 'azure', 'gcp' - Steampipe plugin name
  encrypted_credentials JSONB NOT NULL,          -- Encrypted: {access_key, secret_key, ...}
  is_active BOOLEAN DEFAULT true,                -- Toggle for Steampipe connection
  region VARCHAR(100),                          -- AWS region, Azure location, GCP zone
  account_id VARCHAR(100),                      -- AWS account ID, Azure subscription ID, GCP project ID
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: credentials.client_id, credentials.provider for lookup
-- Note: Credentials are decrypted and passed to Steampipe when executing scans

-- ============================================
-- SCAN EXECUTION (Powerpipe Results)
-- ============================================

-- Compliance Checks: Each Powerpipe benchmark execution
compliance_checks (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  frameworks JSONB NOT NULL,                     -- ['HIPAA', 'SOC2'] - which benchmarks ran
  status VARCHAR(20) DEFAULT 'in_progress',     -- in_progress/completed/failed
  total_controls INTEGER DEFAULT 0,             -- From Powerpipe summary.total
  passed_controls INTEGER DEFAULT 0,            -- From Powerpipe summary.passed
  failed_controls INTEGER DEFAULT 0,           -- From Powerpipe summary.failed
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  powerpipe_output JSONB,                      -- Raw Powerpipe JSON (for debugging/reference)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: compliance_checks.client_id, compliance_checks.status for queries
-- Note: Maps to single Powerpipe benchmark execution or multiple if frameworks run together

-- Findings: Individual control results from Powerpipe
findings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  compliance_check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  
  -- Control Metadata (from Powerpipe output)
  control_id VARCHAR(255) NOT NULL,            -- From Powerpipe: "hipaa_164_312_a_1" or "CIS 1.4"
  control_title VARCHAR(500) NOT NULL,          -- From Powerpipe control.title
  control_description TEXT,                    -- From Powerpipe control.description
  framework VARCHAR(50) NOT NULL,                -- 'HIPAA', 'SOC2', etc. - maps to Powerpipe benchmark
  domain VARCHAR(100),                          -- 'Access Control', 'Encryption' - extracted from Powerpipe
  category VARCHAR(100),                        -- Sub-category if applicable
  
  -- Scan Results (from Powerpipe)
  scan_status VARCHAR(20) NOT NULL,            -- 'pass', 'fail', 'error', 'skip' - from Powerpipe control.status
  scan_reason TEXT,                             -- From Powerpipe control.reason (why it failed/passed)
  scan_resources JSONB,                        -- From Powerpipe control.resources (affected resources)
  
  -- Remediation Tracking (UI/User managed)
  remediation_status VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
  assigned_owner_id UUID REFERENCES client_owners(id),
  notes TEXT,
  status_history JSONB,                         -- Timeline of status changes
  
  -- AI-Generated Content (enhances Powerpipe output)
  ai_business_context TEXT,                    -- How this control applies to client
  ai_remediation_guidance TEXT,                 -- Specific remediation steps
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Indexes: 
--   findings.client_id (for client portal queries)
--   findings.compliance_check_id (for scan history)
--   findings.framework (for filtering by framework)
--   findings.scan_status (for filtering pass/fail)
--   findings.remediation_status (for filtering open/in_progress/resolved)
--   findings.control_id (for finding specific controls)

-- ============================================
-- USER MANAGEMENT
-- ============================================

-- Client Owners: Stakeholders assigned to findings
client_owners (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(100),                             -- CISO, Compliance Manager, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: client_owners.client_id

-- Client Users: Authentication for client portal
client_users (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'client_user',        -- 'client_user', 'super_admin'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: client_users.email (unique), client_users.client_id

-- ============================================
-- SUPPORTING DATA
-- ============================================

-- Questionnaire Responses: For AI context generation
questionnaire_responses (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  questionnaire_type VARCHAR(50),               -- 'business_context', 'technical_assessment'
  responses JSONB NOT NULL,                     -- Structured questionnaire answers
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Index: questionnaire_responses.client_id

-- Reports: Generated compliance reports
reports (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  report_type VARCHAR(50),                      -- 'compliance_summary', 'findings'
  file_path VARCHAR(500),
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
-- Index: reports.client_id
```

### Key Relationships (Steampipe/Powerpipe Context)

```
clients (1) ──< (N) credentials          -- Each client can have multiple cloud provider credentials for Steampipe
clients (1) ──< (N) compliance_checks     -- Each client has multiple scan executions (Powerpipe runs)
clients (1) ──< (N) findings              -- Each client has findings from Powerpipe scans
compliance_checks (1) ──< (N) findings   -- Each scan creates multiple findings (one per control)
```

### Data Mapping: Powerpipe → Database

**Powerpipe Benchmark** → `compliance_checks`:
- `benchmark` → `frameworks` (extract framework name)
- `summary.total` → `total_controls`
- `summary.passed` → `passed_controls`
- `summary.failed` → `failed_controls`

**Powerpipe Control** → `findings`:
- `control.control_id` → `control_id`
- `control.title` → `control_title`
- `control.description` → `control_description`
- `control.status` → `scan_status`
- `control.reason` → `scan_reason`
- `control.resources` → `scan_resources`
- `benchmark` → `framework` (extract framework name)

### Database Indexes (Optimized for Steampipe/Powerpipe Queries)

```sql
-- Client queries
CREATE INDEX idx_clients_status ON clients(status);

-- Finding queries (most common)
CREATE INDEX idx_findings_client_id ON findings(client_id);
CREATE INDEX idx_findings_compliance_check_id ON findings(compliance_check_id);
CREATE INDEX idx_findings_framework ON findings(framework);
CREATE INDEX idx_findings_scan_status ON findings(scan_status);
CREATE INDEX idx_findings_remediation_status ON findings(remediation_status);
CREATE INDEX idx_findings_control_id ON findings(control_id);

-- Compliance check queries
CREATE INDEX idx_compliance_checks_client_id ON compliance_checks(client_id);
CREATE INDEX idx_compliance_checks_status ON compliance_checks(status);

-- Credential queries
CREATE INDEX idx_credentials_client_id ON credentials(client_id);

-- User queries
CREATE UNIQUE INDEX idx_client_users_email ON client_users(email);
CREATE INDEX idx_client_users_client_id ON client_users(client_id);
```

---

## Core Architecture

### Technology Stack

- **Frontend**: Next.js 14 (React), TypeScript, Tailwind CSS
- **Backend**: Node.js/Express API, PostgreSQL
- **Scanning Tools**: **Steampipe** (data source) + **Powerpipe** (compliance benchmarks) - **ONLY**
- **Deployment**: Docker, Docker Compose

### Scanning Architecture (Steampipe/Powerpipe Only)

**Critical**: The platform uses **Steampipe and Powerpipe** for compliance scanning.

### Architecture Overview

```
┌─────────────────┐
│  Next.js UI     │  (Super Admin + Client Portal)
│  (Port 3000)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Express API    │  (Orchestrator - Port 3001)
│  (Node.js)      │
└────────┬────────┘
         │
    ┌────┴────┬──────────────┐
    ▼         ▼              ▼
┌────────┐ ┌──────────┐ ┌──────────┐
│Postgres│ │Steampipe│ │Powerpipe │
│(5432)  │ │(9193)    │ │(Docker)  │
└────────┘ └──────────┘ └──────────┘
```

### Key Principles

1. **Steampipe/Powerpipe Only**: Primary scanning tools - no other scanning integrations
2. **Database-First**: Schema designed to store Powerpipe scan results efficiently
3. **Modern UI/UX**: Vanta-inspired organized visual approach from day one
4. **Framework Compliance**: Use official framework naming and descriptions from Powerpipe
5. **Clear Separation**: Super admin sees all, clients see only their org
6. **AI-Enhanced**: Generate context-aware content based on client questionnaires

---

## MVP Core Features

### Phase 1: Foundation (Must Have)

1. ✅ **Client Management**
   - Create/edit client organizations
   - Assign compliance frameworks (HIPAA, SOC2, ISO27001, CIS, NIST, PCI-DSS)
   - Store API credentials (AWS/Azure/GCP) for Steampipe connections

2. ✅ **Compliance Scanning**
   - Run Powerpipe benchmarks via Steampipe
   - Execute scans manually (Super Admin)
   - Store scan results as findings

3. ✅ **Findings Display**
   - View findings per client
   - Show pass/fail status
   - Display control details from Powerpipe results

4. ✅ **Multi-Tenant Dashboards**
   - Super Admin: View all clients, aggregate stats
   - Client Portal: View only their organization's data

### Phase 2: Remediation Tracking (Core)

5. ✅ **Client Login**
   - Simple authentication (email/password)
   - Client users can only access their own org

6. ✅ **Remediation Status**
   - Update finding status: `open` → `in_progress` → `resolved`
   - Assign owners/stakeholders (optional)
   - Basic comments/notes on findings

### Phase 3: Basic Reporting

7. ✅ **Simple Reports**
   - Compliance percentage by framework
   - Findings summary (pass/fail counts)
   - Export as PDF or CSV

---

## Modern UI/UX Design (Vanta-Inspired)

### Design Philosophy

The platform should emulate Vanta's modern, organized approach to compliance tracking:

- **Visual Hierarchy**: Clear organization of controls by framework, domain, and category
- **Status Indicators**: Color-coded status badges (green=pass, red=fail, yellow=in_progress)
- **Progress Tracking**: Visual progress bars and percentages for compliance metrics
- **Organized Control Lists**: Grouped by framework, domain, and control type
- **Clean Card-Based Layout**: Modern card components for findings, controls, and metrics
- **Responsive Design**: Mobile-friendly with collapsible sections

### Key UI Components

#### Control Organization View

**Vanta-Style Control List**:
- Grouped by Framework (HIPAA, SOC2, etc.)
- Within each framework, grouped by Domain/Category (e.g., Access Control, Encryption, Monitoring)
- Each control shows:
  - Control ID/Number (e.g., "HIPAA 164.312(a)(1)")
  - Control Title (official framework name)
  - Status Badge (Pass/Fail/In Progress)
  - Last Scan Date
  - Assigned Owner (if any)
  - Quick Actions (View Details, Update Status)

**Visual Features**:
- Expandable sections for each framework/domain
- Filter/search by control ID, title, status
- Sort by status, framework, date
- Bulk actions for multiple controls

#### Dashboard Cards

**Compliance Score Cards**:
- Large, prominent percentage display
- Color-coded (green ≥90%, yellow 70-89%, red <70%)
- Breakdown by framework
- Trend indicators (↑↓ arrows)

**Findings Summary Cards**:
- Total findings count
- Breakdown by status (Open, In Progress, Resolved)
- Visual distribution (pie chart or bar chart)
- Quick filters

#### Finding Detail View

**Organized Information Display**:
- Control header with framework badge
- Official control description (from framework)
- AI-generated business context (how it applies to this client)
- Scan results with timestamps
- Remediation status and history
- Assigned owner and notes
- Related controls (if applicable)

**Visual Elements**:
- Status timeline (Open → In Progress → Resolved)
- Evidence attachments (future)
- Comments/activity log
- Remediation guidance (AI-generated)

### Color Scheme & Status Indicators

**Status Colors**:
- **Pass/Resolved**: Green (#10B981 or similar)
- **Fail/Open**: Red (#EF4444 or similar)
- **In Progress**: Yellow/Orange (#F59E0B or similar)
- **Error**: Gray (#6B7280 or similar)

**Framework Badges**: Distinct colors for each framework (HIPAA=blue, SOC2=purple, etc.)

### Responsive Design

- Mobile-first approach
- Collapsible navigation
- Stacked cards on mobile
- Touch-friendly buttons and interactions
- Responsive tables with horizontal scroll

---

## Client Management

### Required Fields

1. **Basic Information**
   - Company Name (required)
   - Business Description (required - for AI context generation)
   - Industry (required - dropdown: Healthcare, SaaS, Financial Services, E-Commerce, etc.)
   - Number of Employees (required - range: 1-50, 51-200, 201-1000, 1000+)
   - Primary Contact Name (required)
   - Primary Contact Email (required)
   - Status: `active`, `paused`, `inactive`

2. **Compliance Configuration**
   - Assigned Frameworks (at least one required)
     - Options: HIPAA, SOC2, ISO27001, CIS, NIST, PCI-DSS, GDPR, FedRAMP
   - Multi-select support
   - Audit Date (if applicable - optional)

3. **API Credentials** (for Steampipe scanning)
   - **AWS**: Access Key ID, Secret Key, Account ID, Region(s)
   - **Azure**: Service Principal (Client ID, Secret, Tenant ID, Subscription ID)
   - **GCP**: Service Account JSON, Project ID
   - Encrypted storage (AES-256-GCM)
   - Test connection functionality
   - Active/Inactive toggle

### Client Onboarding Flow

1. Super Admin creates client via UI (`/clients` → "Add Client")
2. Fill basic information and assign frameworks
3. Configure API credentials (AWS/Azure/GCP)
4. Test connection to verify credentials
5. Generate client login credentials (email/password)
6. Client receives credentials and can access portal

### Editable Fields

All client fields can be edited after creation:
- Basic information (including business description and industry)
- Assigned frameworks
- API credentials
- Status
- Questionnaire responses (for AI context)

---

## Client Onboarding Questionnaires

### Purpose

Questionnaires collect business context that enables:
- **AI-Generated Content**: Context-aware control descriptions and remediation guidance
- **Framework Alignment**: Proper control naming and descriptions matching official frameworks
- **Business Contextualization**: How controls apply to the specific client's business

### Questionnaire Structure

#### 1. Business Context Questionnaire

**Gathered During Onboarding** (stored in `questionnaire_responses` table):

1. **Infrastructure Type**:
   - Cloud-Only / On-Premises Only / Hybrid
   - Cloud Providers: AWS, Azure, GCP (multi-select)
   - Number of on-premises servers (if applicable)

2. **Business Model**:
   - SaaS Provider
   - Healthcare Provider
   - Managed Services
   - E-Commerce
   - Financial Services
   - Consulting
   - Other (with description)

3. **Data Types Handled** (if applicable):
   - PHI (Protected Health Information)
   - PII (Personally Identifiable Information)
   - Financial Data
   - PCI Data
   - Other Sensitive Data

4. **HIPAA-Specific** (if HIPAA framework assigned):
   - Entity Type: Covered Entity / Business Associate / Both / Unknown
   - Types of PHI handled
   - Patient data volume

5. **Security Posture**:
   - Existing security team size
   - Current compliance certifications
   - Previous audit experience

#### 2. Technical Assessment Questionnaire

**Optional but Recommended**:

1. **Current Security Tools**:
   - SIEM solutions
   - Vulnerability scanners
   - Access management tools
   - Encryption tools

2. **Compliance History**:
   - Previous frameworks attempted
   - Current compliance status
   - Known gaps or concerns

3. **Remediation Capacity**:
   - IT team size
   - Security team availability
   - Budget for remediation
   - Timeline expectations

### Questionnaire Storage

**Database Schema**:
```sql
questionnaire_responses
  id (PK)
  client_id (FK → clients.id)
  questionnaire_type (business_context, technical_assessment, onboarding)
  responses (JSONB - structured responses)
  created_at, updated_at
```

**Response Format** (JSONB):
```json
{
  "infrastructure_type": "hybrid",
  "cloud_providers": ["aws", "azure"],
  "business_model": "saas_provider",
  "data_types": ["phi", "pii"],
  "hipaa_entity_type": "business_associate",
  ...
}
```

### Questionnaire UI

**Multi-Step Form**:
- Step 1: Basic Information
- Step 2: Business Context
- Step 3: Technical Assessment (optional)
- Step 4: Review & Submit

**Features**:
- Progress indicator
- Save draft functionality
- Validation per step
- Skip optional sections

---

## Compliance Scanning Workflow

### Overview

This section details how Steampipe/Powerpipe scans are executed and how results flow into the database.

### Scan Execution Process

### Scan Execution Flow (Steampipe/Powerpipe)

1. **Pre-Scan Setup**:
   - Retrieve client's `credentials` from database
   - Decrypt credentials
   - Configure Steampipe with client credentials (via config or environment)
   - Create `compliance_check` record with status `in_progress`
   - Store assigned frameworks from `clients.assigned_frameworks`

2. **Powerpipe Execution**:
   - For each framework in `assigned_frameworks`:
     - Map framework to Powerpipe benchmark name:
       - HIPAA → `aws_compliance.benchmark.hipaa` (or azure/gcp variant)
       - SOC2 → `aws_compliance.benchmark.soc_2`
       - ISO27001 → `aws_compliance.benchmark.iso_27001`
       - etc.
     - Execute: `docker exec powerpipe powerpipe benchmark run <benchmark_name> --output json`
     - Powerpipe connects to Steampipe service (port 9193)
     - Steampipe queries cloud APIs using client credentials
     - Powerpipe evaluates controls and returns JSON

3. **Powerpipe Output Parsing**:
   - Parse JSON output from Powerpipe
   - Extract benchmark summary:
     - `summary.total` → `compliance_checks.total_controls`
     - `summary.passed` → `compliance_checks.passed_controls`
     - `summary.failed` → `compliance_checks.failed_controls`
   - For each control in `controls` array:
     - Extract `control_id`, `title`, `description`, `status`, `reason`, `resources`
     - Map to `findings` table fields

4. **Database Storage**:
   - Update `compliance_check` with totals and status `completed`
   - Create `findings` record for each control:
     - Store Powerpipe control metadata
     - Set `scan_status` from Powerpipe `status` (pass/fail/error/skip)
     - Set `remediation_status` = `open` if failed, `resolved` if passed
     - Generate AI context (business context, remediation guidance)
   - Store raw Powerpipe JSON in `compliance_checks.powerpipe_output` (optional, for debugging)

5. **Post-Scan**:
   - Update dashboard metrics
   - Trigger notifications (future)
   - Mark check as `completed`

### Framework to Powerpipe Benchmark Mapping

The system maps client's `assigned_frameworks` to Powerpipe benchmark commands:

| Framework | AWS Benchmark | Azure Benchmark | GCP Benchmark |
|-----------|---------------|-----------------|---------------|
| HIPAA | `aws_compliance.benchmark.hipaa` | `azure_compliance.benchmark.hipaa` | `gcp_compliance.benchmark.hipaa` |
| SOC2 | `aws_compliance.benchmark.soc_2` | `azure_compliance.benchmark.soc_2` | `gcp_compliance.benchmark.soc_2` |
| ISO27001 | `aws_compliance.benchmark.iso_27001` | `azure_compliance.benchmark.iso_27001` | `gcp_compliance.benchmark.iso_27001` |
| CIS | `aws_compliance.benchmark.cis_v140` | `azure_compliance.benchmark.cis_v200` | `gcp_compliance.benchmark.cis_v200` |
| NIST | `aws_compliance.benchmark.nist_800_53_rev_5` | `azure_compliance.benchmark.nist_800_53_rev_5` | `gcp_compliance.benchmark.nist_800_53_rev_5` |
| PCI-DSS | `aws_compliance.benchmark.pci_dss_v321` | `azure_compliance.benchmark.pci_dss_v321` | `gcp_compliance.benchmark.pci_dss_v321` |

**Note**: The provider is determined from `credentials.provider` field.

### Credential Management for Steampipe

- **Storage**: Encrypted in `credentials` table (AES-256-GCM)
- **Usage**: Decrypted and passed to Steampipe when executing scans
- **Configuration**: Steampipe requires credentials in config file or environment variables
- **Test Connection**: Verify credentials work before running scans (test Steampipe query)
- **Multiple Providers**: Support AWS, Azure, GCP per client (multiple credentials per client)
- **Active/Inactive**: Toggle `credentials.is_active` to enable/disable scanning

---

## Control Metadata (From Powerpipe)

### Control Information from Powerpipe

All control metadata comes directly from Powerpipe benchmark output:

**Powerpipe Provides**:
- `control.control_id`: Control identifier (e.g., "hipaa_164_312_a_1", "CIS 1.4")
- `control.title`: Control title
- `control.description`: Control description
- `control.status`: pass/fail/error/skip
- `control.reason`: Why it failed/passed
- `control.resources`: Affected cloud resources

**Database Storage**:
- `findings.control_id`: From Powerpipe `control_id`
- `findings.control_title`: From Powerpipe `title`
- `findings.control_description`: From Powerpipe `description`
- `findings.scan_status`: From Powerpipe `status`
- `findings.scan_reason`: From Powerpipe `reason`
- `findings.scan_resources`: From Powerpipe `resources` (JSONB)
- `findings.framework`: Extracted from Powerpipe benchmark name

**Note**: Powerpipe benchmarks already include framework-aligned control information. No additional framework documentation registry needed.

---

## Findings & Remediation Tracking

### Finding States

**Scan Status** (from Powerpipe):
- `pass`: Control passed
- `fail`: Control failed
- `error`: Scan error occurred
- `skip`: Control was skipped

**Remediation Status** (tracking):
- `open`: Needs remediation (default for failures)
- `in_progress`: Work is ongoing
- `resolved`: Remediation complete

### Finding Data Model

Each finding contains:
- **Control Metadata**:
  - Official Control ID (e.g., "HIPAA 164.312(a)(1)")
  - Official Control Title (from framework)
  - Official Control Description (from framework)
  - Framework (HIPAA, SOC2, etc.)
  - Domain/Category (Access Control, Encryption, etc.)
  
- **Scan Results**:
  - Scan Status (pass/fail/error/skip)
  - Last Scan Date
  - Scan History (linked to compliance_checks)
  
- **Remediation Tracking**:
  - Remediation Status (open/in_progress/resolved)
  - Assigned Owner (optional)
  - AI-Generated Business Context (how control applies to client)
  - AI-Generated Remediation Guidance (specific steps for client)
  - Comments/Notes (optional)
  - Status History (timeline of changes)
  
- **Metadata**:
  - Created/Updated timestamps
  - Related Controls (if applicable)

### Remediation Workflow

1. **Scan completes** → Failed controls appear as `open`
2. **Client logs in** → Sees their organization's findings
3. **Update status** → Change to `in_progress` when work begins
4. **Add notes** → Record progress/comments
5. **Mark resolved** → Change to `resolved` when complete
6. **Next scan** → If control passes, status stays `resolved`; if still fails, reverts to `open`

### Owner Assignment

- Findings can be assigned to client owners/stakeholders
- Owners receive notifications (future)
- Assignment visible in finding details

---

## AI Content Generation

### Purpose

AI-generated content enhances the user experience by providing:
- **Business Context**: How each control applies to the specific client
- **Remediation Guidance**: Specific, actionable steps tailored to the client's infrastructure
- **Framework Descriptions**: Official framework control descriptions in client-friendly language

### AI Generation Sources

**Input Data**:
1. **Client Profile**:
   - Business description
   - Industry
   - Company size
   - Business model

2. **Questionnaire Responses**:
   - Infrastructure type
   - Cloud providers
   - Data types handled
   - Security posture

3. **Control Information**:
   - Official framework control ID
   - Official control description
   - Framework requirements

4. **Scan Results**:
   - Current status (pass/fail)
   - Historical scan data
   - Related controls

### AI-Generated Content Types

#### 1. Business Context Description

**Generated When**: Control is first created for a client

**Purpose**: Explain how this control applies to the client's specific business

**Example** (HIPAA Access Control for SaaS provider):
```
"Access Control (HIPAA 164.312(a)(1)) applies to your SaaS platform because you handle PHI as a Business Associate. This control ensures that only authorized users can access patient data stored in your cloud infrastructure. Given your AWS-based architecture, you'll need to implement IAM policies, MFA, and access logging."
```

**Generation Prompt Template**:
```
Given the client profile: [business description, industry, infrastructure]
And the control: [control ID, title, official description]
Generate a 2-3 sentence explanation of how this control specifically applies to this client's business, infrastructure, and compliance requirements.
```

#### 2. Remediation Guidance

**Generated When**: Control fails a scan

**Purpose**: Provide specific, actionable remediation steps

**Example** (Failed AWS S3 bucket encryption):
```
"To remediate this finding, you need to enable default encryption on your S3 buckets. For your AWS account [account-id], follow these steps:
1. Navigate to S3 in the AWS Console
2. Select each bucket that stores PHI
3. Go to Properties → Default encryption
4. Enable AES-256 encryption
5. Apply to all existing buckets and set as default for new buckets

Given your hybrid infrastructure, also ensure on-premises backups are encrypted using the same standard."
```

**Generation Prompt Template**:
```
Given the failed control: [control ID, title, description]
Client infrastructure: [cloud providers, on-prem details]
And the scan failure details: [what failed, resource affected]
Generate specific, step-by-step remediation guidance tailored to this client's infrastructure and business model.
```

#### 3. Control Descriptions (Enhanced)

**Generated When**: Control is first displayed to client

**Purpose**: Make official framework descriptions more accessible

**Example** (Simplified HIPAA description):
```
"Access Control (HIPAA 164.312(a)(1)) requires that you implement technical policies and procedures that allow only authorized persons to access electronic protected health information (ePHI). This means you need user authentication, role-based access controls, and audit logging for all systems that handle patient data."
```

### AI Implementation (MVP)

**Approach**:
1. Use LLM API (OpenAI, Anthropic, or similar)
2. Generate content on-demand (cache for performance)
3. Store generated content in database
4. Regenerate if client context changes significantly

**API Integration**:
- Environment variable for API key
- Configurable model (GPT-4, Claude, etc.)
- Rate limiting and error handling
- Fallback to generic descriptions if AI fails

**Caching Strategy**:
- Cache AI-generated content per client + control
- Invalidate cache when:
  - Client questionnaire responses change
  - Control status changes significantly
  - Framework definitions update

### Database Schema for AI Content

```sql
-- Add to findings table
findings
  ...
  ai_business_context (text, nullable)        -- Generated on first creation
  ai_remediation_guidance (text, nullable)    -- Generated on failure
  ai_content_generated_at (timestamp, nullable)
  ai_content_version (integer, default 1)     -- For cache invalidation
```

**Alternative Approach** (if storing separately):
```sql
-- Separate table for AI content
ai_content
  id (PK)
  finding_id (FK → findings.id)
  content_type (business_context, remediation_guidance)
  content (text)
  generated_at
  version (integer)
```

### AI Generation Workflow

1. **Control First Created**:
   - Generate business context description
   - Store in `findings.ai_business_context`
   - Cache for future use

2. **Control Fails Scan**:
   - Generate remediation guidance
   - Store in `findings.ai_remediation_guidance`
   - Update if context changed significantly

3. **Client Context Updates**:
   - Mark AI content as stale
   - Regenerate on next view or scan
   - Update version number

### Fallback Strategy

If AI generation fails:
- Use official framework description
- Provide generic remediation steps
- Log error for debugging
- Allow manual override/edit

---

## Multi-Tenant Dashboards

### Super Admin Dashboard

**View**: All clients, aggregate statistics

**Key Metrics**:
- Total clients
- Active scans
- Total findings (open/in_progress/resolved counts)
- Compliance percentage across all clients

**Features**:
- Client list with filters
- Quick access to client detail pages
- Run scans for any client
- View all findings across all clients

### Client Portal Dashboard

**View**: Only their organization's data

**Key Metrics**:
- Compliance percentage by framework (large, visual cards)
- Findings summary (open/in_progress/resolved) with breakdown charts
- Recent scans with status indicators
- Recent findings with quick actions

**Visual Organization**:
- Framework tabs or sections
- Grouped by domain/category
- Filterable and searchable
- Status-based views (All, Open, In Progress, Resolved)

**Access Restrictions**:
- Cannot view other organizations
- Cannot modify assigned frameworks
- Cannot run scans (Super Admin only)
- Can update remediation status and add notes
- Can view AI-generated guidance and context

### Authentication

**MVP Authentication**:
- Simple email/password authentication
- Super Admin: Full access
- Client User: Restricted to their organization
- Session management (JWT or session-based)

**Future Enhancements**:
- SSO integration
- Role-based access control (RBAC)
- Multi-factor authentication (MFA)

---

## Basic Reporting

### Report Types (MVP)

1. **Compliance Summary Report**
   - Compliance percentage by framework
   - Findings breakdown (pass/fail counts)
   - Recent scan results
   - Export as PDF or CSV

2. **Findings Report**
   - List of all findings (open/in_progress/resolved)
   - Filter by framework, status, owner
   - Export as CSV

### Report Generation

**Simple Approach**:
- Generate reports server-side (Express API)
- Use basic templating (Handlebars or similar)
- Export as PDF (using Puppeteer for HTML → PDF)
- Store reports in `reports` table

**Report Contents**:
- Client information
- Assigned frameworks
- Compliance percentages
- Findings list with status
- Scan history

**Future Enhancements**:
- AI-powered narrative reports
- Custom report templates
- Scheduled report generation

---

**Note**: Full database schema is documented in the [Database Schema](#database-schema-steampipepowerpipe-data-flow) section above.

---

## Fresh Build Guide

### Project Setup Instructions

This section provides specific guidance for building the MVP from scratch in a new Cursor project.

#### 1. Project Structure

```
launchsecure-app/
├── platform/
│   ├── admin-panel/          # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # Next.js app router
│   │   │   │   ├── api/       # API routes (Next.js API)
│   │   │   │   ├── clients/   # Client management pages
│   │   │   │   ├── dashboard/ # Dashboards
│   │   │   │   └── findings/  # Findings pages
│   │   │   └── lib/           # Utilities (db, crypto)
│   │   └── package.json
│   ├── orchestrator/          # Express API backend
│   │   ├── src/
│   │   │   ├── api/           # API routes
│   │   │   ├── lib/           # Core logic
│   │   │   │   ├── steampipe.ts      # Steampipe integration
│   │   │   │   ├── powerpipe.ts      # Powerpipe execution
│   │   │   │   ├── database.ts       # DB utilities
│   │   │   │   └── crypto.ts         # Encryption
│   │   │   └── index.ts       # Express server
│   │   └── package.json
│   ├── database/
│   │   ├── init.sql           # Database schema
│   │   └── migrations/        # Migration files
│   ├── steampipe/             # Steampipe Docker setup
│   │   └── Dockerfile
│   └── powerpipe/             # Powerpipe Docker setup
│       └── Dockerfile
├── docker-compose.yml          # All services
└── PRODUCT_SPECIFICATION.md    # This file
```

#### 2. Docker Services

**Required Services**:
1. `postgres` - PostgreSQL 15
2. `steampipe` - Steampipe service
3. `powerpipe` - Powerpipe container
4. `orchestrator` - Express API (Node.js)
5. `admin-panel` - Next.js frontend

**Key Configuration**:
- Steampipe runs as service on port 9193
- Powerpipe executes benchmarks via `docker exec` into powerpipe container
- All services communicate via Docker network
- Volumes for evidence/reports storage

#### 3. Development Order

**Phase 1: Foundation**
1. Set up Docker Compose with all services
2. Create database schema (init.sql)
3. Build basic Express API with client CRUD
4. Build basic Next.js UI for client management
5. Test database connection and basic operations

**Phase 2: Scanning**
1. Integrate Steampipe connection (test with simple query)
2. Integrate Powerpipe execution (run benchmark via docker exec)
3. Parse Powerpipe JSON output
4. Store results in database as findings
5. Build UI to display findings

**Phase 3: Multi-Tenant**
1. Implement authentication (email/password)
2. Build Super Admin dashboard (all clients)
3. Build Client Portal dashboard (single org)
4. Implement access control (client users see only their org)

**Phase 4: Remediation**
1. Build findings detail page
2. Add remediation status update
3. Add owner assignment
4. Add notes/comments

**Phase 5: Reporting**
1. Build simple compliance summary report
2. Add PDF export
3. Add CSV export

#### 4. Key Implementation Notes

**Steampipe Integration**:
- Connect to Steampipe service via HTTP (port 9193)
- Use Steampipe Query API for direct queries
- For Powerpipe, use Steampipe as data source

**Powerpipe Execution**:
- Execute benchmarks via `docker exec` into powerpipe container
- Command: `powerpipe benchmark run <benchmark_name> --output json`
- Parse JSON output to extract control results
- Map results to findings table

**Credential Management**:
- Encrypt credentials using AES-256-GCM
- Store encryption key in environment variable
- Never log credentials
- Test connection before storing

**Database Migrations**:
- Use migration files for schema changes
- Always include `created_at` and `updated_at` timestamps
- Add indexes for frequently queried columns

**API Design**:
- RESTful endpoints
- Consistent error responses
- Input validation on all endpoints
- Pagination for list endpoints

#### 5. Cursor-Specific Prompts

When building in Cursor, use these prompts:

**For Database Setup**:
```
Create the database schema for LaunchSecure MVP with tables: clients, credentials, compliance_checks, findings, client_owners, client_users, reports. Include proper foreign keys, indexes, and timestamps.
```

**For Steampipe Integration**:
```
Create a TypeScript module to connect to Steampipe service (port 9193). Steampipe runs as a service that accepts SQL queries via HTTP and returns JSON. Use it to query cloud APIs using client credentials. Include error handling and connection pooling.
```

**For Powerpipe Execution**:
```
Create a TypeScript module to execute Powerpipe benchmarks via docker exec into powerpipe container. Powerpipe connects to Steampipe service (port 9193) to query cloud APIs. Parse Powerpipe JSON output and map to findings table: control_id, control_title, control_description, scan_status (from control.status), scan_reason, scan_resources. Store in compliance_checks and findings tables.
```

**For Client Management API**:
```
Create Express API routes for client CRUD operations. Include validation, encryption for credentials, and proper error handling.
```

**For Multi-Tenant Auth**:
```
Implement simple email/password authentication with JWT tokens. Super admin can access all clients, client users can only access their own organization.
```

**For Dashboard**:
```
Build a Next.js dashboard page that shows compliance metrics, findings summary, and recent scans. Support both super admin (all clients) and client user (single org) views. Use Vanta-inspired design with card-based layout, color-coded status indicators, and organized control lists grouped by framework and domain.
```

**For Control Organization**:
```
Create a findings display component that organizes controls by framework and domain. Display official control IDs, titles, and descriptions. Include AI-generated business context and remediation guidance. Use modern card-based layout with expandable sections.
```

**For AI Content Generation**:
```
Create a service to generate AI-powered business context and remediation guidance for controls. Use client questionnaire responses and business profile as context. Cache generated content and regenerate when client context changes.
```

**For Client Onboarding**:
```
Build a multi-step questionnaire form for client onboarding. Collect business context, infrastructure details, and compliance history. Store responses in questionnaire_responses table for AI content generation.
```

#### 6. Testing Approach

**Manual Testing Checklist**:
1. ✅ Create client via UI
2. ✅ Add API credentials (AWS/Azure/GCP)
3. ✅ Test credential connection
4. ✅ Run compliance scan (Powerpipe benchmark)
5. ✅ View findings in UI
6. ✅ Client login and access portal
7. ✅ Update remediation status
8. ✅ Generate report

**Key Test Scenarios**:
- Create client with multiple frameworks
- Run scan with invalid credentials (should fail gracefully)
- Run scan with valid credentials (should create findings)
- Client user can only see their org
- Super admin can see all clients
- Remediation status updates correctly

#### 7. What NOT to Build (Yet)

**Excluded from MVP**:
- Manual controls (not part of Steampipe/Powerpipe)
- Evidence upload/management (future)
- Complex notifications (future)
- Advanced AI-powered narrative reports (basic AI guidance included)
- Scheduled scans (build basic cron later)
- Advanced RBAC (simple auth only)
- **Any other scanning tools** (Steampipe/Powerpipe are the only scanning tools)
- Complex integrations (Jira, Slack, etc.)

**Included in MVP** (Modern Approach):
- ✅ Vanta-inspired organized visual UI
- ✅ Framework-aligned control naming and descriptions
- ✅ AI-generated business context for controls
- ✅ AI-generated remediation guidance
- ✅ Client onboarding questionnaires
- ✅ Organized control lists by framework/domain

**Focus**:
- Prove core functionality works
- Steampipe/Powerpipe integration solid
- Multi-tenant isolation works
- Basic remediation tracking works
- Simple reports work

---

## Development Guidelines

### Code Standards

- **TypeScript**: Strict type checking enabled
- **Error Handling**: Comprehensive try-catch with logging
- **Validation**: Input validation on all API endpoints
- **Security**: Never log sensitive data, encrypt credentials
- **Testing**: Manual testing for MVP, unit tests later

### Database Practices

- **Migrations**: Always use migration files for schema changes
- **Indexes**: Add indexes for frequently queried columns
- **Timestamps**: Always include `created_at`, `updated_at`
- **Foreign Keys**: Use proper foreign key constraints

### API Design

- **RESTful**: Follow REST conventions
- **Error Responses**: Consistent error format
- **Pagination**: Paginate large result sets
- **Filtering**: Support filtering by framework, status, etc.

### UI/UX Principles

- **Modern Design**: Vanta-inspired organized visual approach
- **Framework Alignment**: Official control naming and descriptions
- **Visual Hierarchy**: Clear organization by framework, domain, and category
- **Status Indicators**: Color-coded badges and progress indicators
- **Clarity**: Clear labeling and instructions
- **Feedback**: Loading states and success messages
- **Validation**: Inline form validation
- **Responsive**: Mobile-friendly design with collapsible sections
- **AI-Enhanced**: Context-aware content generation

---

## Terminology Reference

### Controls vs Findings

- **Control**: A requirement from a compliance framework (e.g., "CIS 1.4: Root account access keys should not exist")
- **Finding**: An instance of a control being checked with a result (pass/fail)

### Client vs Org

- Used interchangeably
- Refers to the organization/customer using the platform

### Remediation Status

- **Open**: Needs work (default for failures)
- **In Progress**: Work is ongoing
- **Resolved**: Work complete

---

## Change Log

### 2025-01-XX - Version 2.1 (Modern MVP with Vanta-Inspired Design)
- **Added Modern UI/UX**: Vanta-inspired organized visual approach
- **Added Framework Compliance**: Official control naming, descriptions, and organization
- **Added AI Content Generation**: Business context and remediation guidance
- **Added Client Questionnaires**: Onboarding questionnaires for AI context
- **Enhanced Control Metadata**: Domain, category, official framework information
- **Enhanced Findings Display**: Organized by framework/domain with AI-generated content
- Maintained MVP focus while building modern UX foundation

### 2025-01-XX - Version 2.0 (Simplified MVP)
- **Complete rewrite** for fresh build
- Removed all manual control references
- Removed all integrations outside Steampipe/Powerpipe
- Simplified to core MVP functionality
- Added Fresh Build Guide with Cursor-specific instructions
- Focused on proving core functionality before building advanced features

---

## Next Steps After MVP

Once MVP is proven and working:

1. **Add Manual Controls**: Rebuild manual control system with proper architecture
2. **Evidence Management**: Add evidence upload and expiration tracking
3. **Notifications**: Basic email notifications for scan completion, findings
4. **Scheduled Scans**: Cron-based scheduling for automated scans
5. **Advanced Reporting**: AI-powered narrative reports
6. **Enhanced Auth**: SSO, RBAC, MFA
7. **Additional Integrations**: Only after core is solid

---

**Remember**: This is an MVP. Build the simplest version that proves the core functionality works. Add complexity only after the foundation is solid.
