'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import dynamic from 'next/dynamic';

// Dynamically import chart component to avoid SSR issues
const ComplianceTrendChart = dynamic(
  () => import('@/components/ComplianceTrendChart'),
  { ssr: false }
);

interface Client {
  id: string;
  company_name: string;
  status: string;
}

interface DashboardMetrics {
  current: {
    total_clients: number;
    total_actionable_findings: number;
    total_passed: number;
    total_failed: number;
    total_errors: number;
    total_skips: number;
    total_controls: number;
    compliance_percentage: number;
  };
  trends: Array<{
    date: string;
    compliance_percentage: number | null;
    total_passed: number;
    total_failed: number;
    total_error: number;
    total_controls: number;
  }>;
  comparison: {
    current: {
      passed: number;
      failed: number;
      error: number;
      compliance_percentage: number | null;
    };
    days_30_ago: {
      passed: number;
      failed: number;
      error: number;
      compliance_percentage: number | null;
    };
    days_60_ago: {
      passed: number;
      failed: number;
      error: number;
      compliance_percentage: number | null;
    };
    days_90_ago: {
      passed: number;
      failed: number;
      error: number;
      compliance_percentage: number | null;
    };
  };
}

interface FrameworkCoverageSummary {
  framework: string;
  framework_version: string;
  total_controls: number;
  mapped_controls: number;
  unmapped_controls: number;
  unverified_controls: number;
  coverage_percentage: number | null;
  has_mismatch: boolean;
}

interface CoverageSummaryResponse {
  has_source_data: boolean;
  has_mismatch: boolean;
  frameworks: FrameworkCoverageSummary[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [coverageSummary, setCoverageSummary] = useState<CoverageSummaryResponse | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [selectedClientId]);

  const loadDashboard = async () => {
    try {
      const currentUser = await apiClient.getCurrentUser();
      setUser(currentUser);

      setCoverageSummary(null);
      setCoverageError(null);

      if (currentUser.role === 'super_admin') {
        const clientsData = await apiClient.getClients();
        setClients(clientsData);

        try {
          const summary = await apiClient.getCoverageSummary();
          setCoverageSummary(summary);
        } catch (summaryError) {
          console.warn('Failed to load framework coverage summary:', summaryError);
          setCoverageSummary(null);
          setCoverageError('Unable to verify benchmark coverage at the moment.');
        }
      } else {
        setClients([]);
      }

      const metricsData = await apiClient.getDashboardMetrics(
        selectedClientId || undefined,
        90
      );
      setMetrics(metricsData);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const calculateChange = (current: number | null, previous: number | null) => {
    if (current === null || previous === null) return null;
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'super_admin';
  const selectedClient = clients.find(c => c.id === selectedClientId);
  const current = metrics?.current;
  const comparison = metrics?.comparison;

  // Prepare chart data - filter out null compliance percentages and format dates
  const chartData = metrics?.trends
    .filter((d) => d.compliance_percentage !== null)
    .map((d) => ({
      date: formatDate(d.date),
      compliance: d.compliance_percentage,
      passed: d.total_passed,
      failed: d.total_failed,
    })) || [];

  const mismatchFrameworks = coverageSummary?.frameworks.filter((framework) => framework.has_mismatch) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">
              {selectedClientId 
                ? `Viewing data for ${selectedClient?.company_name || 'selected client'}`
                : isSuperAdmin 
                  ? 'Overview of all clients' 
                  : 'Overview of your compliance status'}
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-4">
              <label className="block text-sm font-medium text-gray-700">
                Filter by Client:
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="input-field min-w-[200px] bg-white border-gray-300 rounded-lg shadow-sm"
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {isSuperAdmin && coverageError && (
          <div className="mb-6 rounded-lg border border-red-400 bg-red-50 p-4 text-sm text-red-700">
            {coverageError}
          </div>
        )}

        {isSuperAdmin && !coverageError && coverageSummary?.has_source_data && coverageSummary.has_mismatch && mismatchFrameworks.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-400 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <svg className="h-6 w-6 text-amber-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Benchmark alignment warning</p>
                <p className="mt-1 text-sm text-amber-700">
                  Powerpipe benchmarks are running, but some official framework controls still need mapping or verification. Please review the gaps below so scans remain auditor-ready.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-amber-800">
                  {mismatchFrameworks.map((framework) => (
                    <li key={`${framework.framework}-${framework.framework_version}`} className="rounded-md bg-amber-100/70 px-3 py-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">
                          {framework.framework}
                          {framework.framework_version ? ` (${framework.framework_version})` : ''}
                        </span>
                        <span className="text-xs text-amber-700">
                          {framework.unmapped_controls} unmapped · {framework.unverified_controls} pending review · {framework.coverage_percentage !== null ? `${framework.coverage_percentage.toFixed(1)}% mapped` : 'Coverage unavailable'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Current Metrics Cards */}
        {current && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Actionable Findings</p>
                  <p className="text-3xl font-bold text-gray-900">{current.total_actionable_findings}</p>
                  <p className="text-xs text-gray-500 mt-1">Current open issues</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Compliance %</p>
                  <p className={`text-3xl font-bold ${
                    current.compliance_percentage >= 90 ? 'text-green-600' :
                    current.compliance_percentage >= 70 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {current.compliance_percentage.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Based on pass/fail</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Passed Controls</p>
                  <p className="text-3xl font-bold text-gray-900">{current.total_passed}</p>
                  <p className="text-xs text-gray-500 mt-1">Controls passing</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Failed Controls</p>
                  <p className="text-3xl font-bold text-gray-900">{current.total_failed}</p>
                  <p className="text-xs text-gray-500 mt-1">Controls failing</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
            </div>

            {isSuperAdmin && (
              <>
                <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">Total Clients</p>
                      <p className="text-3xl font-bold text-gray-900">{current.total_clients}</p>
                      <p className="text-xs text-gray-500 mt-1">Active organizations</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Trend Chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Compliance Trend (Last 90 Days)</h2>
              <p className="text-sm text-gray-600 mt-1">Track compliance percentage over time</p>
            </div>
            <ComplianceTrendChart data={chartData} />
          </div>
        )}

        {/* Comparison Metrics */}
        {comparison && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Historical Comparison</h2>
              <div className="space-y-4">
                {[
                  { label: '30 Days Ago', data: comparison.days_30_ago },
                  { label: '60 Days Ago', data: comparison.days_60_ago },
                  { label: '90 Days Ago', data: comparison.days_90_ago },
                ].map((period) => {
                  const change = calculateChange(
                    comparison.current.compliance_percentage,
                    period.data.compliance_percentage
                  );
                  return (
                    <div key={period.label} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{period.label}</p>
                        <p className="text-xs text-gray-500">
                          {period.data.compliance_percentage !== null 
                            ? `${period.data.compliance_percentage}% compliance`
                            : 'No data'}
                        </p>
                      </div>
                      <div className="text-right">
                        {change !== null && (
                          <p className={`text-sm font-semibold ${
                            change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {change > 0 ? '+' : ''}{change.toFixed(1)}%
                          </p>
                        )}
                        <p className="text-xs text-gray-500">vs current</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Current Status Breakdown</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Passed</p>
                      <p className="text-xs text-gray-500">{comparison.current.passed} controls</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-green-600">{comparison.current.passed}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Failed</p>
                      <p className="text-xs text-gray-500">{comparison.current.failed} controls</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-red-600">{comparison.current.failed}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Errors</p>
                      <p className="text-xs text-gray-500">{comparison.current.error} controls</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-orange-600">{comparison.current.error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            {isSuperAdmin && (
              <Link
                href="/clients"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Manage Clients
              </Link>
            )}
            <Link
              href={`/scans${selectedClientId ? `?client_id=${selectedClientId}` : ''}`}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              View Scans
            </Link>
            <Link
              href={`/findings${selectedClientId ? `?client_id=${selectedClientId}` : ''}`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Findings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
