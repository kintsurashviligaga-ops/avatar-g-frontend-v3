export interface Tenant {
  id: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
}

interface ApiErrorPayload {
  error?: string;
}

const TENANTS_API_BASE = '/api/admin/tenants';

async function requestTenantApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let errorMessage = 'Tenant API request failed';
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (payload?.error) {
        errorMessage = payload.error;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function createTenant(name: string, logoUrl?: string, primaryColor?: string, customDomain?: string): Promise<Tenant> {
  return requestTenantApi<Tenant>(TENANTS_API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      name,
      logoUrl,
      primaryColor,
      customDomain,
    }),
  });
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  return requestTenantApi<Tenant | null>(`${TENANTS_API_BASE}/${tenantId}`);
}

export async function listTenants(): Promise<Tenant[]> {
  return requestTenantApi<Tenant[]>(TENANTS_API_BASE);
}

export async function updateTenant(tenantId: string, data: Partial<Tenant>): Promise<Tenant> {
  return requestTenantApi<Tenant>(`${TENANTS_API_BASE}/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTenant(tenantId: string): Promise<Tenant> {
  return requestTenantApi<Tenant>(`${TENANTS_API_BASE}/${tenantId}`, {
    method: 'DELETE',
  });
}