'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import ErrorNotification from '@/components/ErrorNotification';

interface Finding {
  id: string;
  control_id: string;
  control_title: string;
  control_description: string | null;
  framework: string;
  domain: string | null;
  category: string | null;
  scan_status: string;
  scan_reason: string | null;
  scan_resources: any;
  remediation_status: string;
  assigned_owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  ai_business_context: string | null;
  ai_remediation_guidance: string | null;
  status_history: any[];
  created_at: string;
  updated_at: string;
}

export default function FindingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const findingId = params.id as string;

  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({
    remediation_status: '',
    notes: '',
  });

  useEffect(() => {
    if (findingId) {
      loadFinding();
    }
  }, [findingId]);

  const loadFinding = async () => {
    try {
      const data = await apiClient.getFinding(findingId);
      setFinding(data);
      setUpdateForm({
        remediation_status: data.remediation_status,
        notes: data.notes || '',
      });
    } catch (error) {
      console.error('Failed to load finding:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiClient.updateFinding(findingId, {
        remediation_status: updateForm.remediation_status as any,
        notes: updateForm.notes || undefined,
      });
      await loadFinding();
      setSuccessMessage('Finding updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to update finding: ${errorMessage}`);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'pass' || status === 'resolved') return 'bg-green-100 text-green-800';
    if (status === 'fail' || status === 'open') return 'bg-red-100 text-red-800';
    if (status === 'error') return 'bg-orange-100 text-orange-800';
    if (status === 'skip') return 'bg-gray-100 text-gray-600';
    if (status === 'in_progress') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading finding...</p>
        </div>
      </div>
    );
  }

  if (!finding) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Finding not found</p>
          <Link href="/findings" className="text-blue-600">Back to Findings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {error && (
        <ErrorNotification
          error={error}
          onClose={() => setError(null)}
        />
      )}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{successMessage}</span>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/findings"
            className="text-blue-600 hover:text-blue-800 mb-4 inline-flex items-center text-sm font-medium"
          >
            ← Back to Findings
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Control Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold mb-2">{finding.control_title}</h1>
                  <p className="text-sm font-mono text-gray-600 mb-2">{finding.control_id}</p>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {finding.framework}
                    </span>
                    {finding.domain && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                        {finding.domain}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded text-sm ${getStatusColor(finding.scan_status)}`}>
                    {finding.scan_status}
                  </span>
                </div>
              </div>

              {finding.control_description && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-gray-700">{finding.control_description}</p>
                </div>
              )}

              {/* Prominently show scan_reason for errors and skips */}
              {(finding.scan_status === 'error' || finding.scan_status === 'skip') && finding.scan_reason && (
                <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <h3 className="font-semibold mb-2 text-yellow-800">
                    {finding.scan_status === 'error' ? '⚠️ Error Explanation' : 'ℹ️ Skip Reason'}
                  </h3>
                  <p className="text-yellow-900">{finding.scan_reason}</p>
                  {finding.scan_status === 'error' && (
                    <p className="text-sm text-yellow-700 mt-2 italic">
                      This control could not be evaluated. Check permissions, resource availability, or configuration.
                    </p>
                  )}
                  {finding.scan_status === 'skip' && (
                    <p className="text-sm text-yellow-700 mt-2 italic">
                      This control was skipped and may not be applicable to your environment.
                    </p>
                  )}
                </div>
              )}

              {finding.scan_reason && finding.scan_status !== 'error' && finding.scan_status !== 'skip' && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Scan Result</h3>
                  <p className="text-gray-700">{finding.scan_reason}</p>
                </div>
              )}

              {finding.scan_resources && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Affected Resources</h3>
                  <pre className="bg-gray-50 p-4 rounded text-sm overflow-x-auto">
                    {JSON.stringify(finding.scan_resources, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* AI-Generated Content */}
            {(finding.ai_business_context || finding.ai_remediation_guidance) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">AI-Generated Guidance</h2>
                
                {finding.ai_business_context && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Business Context</h3>
                    <p className="text-gray-700">{finding.ai_business_context}</p>
                  </div>
                )}

                {finding.ai_remediation_guidance && (
                  <div>
                    <h3 className="font-semibold mb-2">Remediation Guidance</h3>
                    <p className="text-gray-700">{finding.ai_remediation_guidance}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status History */}
            {finding.status_history && finding.status_history.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Status History</h2>
                <div className="space-y-2">
                  {finding.status_history.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-4 text-sm">
                      <span className={`px-2 py-1 rounded ${getStatusColor(entry.status)}`}>
                        {entry.status}
                      </span>
                      <span className="text-gray-600">
                        by {entry.changed_by} on {new Date(entry.changed_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Remediation Status Update */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Update Status</h2>
              <form onSubmit={handleUpdate}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Remediation Status</label>
                  <select
                    value={updateForm.remediation_status}
                    onChange={(e) => setUpdateForm({ ...updateForm, remediation_status: e.target.value })}
                    className="w-full p-2 border rounded"
                    required
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={updateForm.notes}
                    onChange={(e) => setUpdateForm({ ...updateForm, notes: e.target.value })}
                    className="w-full p-2 border rounded"
                    rows={4}
                    placeholder="Add notes about remediation progress..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={updating}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updating ? 'Updating...' : 'Update Finding'}
                </button>
              </form>
            </div>

            {/* Current Status */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Current Status</h2>
              <div className="space-y-3">
                <div>
                  <span className="text-sm text-gray-600">Remediation Status:</span>
                  <div className="mt-1">
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(finding.remediation_status)}`}>
                      {finding.remediation_status}
                    </span>
                  </div>
                </div>

                {finding.owner_name && (
                  <div>
                    <span className="text-sm text-gray-600">Assigned To:</span>
                    <p className="mt-1 font-medium">{finding.owner_name}</p>
                  </div>
                )}

                {finding.notes && (
                  <div>
                    <span className="text-sm text-gray-600">Notes:</span>
                    <p className="mt-1 text-sm text-gray-700">{finding.notes}</p>
                  </div>
                )}

                <div>
                  <span className="text-sm text-gray-600">Created:</span>
                  <p className="mt-1 text-sm text-gray-700">
                    {new Date(finding.created_at).toLocaleString()}
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-600">Last Updated:</span>
                  <p className="mt-1 text-sm text-gray-700">
                    {new Date(finding.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

