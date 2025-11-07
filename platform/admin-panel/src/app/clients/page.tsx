'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import CredentialsManager from '@/components/CredentialsManager';

interface Client {
  id: string;
  company_name: string;
  business_description?: string;
  industry?: string;
  employee_count_range?: string;
  contact_name: string;
  contact_email: string;
  status: string;
  assigned_frameworks: string[];
  created_at: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    business_description: '',
    industry: '',
    employee_count_range: '',
    contact_name: '',
    contact_email: '',
    status: 'active' as 'active' | 'paused' | 'inactive',
    assigned_frameworks: [] as string[],
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getClients();
      setClients(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      business_description: '',
      industry: '',
      employee_count_range: '',
      contact_name: '',
      contact_email: '',
      status: 'active',
      assigned_frameworks: [],
    });
    setEditingClient(null);
    setShowForm(false);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name,
      business_description: client.business_description || '',
      industry: client.industry || '',
      employee_count_range: client.employee_count_range || '',
      contact_name: client.contact_name,
      contact_email: client.contact_email,
      status: client.status as 'active' | 'paused' | 'inactive',
      assigned_frameworks: client.assigned_frameworks || [],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      
      if (editingClient) {
        // Update existing client
        await apiClient.updateClient(editingClient.id, {
          ...formData,
          assigned_frameworks: formData.assigned_frameworks,
        });
        // Show success notification
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000); // Hide after 3 seconds
      } else {
        // Create new client
        await apiClient.createClient({
          ...formData,
          assigned_frameworks: formData.assigned_frameworks,
        });
      }

      await fetchClients();
      // Don't reset form - stay on edit page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleSaveAndClose = async () => {
    try {
      setError(null);
      
      if (editingClient) {
        // Update existing client
        await apiClient.updateClient(editingClient.id, {
          ...formData,
          assigned_frameworks: formData.assigned_frameworks,
        });
      }

      await fetchClients();
      resetForm(); // Close form and return to dashboard
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const frameworks = ['HIPAA', 'SOC2', 'ISO27001', 'CIS', 'NIST', 'PCI-DSS', 'GDPR', 'FedRAMP'];

  if (loading && clients.length === 0) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading clients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-600 mt-1">Manage client organizations</p>
          </div>
          {editingClient ? (
            <div className="flex gap-3">
              <button
                onClick={handleSaveAndClose}
                className="btn-primary"
              >
                Save
              </button>
              <button
                onClick={resetForm}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (showForm) {
                  resetForm();
                } else {
                  setShowForm(true);
                }
              }}
              className="btn-primary"
            >
              {showForm ? 'Cancel' : 'Add Client'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {showSuccess && (
          <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">Updated Successfully</span>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-8 card p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900">
              {editingClient ? 'Edit Client' : 'Create New Client'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contact Email *</label>
                <input
                  type="email"
                  required
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Industry</label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employee Count Range</label>
                <select
                  value={formData.employee_count_range}
                  onChange={(e) => setFormData({ ...formData, employee_count_range: e.target.value })}
                  className="input-field"
                >
                  <option value="">Select range</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-500">201-500</option>
                  <option value="501-1000">501-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'paused' | 'inactive' })}
                  className="input-field"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Business Description</label>
                <textarea
                  value={formData.business_description}
                  onChange={(e) => setFormData({ ...formData, business_description: e.target.value })}
                  className="input-field"
                  rows={3}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Assigned Frameworks *</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {frameworks.map((fw) => (
                    <label key={fw} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.assigned_frameworks.includes(fw)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              assigned_frameworks: [...formData.assigned_frameworks, fw],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              assigned_frameworks: formData.assigned_frameworks.filter((f) => f !== fw),
                            });
                          }
                        }}
                        className="mr-2"
                      />
                      {fw}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                className="btn-primary"
              >
                {editingClient ? 'Update Client' : 'Create Client'}
              </button>
            </div>
          </form>
        )}

        {editingClient && (
          <div className="mb-8">
            <CredentialsManager
              clientId={editingClient.id}
              clientName={editingClient.company_name}
            />
          </div>
        )}


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="card-hover p-6">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-semibold text-gray-900">{client.company_name}</h3>
                <button
                  onClick={() => handleEdit(client)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Edit
                </button>
              </div>
              <div className="space-y-2 mb-4">
                <p className="text-gray-600 text-sm">
                  <span className="font-medium">Contact:</span> {client.contact_name}
                </p>
                <p className="text-gray-600 text-sm">
                  <span className="font-medium">Email:</span> {client.contact_email}
                </p>
                {client.industry && (
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Industry:</span> {client.industry}
                  </p>
                )}
                {client.employee_count_range && (
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Employees:</span> {client.employee_count_range}
                  </p>
                )}
                {client.business_description && (
                  <p className="text-gray-600 text-sm line-clamp-2">
                    <span className="font-medium">Description:</span> {client.business_description}
                  </p>
                )}
              </div>
              <div className="mb-2">
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    client.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : client.status === 'paused'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {client.status}
                </span>
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium mb-1">Frameworks:</p>
                <div className="flex flex-wrap gap-1">
                  {client.assigned_frameworks.map((fw) => (
                    <span key={fw} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {fw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {clients.length === 0 && !loading && (
          <p className="text-gray-600 text-center py-8">No clients found. Create your first client above.</p>
        )}
      </div>
    </div>
  );
}

