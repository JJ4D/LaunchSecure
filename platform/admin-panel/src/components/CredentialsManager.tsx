'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface Credential {
  id: string;
  provider: string;
  is_active: boolean;
  region?: string;
  account_id?: string;
  created_at: string;
}

interface CredentialsManagerProps {
  clientId: string;
  clientName: string;
}

export default function CredentialsManager({ clientId, clientName }: CredentialsManagerProps) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [provider, setProvider] = useState<'aws' | 'google_workspace'>('aws');
  const [formData, setFormData] = useState({
    access_key_id: '',
    secret_access_key: '',
    session_token: '',
    region: '',
    account_id: '',
    // Google Workspace
    client_id: '',
    client_secret: '',
    domain: '',
    // Common
    is_active: true,
  });

  useEffect(() => {
    fetchCredentials();
  }, [clientId]);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getClientCredentials(clientId);
      setCredentials(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch credentials');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      access_key_id: '',
      secret_access_key: '',
      session_token: '',
      region: '',
      account_id: '',
      client_id: '',
      client_secret: '',
      domain: '',
      is_active: true,
    });
    setEditingCredential(null);
    setShowForm(false);
    setProvider('aws');
  };

  const handleEdit = (credential: Credential) => {
    setEditingCredential(credential);
    setProvider(credential.provider as 'aws' | 'google_workspace');
    // Note: We can't decrypt and show actual credentials, so we only show metadata
    setFormData({
      access_key_id: '',
      secret_access_key: '',
      session_token: '',
      region: credential.region || '',
      account_id: credential.account_id || '',
      client_id: '',
      client_secret: '',
      domain: credential.account_id || '', // Use account_id as domain for Google Workspace
      is_active: credential.is_active,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);

      let credentialsPayload: any = {};
      let accountId = formData.account_id;

      if (provider === 'aws') {
        credentialsPayload = {
          access_key_id: formData.access_key_id,
          secret_access_key: formData.secret_access_key,
        };
        if (formData.session_token) {
          credentialsPayload.session_token = formData.session_token;
        }
        accountId = formData.account_id;
      } else if (provider === 'google_workspace') {
        credentialsPayload = {
          client_id: formData.client_id,
          client_secret: formData.client_secret,
        };
        accountId = formData.domain; // Use domain as account_id
      }

      const payload = {
        provider,
        credentials: credentialsPayload,
        region: formData.region || undefined,
        account_id: accountId || undefined,
        is_active: formData.is_active,
      };

      if (editingCredential) {
        // Update - need to get credential ID from editingCredential
        await apiClient.updateClientCredentials(clientId, editingCredential.id, payload);
      } else {
        // Create
        await apiClient.addClientCredentials(clientId, payload);
      }

      await fetchCredentials();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    }
  };

  const handleDelete = async (credentialId: string) => {
    if (!confirm('Are you sure you want to delete these credentials? This cannot be undone.')) {
      return;
    }

    try {
      await apiClient.deleteClientCredentials(clientId, credentialId);
      await fetchCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete credentials');
    }
  };

  const handleToggleActive = async (credential: Credential) => {
    try {
      await apiClient.updateClientCredentials(clientId, credential.id, {
        is_active: !credential.is_active,
      });
      await fetchCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credential');
    }
  };

  if (loading && credentials.length === 0) {
    return <div className="text-gray-600">Loading credentials...</div>;
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-1">API Credentials</h3>
          <p className="text-sm text-gray-600">Manage API keys for {clientName}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="btn-primary text-sm"
        >
          Add Credentials
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-semibold text-gray-900">
              {editingCredential ? 'Edit Credentials' : 'Add New Credentials'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="text-gray-600 hover:text-gray-800"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Provider *</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as 'aws' | 'google_workspace');
                // Reset form when switching providers
                if (!editingCredential) {
                  setFormData({
                    ...formData,
                    access_key_id: '',
                    secret_access_key: '',
                    session_token: '',
                    client_id: '',
                    client_secret: '',
                  });
                }
              }}
              disabled={!!editingCredential}
              className="input-field"
            >
              <option value="aws">AWS</option>
              <option value="google_workspace">Google Workspace</option>
            </select>
          </div>

          {provider === 'aws' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Access Key ID *</label>
                <input
                  type="text"
                  required={!editingCredential}
                  value={formData.access_key_id}
                  onChange={(e) => setFormData({ ...formData, access_key_id: e.target.value })}
                  className="input-field"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                />
                {editingCredential && (
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to keep existing value
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Secret Access Key *</label>
                <input
                  type="password"
                  required={!editingCredential}
                  value={formData.secret_access_key}
                  onChange={(e) => setFormData({ ...formData, secret_access_key: e.target.value })}
                  className="input-field"
                  placeholder="Enter secret key"
                />
                {editingCredential && (
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to keep existing value
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Session Token (Optional)</label>
                <input
                  type="password"
                  value={formData.session_token}
                  onChange={(e) => setFormData({ ...formData, session_token: e.target.value })}
                  className="input-field"
                  placeholder="For temporary credentials"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Region</label>
                <input
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  className="input-field"
                  placeholder="us-east-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account ID</label>
                <input
                  type="text"
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="input-field"
                  placeholder="123456789012"
                />
              </div>
            </>
          )}

          {provider === 'google_workspace' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Client ID *</label>
                <input
                  type="text"
                  required={!editingCredential}
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="input-field"
                  placeholder="xxxxx.apps.googleusercontent.com"
                />
                {editingCredential && (
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to keep existing value
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client Secret *</label>
                <input
                  type="password"
                  required={!editingCredential}
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  className="input-field"
                  placeholder="Enter client secret"
                />
                {editingCredential && (
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to keep existing value
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Workspace Domain *</label>
                <input
                  type="text"
                  required={!editingCredential}
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="input-field"
                  placeholder="example.com"
                />
              </div>
            </>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Active (credentials will be used for scans)
            </label>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary">
              {editingCredential ? 'Update Credentials' : 'Add Credentials'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {credentials.map((credential) => (
          <div key={credential.id} className="card p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    {credential.provider.toUpperCase()}
                  </span>
                  <button
                    onClick={() => handleToggleActive(credential)}
                    className={`text-xs px-2 py-1 rounded ${
                      credential.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {credential.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  {credential.region && (
                    <p><span className="font-medium">Region:</span> {credential.region}</p>
                  )}
                  {credential.account_id && (
                    <p>
                      <span className="font-medium">
                        {credential.provider === 'google_workspace' ? 'Domain:' : 'Account ID:'}
                      </span>{' '}
                      {credential.account_id}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Added {new Date(credential.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(credential)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(credential.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {credentials.length === 0 && !loading && (
        <p className="text-gray-600 text-center py-4">
          No credentials configured. Add credentials to enable compliance scanning.
        </p>
      )}
    </div>
  );
}

