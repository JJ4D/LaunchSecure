'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';

interface Finding {
  id: string;
  client_id: string;
  control_id: string;
  control_title: string;
  framework: string;
  domain: string | null;
  scan_status: string;
  remediation_status: string;
  created_at: string;
}

interface GroupedFindings {
  [framework: string]: {
    [domain: string]: Finding[];
  };
}

export default function FindingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    client_id: searchParams.get('client_id') || '',
    framework: searchParams.get('framework') || '',
    scan_status: searchParams.get('scan_status') || '',
    remediation_status: searchParams.get('remediation_status') || '',
    control_id_search: '',
    date_from: '',
    date_to: '',
  });

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadFindings();
    }
  }, [filters, showAllStatuses, user]);

  const loadUser = async () => {
    try {
      const currentUser = await apiClient.getCurrentUser();
      setUser(currentUser);
      
      // Load clients for super admin
      if (currentUser.role === 'super_admin') {
        const clientsData = await apiClient.getClients();
        setClients(clientsData);
      } else {
        // For client users, set their client_id as filter
        if (currentUser.client_id) {
          setFilters(prev => ({ ...prev, client_id: currentUser.client_id }));
        }
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      router.push('/login');
    }
  };

  const loadFindings = async () => {
    try {
      if (!user) return;
      
      // For super_admin, always show all. For client users, respect showAllStatuses toggle
      const showAll = user.role === 'super_admin' ? true : showAllStatuses;
      
      const filterParams: any = {
        ...filters,
        show_all: showAll,
      };

      // Remove empty filter values
      Object.keys(filterParams).forEach(key => {
        if (filterParams[key] === '' || filterParams[key] === null || filterParams[key] === undefined) {
          delete filterParams[key];
        }
      });

      const data = await apiClient.getFindings(filterParams);
      setFindings(data);
      
      // Auto-expand all sections on initial load
      if (expandedSections.size === 0) {
        const frameworks = new Set(data.map((f: Finding) => f.framework));
        const newExpanded = new Set<string>();
        frameworks.forEach(framework => {
          const domains = new Set(data.filter((f: Finding) => f.framework === framework).map((f: Finding) => f.domain || 'Other'));
          domains.forEach(domain => {
            newExpanded.add(`${framework}::${domain}`);
          });
        });
        setExpandedSections(newExpanded);
      }
    } catch (error) {
      console.error('Failed to load findings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group findings by framework → domain
  const groupedFindings = useMemo(() => {
    const grouped: GroupedFindings = {};
    
    findings.forEach(finding => {
      const framework = finding.framework || 'Other';
      const domain = finding.domain || 'Other';
      
      if (!grouped[framework]) {
        grouped[framework] = {};
      }
      if (!grouped[framework][domain]) {
        grouped[framework][domain] = [];
      }
      grouped[framework][domain].push(finding);
    });

    // Sort domains within each framework
    Object.keys(grouped).forEach(framework => {
      const sortedDomains = Object.keys(grouped[framework]).sort();
      const sortedGroup: { [domain: string]: Finding[] } = {};
      sortedDomains.forEach(domain => {
        sortedGroup[domain] = grouped[framework][domain];
      });
      grouped[framework] = sortedGroup;
    });

    return grouped;
  }, [findings]);

  const toggleSection = (framework: string, domain: string) => {
    const key = `${framework}::${domain}`;
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  const isSectionExpanded = (framework: string, domain: string) => {
    return expandedSections.has(`${framework}::${domain}`);
  };

  const expandAll = () => {
    const newExpanded = new Set<string>();
    Object.keys(groupedFindings).forEach(framework => {
      Object.keys(groupedFindings[framework]).forEach(domain => {
        newExpanded.add(`${framework}::${domain}`);
      });
    });
    setExpandedSections(newExpanded);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const getStatusClass = (status: string) => {
    if (status === 'pass') return 'status-pass';
    if (status === 'resolved') return 'status-resolved';
    if (status === 'fail') return 'status-fail';
    if (status === 'error') return 'status-error bg-orange-100 text-orange-800 border border-orange-200';
    if (status === 'skip') return 'status-skip bg-gray-100 text-gray-600 border border-gray-200';
    if (status === 'open') return 'status-open';
    if (status === 'in_progress') return 'status-in-progress';
    return 'status-badge bg-gray-100 text-gray-800 border border-gray-200';
  };

  const getSectionCount = (framework: string, domain: string) => {
    return groupedFindings[framework]?.[domain]?.length || 0;
  };

  const getSectionStatusCounts = (framework: string, domain: string) => {
    const findingsInSection = groupedFindings[framework]?.[domain] || [];
    return {
      pass: findingsInSection.filter(f => f.scan_status === 'pass').length,
      fail: findingsInSection.filter(f => f.scan_status === 'fail').length,
      error: findingsInSection.filter(f => f.scan_status === 'error').length,
      skip: findingsInSection.filter(f => f.scan_status === 'skip').length,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading findings...</p>
        </div>
      </div>
    );
  }

  const frameworks = Object.keys(groupedFindings).sort();
  const totalFindings = findings.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Findings</h1>
            <p className="text-gray-600 mt-1">
              {filters.client_id && user?.role === 'super_admin'
                ? `Viewing findings for ${clients.find(c => c.id === filters.client_id)?.company_name || 'selected client'}`
                : user?.role === 'client_user' 
                  ? 'View and track actionable compliance findings (failures and errors)'
                  : 'View and track compliance findings organized by framework and domain'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {totalFindings} finding{totalFindings !== 1 ? 's' : ''} total
            </p>
          </div>
          <div className="flex items-center gap-4">
            {user?.role === 'client_user' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllStatuses}
                  onChange={(e) => setShowAllStatuses(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Show all statuses</span>
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Filters & Search</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user?.role === 'super_admin' && (
              <div>
                <label className="block text-sm font-medium mb-1">Client</label>
                <select
                  value={filters.client_id}
                  onChange={(e) => {
                    setFilters({ ...filters, client_id: e.target.value });
                    // Update URL
                    const params = new URLSearchParams(searchParams.toString());
                    if (e.target.value) {
                      params.set('client_id', e.target.value);
                    } else {
                      params.delete('client_id');
                    }
                    router.push(`/findings?${params.toString()}`);
                  }}
                  className="input-field"
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
            <div>
              <label className="block text-sm font-medium mb-1">Control ID Search</label>
              <input
                type="text"
                value={filters.control_id_search}
                onChange={(e) => setFilters({ ...filters, control_id_search: e.target.value })}
                placeholder="Search by control ID..."
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Framework</label>
              <select
                value={filters.framework}
                onChange={(e) => setFilters({ ...filters, framework: e.target.value })}
                className="input-field"
              >
                <option value="">All</option>
                <option value="HIPAA">HIPAA</option>
                <option value="SOC2">SOC2</option>
                <option value="ISO27001">ISO27001</option>
                <option value="CIS">CIS</option>
                <option value="NIST">NIST</option>
                <option value="PCI-DSS">PCI-DSS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Scan Status</label>
              <select
                value={filters.scan_status}
                onChange={(e) => setFilters({ ...filters, scan_status: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="">All</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="error">Error</option>
                <option value="skip">Skip</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Remediation Status</label>
              <select
                value={filters.remediation_status}
                onChange={(e) => setFilters({ ...filters, remediation_status: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Findings Grouped by Framework → Domain */}
        {frameworks.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-gray-500">No findings found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {frameworks.map((framework) => {
              const domains = Object.keys(groupedFindings[framework]).sort();
              return (
                <div key={framework} className="card overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {framework}
                      <span className="ml-2 text-sm font-normal text-gray-600">
                        ({Object.values(groupedFindings[framework]).flat().length} findings)
                      </span>
                    </h2>
                  </div>
                  
                  {domains.map((domain) => {
                    const sectionKey = `${framework}::${domain}`;
                    const isExpanded = isSectionExpanded(framework, domain);
                    const count = getSectionCount(framework, domain);
                    const statusCounts = getSectionStatusCounts(framework, domain);
                    
                    return (
                      <div key={sectionKey} className="border-b border-gray-200 last:border-b-0">
                        <button
                          onClick={() => toggleSection(framework, domain)}
                          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="text-left">
                              <h3 className="font-medium text-gray-900">{domain}</h3>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span>{count} control{count !== 1 ? 's' : ''}</span>
                                {statusCounts.fail > 0 && (
                                  <span className="text-red-600">● {statusCounts.fail} fail</span>
                                )}
                                {statusCounts.error > 0 && (
                                  <span className="text-orange-600">● {statusCounts.error} error</span>
                                )}
                                {statusCounts.pass > 0 && (
                                  <span className="text-green-600">● {statusCounts.pass} pass</span>
                                )}
                                {statusCounts.skip > 0 && (
                                  <span className="text-gray-500">● {statusCounts.skip} skip</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                        
                        {isExpanded && (
                          <div className="px-6 pb-4">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Control ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scan Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remediation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {groupedFindings[framework][domain].map((finding) => (
                                    <tr key={finding.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono">
                                        {finding.control_id}
                                      </td>
                                      <td className="px-4 py-3 text-sm">
                                        <div className="max-w-md">{finding.control_title}</div>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusClass(finding.scan_status)}`}>
                                          {finding.scan_status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusClass(finding.remediation_status)}`}>
                                          {finding.remediation_status}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                                        <Link
                                          href={`/findings/${finding.id}`}
                                          className="text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                          View
                                        </Link>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
