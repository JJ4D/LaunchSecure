'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import ErrorNotification from '@/components/ErrorNotification';

interface Client {
  id: string;
  company_name: string;
  assigned_frameworks: string[];
}

interface Scan {
  id: string;
  client_id: string;
  frameworks: string[];
  status: string;
  total_controls: number;
  passed_controls: number;
  failed_controls: number;
  error_controls?: number;
  skip_controls?: number;
  started_at: string;
  completed_at: string | null;
}

export default function ScansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedClient, setSelectedClient] = useState('');
  const [filterClientId, setFilterClientId] = useState<string>(searchParams.get('client_id') || '');
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, filterClientId]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await apiClient.getCurrentUser();
      setUser(currentUser);
      
      // If client user, set their client as filter
      if (currentUser.role === 'client_user' && currentUser.client_id) {
        setFilterClientId(currentUser.client_id);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      router.push('/login');
    }
  };

  const loadData = async () => {
    try {
      const [clientsData, scansData] = await Promise.all([
        apiClient.getClients(),
        apiClient.getScans(filterClientId || undefined),
      ]);
      setClients(clientsData);
      
      // Filter scans if client filter is set
      const filteredScans = filterClientId
        ? scansData.filter((s: Scan) => s.client_id === filterClientId)
        : scansData;
      
      setScans(filteredScans);
      
      // Start polling for any in-progress scans
      filteredScans.forEach((scan: Scan) => {
        if (scan.status === 'in_progress') {
          startPollingScanStatus(scan.id);
        }
      });
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    setScanning(true);
    setError(null);
    try {
      const newScan = await apiClient.createScan(selectedClient);
      
      // Add the scan to the table immediately
      const client = clients.find(c => c.id === selectedClient);
      setScans(prevScans => [{
        ...newScan,
        client_id: selectedClient,
        frameworks: newScan.frameworks || [],
      }, ...prevScans]);
      
      setSelectedClient('');
      
      // Start polling for status updates
      startPollingScanStatus(newScan.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to start scan: ${errorMessage}`);
      setScanning(false);
    }
  };

  const startPollingScanStatus = (scanId: string) => {
    // Clear any existing interval for this scan
    const existingInterval = pollingIntervalsRef.current.get(scanId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const pollStartTime = Date.now();
    const MAX_POLLING_DURATION_MS = 30 * 60 * 1000; // 30 minutes max polling time
    
    const pollInterval = setInterval(async () => {
      try {
        // Check if we've been polling too long
        const pollingElapsed = Date.now() - pollStartTime;
        if (pollingElapsed > MAX_POLLING_DURATION_MS) {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(scanId);
          setScanning(false);
          
          // Update scan status to failed if still in progress
          setScans(prevScans => 
            prevScans.map(scan => 
              scan.id === scanId && scan.status === 'in_progress'
                ? { ...scan, status: 'failed' as const }
                : scan
            )
          );
          return;
        }
        
        const updatedScan = await apiClient.getScan(scanId);
        
        // Update the scan in the list
        setScans(prevScans => 
          prevScans.map(scan => 
            scan.id === scanId 
              ? { ...scan, ...updatedScan, frameworks: updatedScan.frameworks || scan.frameworks }
              : scan
          )
        );
        
        // Stop polling if scan is completed or failed
        if (updatedScan.status === 'completed' || updatedScan.status === 'failed') {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(scanId);
          setScanning(false);
        }
      } catch (error) {
        console.error('Error polling scan status:', error);
        // Continue polling even if there's an error
      }
    }, 2000); // Poll every 2 seconds
    
    // Store interval ID for cleanup
    pollingIntervalsRef.current.set(scanId, pollInterval);
  };

  const getStatusClass = (status: string) => {
    if (status === 'completed') return 'status-pass';
    if (status === 'in_progress') return 'status-in-progress';
    if (status === 'failed') return 'status-fail';
    return 'status-badge bg-gray-100 text-gray-800 border border-gray-200';
  };

  const getStatusBadge = (status: string) => {
    if (status === 'completed') {
      return (
        <span className="status-badge status-pass flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Completed
        </span>
      );
    }
    if (status === 'in_progress') {
      return (
        <span className="status-badge status-in-progress flex items-center gap-1">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          In Progress
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="status-badge status-fail flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Failed
        </span>
      );
    }
    return (
      <span className="status-badge bg-gray-100 text-gray-800 border border-gray-200">
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'super_admin';
  const filteredClient = clients.find(c => c.id === filterClientId);

  return (
    <div className="min-h-screen bg-gray-50">
      {error && (
        <ErrorNotification
          error={error}
          onClose={() => setError(null)}
        />
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compliance Scans</h1>
            <p className="text-gray-600 mt-1">
              {filterClientId 
                ? `Viewing scans for ${filteredClient?.company_name || 'selected client'}`
                : 'Run and view compliance scan history'}
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-4">
              <label className="block text-sm font-medium text-gray-700">
                Filter by Client:
              </label>
              <select
                value={filterClientId}
                onChange={(e) => {
                  setFilterClientId(e.target.value);
                  // Update URL without page reload
                  const params = new URLSearchParams();
                  if (e.target.value) {
                    params.set('client_id', e.target.value);
                  }
                  router.push(`/scans${params.toString() ? `?${params.toString()}` : ''}`);
                }}
                className="input-field min-w-[200px]"
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

        {/* Start New Scan - Only show for super admin or when client is selected */}
        {isSuperAdmin && (
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Start New Scan</h2>
            <form onSubmit={handleStartScan} className="flex gap-4">
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="input-field flex-1"
                required
              >
                <option value="">Select a client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name} ({client.assigned_frameworks.join(', ')})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={scanning || !selectedClient}
                className="btn-primary"
              >
                {scanning ? 'Starting...' : 'Start Scan'}
              </button>
            </form>
          </div>
        )}

        {/* Scans List */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Scan History</h2>
            {filterClientId && (
              <Link
                href={`/findings?client_id=${filterClientId}`}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View Findings →
              </Link>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isSuperAdmin && !filterClientId && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frameworks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Passed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Skip</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scans.map((scan) => {
                  const client = clients.find(c => c.id === scan.client_id);
                  return (
                    <tr key={scan.id}>
                      {isSuperAdmin && !filterClientId && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {client?.company_name || 'Unknown'}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {(scan.frameworks || []).map((fw: string) => (
                            <span key={fw} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              {fw}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(scan.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{scan.total_controls || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-green-600">{scan.passed_controls || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-red-600">{scan.failed_controls || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-orange-600">{scan.error_controls || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{scan.skip_controls || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(scan.started_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/findings?compliance_check_id=${scan.id}${filterClientId ? `&client_id=${filterClientId}` : ''}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Findings
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {scans.length === 0 && (
                  <tr>
                    <td colSpan={isSuperAdmin && !filterClientId ? 10 : 9} className="px-6 py-4 text-center text-gray-500">
                      No scans found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
