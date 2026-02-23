import React, { useState, useEffect } from 'react';
import { createTenant, listTenants, updateTenant, deleteTenant, Tenant } from '@/lib/multiTenant/tenantManager';

interface TenantCreateInput {
  id?: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
}

export default function TenantAdmin() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [newTenant, setNewTenant] = useState<TenantCreateInput>({ name: '', logoUrl: '', primaryColor: '', customDomain: '' });

  useEffect(() => {
    async function fetchTenants() {
      const tenantList: Tenant[] = await listTenants();
      setTenants(tenantList);
    }
    fetchTenants();
  }, []);

  const handleCreateTenant = async () => {
    const createdTenant: Tenant = await createTenant(
      newTenant.name,
      newTenant.logoUrl,
      newTenant.primaryColor,
      newTenant.customDomain
    );
    setTenants((prev) => [...prev, createdTenant]);
    setNewTenant({ name: '', logoUrl: '', primaryColor: '', customDomain: '' });
  };

  const handleUpdateTenant = async (id: string, data: Partial<Tenant>) => {
    const updatedTenant: Tenant = await updateTenant(id, data);
    setTenants((prev) => prev.map((tenant) => (tenant.id === id ? updatedTenant : tenant)));
  };

  const handleDeleteTenant = async (id: string) => {
    await deleteTenant(id);
    setTenants((prev) => prev.filter((tenant) => tenant.id !== id));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tenant Management</h1>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Tenant Name"
          value={newTenant.name}
          onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
          className="border p-2 rounded mb-2 w-full"
        />
        <input
          type="text"
          placeholder="Logo URL"
          value={newTenant.logoUrl}
          onChange={(e) => setNewTenant({ ...newTenant, logoUrl: e.target.value })}
          className="border p-2 rounded mb-2 w-full"
        />
        <input
          type="text"
          placeholder="Primary Color"
          value={newTenant.primaryColor}
          onChange={(e) => setNewTenant({ ...newTenant, primaryColor: e.target.value })}
          className="border p-2 rounded mb-2 w-full"
        />
        <input
          type="text"
          placeholder="Custom Domain"
          value={newTenant.customDomain}
          onChange={(e) => setNewTenant({ ...newTenant, customDomain: e.target.value })}
          className="border p-2 rounded mb-2 w-full"
        />
        <button onClick={handleCreateTenant} className="bg-blue-500 text-white px-4 py-2 rounded">
          Create Tenant
        </button>
      </div>
      <ul>
        {tenants.map((tenant) => (
          <li key={tenant.id} className="border p-4 rounded mb-2">
            <h2 className="font-bold text-lg">{tenant.name}</h2>
            <p>Logo: {tenant.logoUrl}</p>
            <p>Primary Color: {tenant.primaryColor}</p>
            <p>Custom Domain: {tenant.customDomain}</p>
            <button
              onClick={() => handleUpdateTenant(tenant.id, { name: 'Updated Name' })}
              className="bg-yellow-500 text-white px-4 py-2 rounded mr-2"
            >
              Update
            </button>
            <button
              onClick={() => handleDeleteTenant(tenant.id)}
              className="bg-red-500 text-white px-4 py-2 rounded"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}