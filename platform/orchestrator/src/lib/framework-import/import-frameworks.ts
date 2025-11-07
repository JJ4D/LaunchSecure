import { db } from '../database';

interface FrameworkControlInput {
  framework: string;
  framework_version: string;
  control_id: string;
  control_title: string;
  control_description?: string;
  control_category?: string;
  control_type?: 'automated' | 'manual' | 'hybrid';
  evidence_required?: string[];
  applicable_providers?: string[];
  requirement_type?: string;
  official_source_url?: string;
  official_source_text?: string;
  metadata?: Record<string, any>;
}

const HIPAA_CONTROLS: FrameworkControlInput[] = [
  {
    framework: 'HIPAA',
    framework_version: '2003',
    control_id: '164.312(a)(1)',
    control_title: 'Access Control',
    control_description:
      'Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to those persons or software programs that have been granted access rights.',
    control_category: 'Technical Safeguards',
    control_type: 'hybrid',
    evidence_required: ['technical_scan', 'policy_upload', 'self_attestation'],
    official_source_url:
      'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312',
    metadata: {
      citation: '45 CFR §164.312(a)(1)',
    },
  },
  {
    framework: 'HIPAA',
    framework_version: '2003',
    control_id: '164.308(a)(5)(i)',
    control_title: 'Security Awareness and Training',
    control_description:
      'Implement a security awareness and training program for all members of the workforce (including management).',
    control_category: 'Administrative Safeguards',
    control_type: 'manual',
    evidence_required: ['training_record', 'policy_upload'],
    official_source_url:
      'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.308',
    metadata: {
      citation: '45 CFR §164.308(a)(5)(i)',
    },
  },
];

const SOC2_CONTROLS: FrameworkControlInput[] = [
  {
    framework: 'SOC2',
    framework_version: 'TSC 2017',
    control_id: 'CC1.1',
    control_title: 'Control Environment',
    control_description:
      'The entity demonstrates a commitment to integrity and ethical values.',
    control_category: 'Common Criteria',
    control_type: 'manual',
    evidence_required: ['policy_upload', 'self_attestation'],
    official_source_url: 'https://www.aicpa.org/topic/audit-assurance/trust-services-criteria',
    metadata: {
      trust_services_category: 'Common Criteria',
    },
  },
  {
    framework: 'SOC2',
    framework_version: 'TSC 2017',
    control_id: 'CC6.6',
    control_title: 'Logical Access - Monitoring',
    control_description:
      'The entity implements logical access security measures to protect against threats from sources outside its system boundaries.',
    control_category: 'Logical and Physical Access',
    control_type: 'hybrid',
    evidence_required: ['technical_scan', 'self_attestation'],
    official_source_url: 'https://www.aicpa.org/topic/audit-assurance/trust-services-criteria',
    metadata: {
      trust_services_category: 'Security',
    },
  },
];

const ISO27001_CONTROLS: FrameworkControlInput[] = [
  {
    framework: 'ISO27001',
    framework_version: '2022',
    control_id: 'A.5.1',
    control_title: 'Policies for Information Security',
    control_description:
      'Information security policies shall be defined, approved by management, published and communicated to employees and relevant external parties.',
    control_category: 'Organizational Controls',
    control_type: 'manual',
    evidence_required: ['policy_upload', 'self_attestation'],
    official_source_url: 'https://www.iso.org/standard/82875.html',
  },
  {
    framework: 'ISO27001',
    framework_version: '2022',
    control_id: 'A.8.8',
    control_title: 'Management of Technical Vulnerabilities',
    control_description:
      'Information about technical vulnerabilities of information systems being used shall be obtained, the organization’s exposure to such vulnerabilities evaluated and appropriate measures taken.',
    control_category: 'Technological Controls',
    control_type: 'hybrid',
    evidence_required: ['technical_scan', 'self_attestation'],
    official_source_url: 'https://www.iso.org/standard/82875.html',
  },
];

const CONTROL_DATA: FrameworkControlInput[] = [
  ...HIPAA_CONTROLS,
  ...SOC2_CONTROLS,
  ...ISO27001_CONTROLS,
];

export async function importFrameworkControls() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    for (const control of CONTROL_DATA) {
      await client.query(
        `INSERT INTO framework_controls (
          framework,
          framework_version,
          control_id,
          control_title,
          control_description,
          control_category,
          control_type,
          evidence_required,
          applicable_providers,
          requirement_type,
          official_source_url,
          official_source_text,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12
        )
        ON CONFLICT (framework, framework_version, control_id)
        DO UPDATE SET
          control_title = EXCLUDED.control_title,
          control_description = EXCLUDED.control_description,
          control_category = EXCLUDED.control_category,
          control_type = EXCLUDED.control_type,
          evidence_required = EXCLUDED.evidence_required,
          applicable_providers = EXCLUDED.applicable_providers,
          requirement_type = EXCLUDED.requirement_type,
          official_source_url = EXCLUDED.official_source_url,
          official_source_text = EXCLUDED.official_source_text,
          metadata = EXCLUDED.metadata,
          updated_at = NOW();
        `,
        [
          control.framework,
          control.framework_version,
          control.control_id,
          control.control_title,
          control.control_description || null,
          control.control_category || null,
          control.control_type || 'automated',
          control.evidence_required || null,
          control.applicable_providers || ['aws', 'azure', 'gcp'],
          control.requirement_type || 'Required',
          control.official_source_url || null,
          control.official_source_text || null,
          control.metadata || null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to import framework controls:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function countFrameworkControls(): Promise<number> {
  const result = await db.query('SELECT COUNT(*) FROM framework_controls');
  return parseInt(result.rows[0]?.count || '0', 10);
}
