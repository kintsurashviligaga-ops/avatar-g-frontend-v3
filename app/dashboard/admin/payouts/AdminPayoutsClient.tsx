'use client';

import { useEffect, useState } from 'react';
import { fromCents } from '@/lib/finance/money';

export default function AdminPayoutsClient() {
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRequests() {
    const response = await fetch('/api/admin/payouts');
    const data = await response.json();
    if (response.ok) {
      setRequests(data.data || []);
    } else {
      setError(data.error || 'Failed to load payouts');
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function updateStatus(id: string, status: 'approved' | 'rejected' | 'paid') {
    const response = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payout_request_id: id, status }),
    });
    const data = await response.json();
    if (response.ok) {
      setRequests(requests.map((r) => (r.id === id ? data.data : r)));
    } else {
      setError(data.error || 'Failed to update payout');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Payouts</h1>
        <p className="text-gray-400">Manual approval workflow for payout requests.</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        {requests.length === 0 ? (
          <p className="text-gray-400">No payout requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="bg-black/30 rounded p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{fromCents(request.amount_cents).toFixed(2)} {request.currency}</p>
                    <p className="text-sm text-gray-400">User: {request.user_id}</p>
                  </div>
                  <span className="text-xs bg-white/10 px-2 py-1 rounded">{request.status}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => updateStatus(request.id, 'approved')}
                    className="px-3 py-1 bg-green-600/80 hover:bg-green-600 rounded text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateStatus(request.id, 'rejected')}
                    className="px-3 py-1 bg-red-600/80 hover:bg-red-600 rounded text-sm"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => updateStatus(request.id, 'paid')}
                    className="px-3 py-1 bg-blue-600/80 hover:bg-blue-600 rounded text-sm"
                  >
                    Mark Paid
                  </button>
                </div>
                {request.review_required && (
                  <p className="text-xs text-yellow-300 mt-2">AML review required</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
