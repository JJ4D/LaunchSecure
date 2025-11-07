// API URL - Next.js will replace NEXT_PUBLIC_API_URL at build time
// Fallback to localhost for development
const API_URL = 'http://localhost:3001';

export class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const result = await this.request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(result.token);
    return result;
  }

  async register(clientId: string, email: string, password: string) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, email, password }),
    });
  }

  async getCurrentUser() {
    return this.request('/api/auth/me');
  }

  // Client endpoints
  async getClients() {
    return this.request('/api/clients');
  }

  async getClient(id: string) {
    return this.request(`/api/clients/${id}`);
  }

  async createClient(data: any) {
    return this.request('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClient(id: string, data: any) {
    return this.request(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteClient(id: string) {
    return this.request(`/api/clients/${id}`, {
      method: 'DELETE',
    });
  }

  async getClientCredentials(clientId: string) {
    return this.request(`/api/clients/${clientId}/credentials`);
  }

  async addClientCredentials(clientId: string, data: any) {
    return this.request(`/api/clients/${clientId}/credentials`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClientCredentials(clientId: string, credentialId: string, data: any) {
    return this.request(`/api/clients/${clientId}/credentials/${credentialId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteClientCredentials(clientId: string, credentialId: string) {
    return this.request(`/api/clients/${clientId}/credentials/${credentialId}`, {
      method: 'DELETE',
    });
  }

  // Scan endpoints
  async createScan(clientId: string, frameworks?: string[]) {
    return this.request('/api/scans', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, frameworks }),
    });
  }

  async getScans(clientId?: string, status?: string) {
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (status) params.append('status', status);
    const query = params.toString();
    return this.request(`/api/scans${query ? `?${query}` : ''}`);
  }

  async getScan(id: string) {
    return this.request(`/api/scans/${id}`);
  }

  // Findings endpoints
  async getFindings(filters?: {
    client_id?: string;
    framework?: string;
    scan_status?: string;
    remediation_status?: string;
    show_all?: boolean;
    control_id_search?: string;
    date_from?: string;
    date_to?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (key === 'show_all' && typeof value === 'boolean') {
            params.append(key, value.toString());
          } else if (key !== 'show_all') {
            params.append(key, value.toString());
          }
        }
      });
    }
    const query = params.toString();
    return this.request(`/api/findings${query ? `?${query}` : ''}`);
  }

  async getFinding(id: string) {
    return this.request(`/api/findings/${id}`);
  }

  async updateFinding(id: string, data: {
    remediation_status?: 'open' | 'in_progress' | 'resolved';
    assigned_owner_id?: string | null;
    notes?: string;
  }) {
    return this.request(`/api/findings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Historical findings for compliance progress tracking
  async getFindingsHistory(filters?: {
    client_id?: string;
    framework?: string;
    control_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    const query = params.toString();
    return this.request(`/api/findings/history${query ? `?${query}` : ''}`);
  }

  // Reports endpoints
  async getComplianceSummary(clientId: string) {
    return this.request(`/api/reports/compliance-summary/${clientId}`);
  }

  async getDashboardMetrics(clientId?: string, days?: number) {
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (days) params.append('days', days.toString());
    const query = params.toString();
    return this.request(`/api/reports/dashboard-metrics${query ? `?${query}` : ''}`);
  }

  async getFindingsReport(clientId: string, filters?: {
    framework?: string;
    remediation_status?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }
    const query = params.toString();
    return this.request(`/api/reports/findings/${clientId}${query ? `?${query}` : ''}`);
  }

  async getCoverageSummary() {
    return this.request('/api/verification/coverage/summary');
  }
}

export const apiClient = new ApiClient();

