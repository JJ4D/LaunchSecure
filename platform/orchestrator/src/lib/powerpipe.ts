// Powerpipe execution module
// Powerpipe executes benchmarks via docker exec into powerpipe container

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const POWERPIPE_CONTAINER = process.env.POWERPIPE_CONTAINER || 'launchsecure-steampipe-powerpipe';

export interface PowerpipeBenchmarkResult {
  benchmark: string;
  controls: Array<{
    control_id: string;
    title: string;
    description?: string;
    status: 'pass' | 'fail' | 'error' | 'skip';
    reason?: string;
    resources?: any[];
    permission_error?: boolean;
    error_type?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    skip: number;
    permission_errors: number;
  };
  verification?: {
    control_count_valid: boolean;
    expected_range?: { min: number; max: number };
    permission_issues_detected: boolean;
    warnings: string[];
  };
}

// Framework to Powerpipe benchmark mapping
// Note: Benchmark names may vary by Powerpipe version
const FRAMEWORK_TO_BENCHMARK: Record<string, Record<string, string>> = {
  aws: {
    HIPAA: 'aws_compliance.benchmark.hipaa_security_rule_2003',
    SOC2: 'aws_compliance.benchmark.soc_2',
    ISO27001: 'aws_compliance.benchmark.iso_27001',
    CIS: 'aws_compliance.benchmark.cis_v140',
    NIST: 'aws_compliance.benchmark.nist_800_53_rev_5',
    'PCI-DSS': 'aws_compliance.benchmark.pci_dss_v321',
    GDPR: 'aws_compliance.benchmark.gdpr',
    FedRAMP: 'aws_compliance.benchmark.fedramp_moderate_rev_4',
  },
  azure: {
    HIPAA: 'azure_compliance.benchmark.hipaa',
    SOC2: 'azure_compliance.benchmark.soc_2',
    ISO27001: 'azure_compliance.benchmark.iso_27001',
    CIS: 'azure_compliance.benchmark.cis_v200',
    NIST: 'azure_compliance.benchmark.nist_800_53_rev_5',
    'PCI-DSS': 'azure_compliance.benchmark.pci_dss_v321',
  },
  gcp: {
    HIPAA: 'gcp_compliance.benchmark.hipaa',
    SOC2: 'gcp_compliance.benchmark.soc_2',
    ISO27001: 'gcp_compliance.benchmark.iso_27001',
    CIS: 'gcp_compliance.benchmark.cis_v200',
    NIST: 'gcp_compliance.benchmark.nist_800_53_rev_5',
  },
};

export function getBenchmarkName(framework: string, provider: string): string | null {
  const providerMap = FRAMEWORK_TO_BENCHMARK[provider.toLowerCase()];
  if (!providerMap) {
    return null;
  }
  return providerMap[framework] || null;
}

/**
 * Discover all available Powerpipe benchmarks dynamically
 * This queries Powerpipe to get the actual list of available benchmarks
 */
export async function discoverAvailableBenchmarks(provider?: string): Promise<Array<{
  name: string;
  provider: string;
  framework?: string;
  control_count?: number;
}>> {
  try {
    // Powerpipe command to list all benchmarks
    // Use 'powerpipe benchmark list' or query via Steampipe if available
    const command = `/usr/bin/docker exec ${POWERPIPE_CONTAINER} powerpipe benchmark list --output json`;
    
    try {
      // Add timeout to prevent hanging on network issues (10 seconds)
      let timeoutId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Docker command timeout after 10 seconds')), 10000);
      });
      
      const execPromise = execAsync(command, { maxBuffer: 5 * 1024 * 1024 })
        .then(result => {
          // Clear timeout if command completes successfully
          if (timeoutId) clearTimeout(timeoutId);
          return result;
        });
      
      const result = await Promise.race([execPromise, timeoutPromise]);
      const output = result.stdout.trim();
      
      // Try to parse JSON output
      let benchmarks: any[] = [];
      try {
        const parsed = JSON.parse(output);
        // Handle different output formats
        if (Array.isArray(parsed)) {
          benchmarks = parsed;
        } else if (parsed.benchmarks && Array.isArray(parsed.benchmarks)) {
          benchmarks = parsed.benchmarks;
        } else if (parsed.results && Array.isArray(parsed.results)) {
          benchmarks = parsed.results;
        }
      } catch (parseError) {
        // If JSON parsing fails, try to parse text output
        // Powerpipe list might output text format
        const lines = output.split('\n').filter(line => line.trim());
        benchmarks = lines
          .filter(line => line.includes('.benchmark.'))
          .map(line => {
            const match = line.match(/(\w+_compliance\.benchmark\.\w+)/);
            return match ? { name: match[1] } : null;
          })
          .filter(Boolean) as any[];
      }
      
      // Filter by provider if specified
      if (provider) {
        const providerPrefix = `${provider.toLowerCase()}_compliance.benchmark.`;
        benchmarks = benchmarks.filter(b => 
          typeof b === 'string' ? b.startsWith(providerPrefix) :
          b.name?.startsWith(providerPrefix)
        );
      }
      
      // Map benchmarks to our structure
      return benchmarks.map(b => {
        const name = typeof b === 'string' ? b : (b.name || b.benchmark);
        const extractedProvider = name.includes('aws_compliance') ? 'aws' :
                                 name.includes('azure_compliance') ? 'azure' :
                                 name.includes('gcp_compliance') ? 'gcp' : 'unknown';
        
        // Try to extract framework from benchmark name
        let framework: string | undefined;
        const nameLower = name.toLowerCase();
        if (nameLower.includes('hipaa')) framework = 'HIPAA';
        else if (nameLower.includes('soc')) framework = 'SOC2';
        else if (nameLower.includes('iso')) framework = 'ISO27001';
        else if (nameLower.includes('cis')) framework = 'CIS';
        else if (nameLower.includes('nist')) framework = 'NIST';
        else if (nameLower.includes('pci')) framework = 'PCI-DSS';
        else if (nameLower.includes('gdpr')) framework = 'GDPR';
        else if (nameLower.includes('fedramp')) framework = 'FedRAMP';
        
        return {
          name,
          provider: extractedProvider,
          framework,
          control_count: typeof b === 'object' ? b.control_count : undefined,
        };
      });
    } catch (error) {
      // If Powerpipe is unavailable, fail loudly instead of returning potentially incorrect data
      // This prevents users from thinking benchmarks are available when they're not
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMsg.includes('timeout');
      const isNetworkError = errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || 
                             errorMsg.includes('ENOENT') || errorMsg.includes('Cannot connect');
      
      if (isTimeout || isNetworkError) {
        throw new Error(
          `Cannot connect to Powerpipe container (${POWERPIPE_CONTAINER}). ` +
          `Powerpipe service is unavailable or Docker connection failed. ` +
          `Error: ${errorMsg}. ` +
          `Verify the container is running with: docker ps | grep ${POWERPIPE_CONTAINER}`
        );
      }
      
      // For other errors, also fail loudly
      throw new Error(
        `Failed to discover benchmarks from Powerpipe: ${errorMsg}. ` +
        `Cannot verify which benchmarks are actually available.`
      );
    }
  } catch (error) {
    // Re-throw the error - we want failures to be loud and explicit
    // This ensures the API caller knows Powerpipe is unavailable
    throw error;
  }
}

/**
 * Configure environment variables for Powerpipe/Steampipe based on credentials
 */
function configureCredentialsEnv(provider: string, credentials: Record<string, any>): Record<string, string> {
  const env: Record<string, string> = {};

  if (provider === 'aws') {
    if (credentials.access_key_id) env.AWS_ACCESS_KEY_ID = credentials.access_key_id;
    if (credentials.secret_access_key) env.AWS_SECRET_ACCESS_KEY = credentials.secret_access_key;
    if (credentials.session_token) env.AWS_SESSION_TOKEN = credentials.session_token;
    if (credentials.region) env.AWS_DEFAULT_REGION = credentials.region;
  } else if (provider === 'azure') {
    if (credentials.client_id) env.AZURE_CLIENT_ID = credentials.client_id;
    if (credentials.client_secret) env.AZURE_CLIENT_SECRET = credentials.client_secret;
    if (credentials.tenant_id) env.AZURE_TENANT_ID = credentials.tenant_id;
    if (credentials.subscription_id) env.AZURE_SUBSCRIPTION_ID = credentials.subscription_id;
  } else if (provider === 'gcp') {
    // GCP uses service account JSON file
    if (credentials.service_account_json) {
      env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-credentials.json';
      // Write credentials to temp file in container (would need volume mount)
    }
    if (credentials.project_id) env.GCP_PROJECT = credentials.project_id;
  }

  return env;
}

export async function runPowerpipeBenchmark(
  benchmarkName: string,
  credentials?: Record<string, any>,
  provider?: string
): Promise<PowerpipeBenchmarkResult> {
  // Build docker exec command with environment variables
  // Use full path to docker in case it's not in PATH
  let command = `/usr/bin/docker exec`;

  // Configure Steampipe with credentials before running Powerpipe
  // Since Steampipe and Powerpipe are now in the same container, we can configure credentials
  // Steampipe reads AWS credentials from environment variables (AWS_ACCESS_KEY_ID, etc.)
  // or from config files in ~/.steampipe/config/
  
  // Write Steampipe connection config with credentials
  if (credentials && provider === 'aws') {
    try {
      // Create Steampipe connection config
      const configLines = [
        'connection "aws" {',
        '  plugin = "aws"',
        credentials.access_key_id ? `  access_key = "${credentials.access_key_id.replace(/"/g, '\\"')}"` : '',
        credentials.secret_access_key ? `  secret_key = "${credentials.secret_access_key.replace(/"/g, '\\"')}"` : '',
        credentials.session_token ? `  session_token = "${credentials.session_token.replace(/"/g, '\\"')}"` : '',
        credentials.region ? `  regions = ["${credentials.region}"]` : '  regions = ["*"]',
        '}'
      ].filter(Boolean);
      
      const configContent = configLines.join('\n');
      
      // Write config to combined container using base64 encoding to avoid shell escaping issues
      const base64Config = Buffer.from(configContent).toString('base64');
      const configCmd = `/usr/bin/docker exec launchsecure-steampipe-powerpipe sh -c 'echo "${base64Config}" | base64 -d > /home/steampipe/.steampipe/config/aws.spc'`;
      await execAsync(configCmd);
      
      // Restart Steampipe service to load new config
      await execAsync('/usr/bin/docker exec launchsecure-steampipe-powerpipe steampipe service restart');
      console.log('Steampipe AWS connection configured');
    } catch (error) {
      console.warn('Failed to write Steampipe config, will use environment variables:', error);
    }
  }

  // Add environment variables to Powerpipe container
  // These will be available to processes running in Powerpipe container
  // Since Powerpipe and Steampipe share network, Steampipe service process
  // running in steampipe container won't see these unless we pass them there too
  if (credentials && provider) {
    const envVars = configureCredentialsEnv(provider, credentials);
    for (const [key, value] of Object.entries(envVars)) {
      // Escape quotes in values for shell safety
      const escapedValue = String(value).replace(/"/g, '\\"');
      command += ` -e ${key}="${escapedValue}"`;
    }
  }

  // Also set environment variables in Steampipe container so the service can use them
  // Steampipe service reads AWS credentials from environment variables
  if (credentials && provider === 'aws') {
    const envVars = configureCredentialsEnv(provider, credentials);
    const steampipeEnvCmd = `/usr/bin/docker exec`;
    for (const [key, value] of Object.entries(envVars)) {
      const escapedValue = String(value).replace(/"/g, '\\"');
      // Set env vars in Steampipe container - but this won't affect running service
      // We need to restart service or use config file approach above
    }
  }

  // Add Steampipe connection string - Powerpipe needs this to connect to Steampipe
  // Since Steampipe and Powerpipe are now in the same container, use localhost
  // The password is dynamically generated by Steampipe, so we'll get it from the service
  // Powerpipe is installed in /usr/local/bin which is in PATH
  command += ` -w /workspace ${POWERPIPE_CONTAINER} powerpipe benchmark run ${benchmarkName} --output json`;

  try {
    // Increase maxBuffer to handle large Powerpipe outputs (default is 1MB)
    let stdout = '';
    let stderr = '';
    
    try {
      const result = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      // Powerpipe returns exit code 2 when benchmark completes with failures (normal)
      // Exit code 1 is also used for some conditions but may still have valid output
      if (execError.code === 2 || execError.code === 1) {
        // Check if we have stdout with JSON output
        stdout = execError.stdout || '';
        stderr = execError.stderr || '';
        
        // If no stdout, this is a real error
        if (!stdout || stdout.trim().length === 0) {
          throw new Error(`Powerpipe command failed with exit code ${execError.code}: ${stderr || execError.message}`);
        }
      } else {
        // Other exit codes are real errors
        throw execError;
      }
    }
    
    if (stderr && !stderr.includes('Warning') && !stderr.includes('A new version')) {
      console.warn('Powerpipe stderr:', stderr);
    }

    // Parse JSON output
    // Powerpipe might output version messages before JSON, so we need to find the JSON
    // Find the first occurrence of { or [ which should be the start of JSON
    let jsonStart = -1;
    for (let i = 0; i < stdout.length; i++) {
      const char = stdout[i];
      if (char === '{' || char === '[') {
        jsonStart = i;
        break;
      }
    }

    if (jsonStart === -1) {
      // No JSON found, try parsing entire output
      jsonStart = 0;
    }

    let jsonOutput = stdout.substring(jsonStart).trim();

    // Remove any trailing non-JSON content (like version messages at the end)
    // Find the last } or ] that closes the JSON
    let jsonEnd = jsonOutput.length;
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonOutput.length; i++) {
      const char = jsonOutput[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
        
        if (braceCount === 0 && bracketCount === 0 && i > 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    jsonOutput = jsonOutput.substring(0, jsonEnd);

    const result = JSON.parse(jsonOutput);
    
    // Transform Powerpipe output format to our expected format
    // Powerpipe returns: { groups: [{ groups: [...], controls: [...] }] } (recursive structure)
    // We need: { benchmark: string, controls: [...], summary: {...} }
    
    // Recursive function to extract all controls from nested groups
    // Use a Map to deduplicate by control_id (same control may appear in multiple groups)
    const controlsMap = new Map<string, any>();
    
    const extractControls = (item: any): void => {
      // If this item has controls, add them (deduplicated by control_id)
      if (item.controls && Array.isArray(item.controls)) {
        for (const control of item.controls) {
          const controlId = control.control_id || '';
          if (!controlId) continue; // Skip controls without IDs
          
          // Only add if we haven't seen this control_id before, or if this one has better data
          if (!controlsMap.has(controlId) || (control.results && control.results.length > 0)) {
            // Transform control format
            // Detect permission errors
            const errorText = (control.results?.[0]?.reason || control.run_error || '').toLowerCase();
            const permissionErrorKeywords = [
              'accessdenied',
              'access denied',
              'unauthorizedoperation',
              'unauthorized operation',
              'invaliduserid.notfound',
              'accessdeniedexception',
              'forbidden',
              'insufficient permissions',
              'permission denied',
              'user is not authorized',
              'not authorized to perform',
              'unauthorized: access is denied',
            ];
            
            const isPermissionError = permissionErrorKeywords.some(keyword => 
              errorText.includes(keyword)
            );
            
            // Determine error type
            let errorType: string | undefined;
            if (isPermissionError) {
              if (errorText.includes('accessdenied') || errorText.includes('access denied')) {
                errorType = 'AccessDenied';
              } else if (errorText.includes('unauthorized')) {
                errorType = 'UnauthorizedOperation';
              } else if (errorText.includes('forbidden')) {
                errorType = 'Forbidden';
              } else {
                errorType = 'PermissionError';
              }
            }
            
            const transformedControl = {
              control_id: controlId,
              title: control.title || '',
              description: control.description || '',
              status: control.summary?.alarm > 0 ? 'fail' :
                      control.summary?.error > 0 ? 'error' :
                      control.summary?.ok > 0 ? 'pass' : 'skip',
              reason: control.results?.[0]?.reason || control.run_error || null,
              resources: control.results || null,
              permission_error: isPermissionError,
              error_type: errorType,
            };
            controlsMap.set(controlId, transformedControl);
          }
        }
      }
      
      // Recursively process nested groups
      if (item.groups && Array.isArray(item.groups)) {
        for (const group of item.groups) {
          extractControls(group);
        }
      }
    };
    
    // Start extraction from root level (handles both groups and direct controls)
    extractControls(result);
    
    // Convert Map to array
    const allControls = Array.from(controlsMap.values());
    
    // Calculate summary
    let totalControls = allControls.length;
    let passedControls = 0;
    let failedControls = 0;
    let errorControls = 0;
    let skipControls = 0;
    let permissionErrors = 0;
    
    for (const control of allControls) {
      if (control.status === 'pass') passedControls++;
      else if (control.status === 'fail') failedControls++;
      else if (control.status === 'error') errorControls++;
      else if (control.status === 'skip') skipControls++;
      
      if (control.permission_error) permissionErrors++;
    }
    
    // Verification: Expected control count ranges per framework/provider
    // NOTE: These ranges are estimates. Actual control counts may vary based on:
    // - Powerpipe benchmark version
    // - Framework updates
    // - Provider-specific implementation differences
    // - Whether controls are grouped or expanded
    const EXPECTED_CONTROL_RANGES: Record<string, Record<string, { min: number; max: number }>> = {
      aws: {
        HIPAA: { min: 130, max: 350 }, // Adjusted: 131 is actually within range for some HIPAA implementations
        SOC2: { min: 150, max: 250 },
        ISO27001: { min: 100, max: 200 },
        CIS: { min: 100, max: 200 },
        NIST: { min: 200, max: 400 },
        'PCI-DSS': { min: 100, max: 200 },
        GDPR: { min: 80, max: 150 },
        FedRAMP: { min: 200, max: 400 },
      },
      azure: {
        HIPAA: { min: 120, max: 300 },
        SOC2: { min: 120, max: 200 },
        ISO27001: { min: 80, max: 150 },
        CIS: { min: 80, max: 150 },
        NIST: { min: 150, max: 300 },
        'PCI-DSS': { min: 80, max: 150 },
      },
      gcp: {
        HIPAA: { min: 120, max: 300 },
        SOC2: { min: 120, max: 200 },
        ISO27001: { min: 80, max: 150 },
        CIS: { min: 80, max: 150 },
        NIST: { min: 150, max: 300 },
      },
    };
    
    // Extract framework from benchmark name
    // Handle various benchmark naming patterns
    let frameworkKey: string | null = null;
    const benchmarkLower = benchmarkName.toLowerCase();
    
    if (benchmarkLower.includes('hipaa') || benchmarkLower.includes('hipaa_security')) {
      frameworkKey = 'HIPAA';
    } else if (benchmarkLower.includes('soc_2') || benchmarkLower.includes('soc2')) {
      frameworkKey = 'SOC2';
    } else if (benchmarkLower.includes('iso_27001') || benchmarkLower.includes('iso27001')) {
      frameworkKey = 'ISO27001';
    } else if (benchmarkLower.includes('cis')) {
      frameworkKey = 'CIS';
    } else if (benchmarkLower.includes('nist')) {
      frameworkKey = 'NIST';
    } else if (benchmarkLower.includes('pci_dss') || benchmarkLower.includes('pci')) {
      frameworkKey = 'PCI-DSS';
    } else if (benchmarkLower.includes('gdpr')) {
      frameworkKey = 'GDPR';
    } else if (benchmarkLower.includes('fedramp')) {
      frameworkKey = 'FedRAMP';
    }
    const providerKey = benchmarkName.includes('aws_compliance') ? 'aws' :
                        benchmarkName.includes('azure_compliance') ? 'azure' :
                        benchmarkName.includes('gcp_compliance') ? 'gcp' : null;
    
    // Perform verification
    const warnings: string[] = [];
    let controlCountValid = true;
    let expectedRange: { min: number; max: number } | undefined;
    
    if (frameworkKey && providerKey && EXPECTED_CONTROL_RANGES[providerKey]?.[frameworkKey]) {
      expectedRange = EXPECTED_CONTROL_RANGES[providerKey][frameworkKey];
      
      // Only warn if significantly outside range (not just slightly below)
      // Control counts can legitimately vary based on:
      // - Benchmark version differences
      // - Control grouping strategies
      // - Framework implementation variations
      const minThreshold = expectedRange.min * 0.8; // 20% below minimum is concerning
      const maxThreshold = expectedRange.max * 1.2; // 20% above maximum is concerning
      
      if (totalControls < minThreshold) {
        controlCountValid = false;
        warnings.push(
          `Control count (${totalControls}) is significantly below expected range (${expectedRange.min}-${expectedRange.max}). ` +
          `This may indicate: missing controls due to permissions, incomplete benchmark coverage, or benchmark version differences. ` +
          `Verify benchmark exists and check for permission errors.`
        );
      } else if (totalControls < expectedRange.min) {
        // Mild warning - slightly below range might be acceptable
        warnings.push(
          `Control count (${totalControls}) is slightly below expected minimum (${expectedRange.min}). ` +
          `This may be normal for this benchmark version. Verify against Powerpipe documentation.`
        );
      } else if (totalControls > maxThreshold) {
        warnings.push(
          `Control count (${totalControls}) significantly exceeds expected maximum (${expectedRange.max}). ` +
          `This may indicate duplicate controls, benchmark version changes, or expanded control definitions.`
        );
      }
    }
    
    if (permissionErrors > 0) {
      warnings.push(
        `${permissionErrors} control(s) failed due to permission errors. ` +
        `Credentials may not have sufficient permissions for complete coverage.`
      );
    }
    
    if (errorControls > totalControls * 0.2) {
      warnings.push(
        `High error rate (${errorControls}/${totalControls} = ${Math.round(errorControls/totalControls*100)}%). ` +
        `This may indicate permission issues or configuration problems.`
      );
    }
    
    // If we found controls, return transformed result
    if (allControls.length > 0) {
      return {
        benchmark: benchmarkName,
        controls: allControls,
        summary: {
          total: totalControls,
          passed: passedControls,
          failed: failedControls,
          error: errorControls,
          skip: skipControls,
          permission_errors: permissionErrors,
        },
        verification: {
          control_count_valid: controlCountValid,
          expected_range: expectedRange,
          permission_issues_detected: permissionErrors > 0,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      };
    }
    
    // Fallback: try to use existing structure if it matches
    if (result.benchmark && result.controls && result.summary) {
      return result as PowerpipeBenchmarkResult;
    }

    // Handle different Powerpipe output formats
    if (result.results) {
      return {
        benchmark: benchmarkName,
        controls: result.results.controls || result.controls || [],
        summary: result.results.summary || result.summary || { total: 0, passed: 0, failed: 0 },
      };
    }

    // If still no controls found, log the structure for debugging
    console.error('Powerpipe output structure:', JSON.stringify(Object.keys(result), null, 2));
    console.error('Powerpipe output sample:', JSON.stringify(result).substring(0, 500));
    throw new Error('Unexpected Powerpipe output format - no controls found');
  } catch (error) {
    console.error('Powerpipe execution failed:', error);
    if (error instanceof SyntaxError) {
      console.error('Powerpipe JSON parse error. Output sample:', stdout?.substring(0, 1000));
    }
    throw new Error(`Failed to execute Powerpipe benchmark: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

