'use client';

import { useEffect, useState } from 'react';
import { toCents, fromCents } from '@/lib/finance/money';

export default function PayoutsClient({ storeId }: { storeId: string }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [amount, setAmount] = useState(100);
  const [currency, setCurrency] = useState<'GEL' | 'USD'>('GEL');
  const [accountType, setAccountType] = useState<'stripe' | 'tbc' | 'bog' | 'payze'>('stripe');
  const [details, setDetails] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const accountsRes = await fetch('/api/payouts/accounts');
    const accountsData = await accountsRes.json();
    setAccounts(accountsData.data || []);

    const requestsRes = await fetch('/api/payouts/requests');
    const requestsData = await requestsRes.json();
    setRequests(requestsData.data || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createAccount() {
    setError(null);
    try {
      const response = await fetch('/api/payouts/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: accountType,
          details: JSON.parse(details || '{}'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create account');
      setAccounts([data.data, ...accounts]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
  }

  async function requestPayout() {
    setError(null);
    try {
      const response = await fetch('/api/payouts/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: toCents(amount),
          currency,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to request payout');
      setRequests([data.data, ...requests]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request payout');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Payouts</h1>
        <p className="text-gray-400">Request withdrawals and manage payout accounts.</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Request Payout</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm text-gray-300">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'GEL' | 'USD')}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
              >
                <option value="GEL">GEL</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <button
              onClick={requestPayout}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded"
            >
              Request Payout
            </button>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Add Payout Account</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-sm text-gray-300">Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
              >
                <option value="stripe">Stripe</option>
                <option value="tbc">TBC</option>
                <option value="bog">BoG</option>
                <option value="payze">Payze</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300">Details JSON</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full h-24 mt-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={createAccount}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded"
            >
              Add Account
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Payout History</h2>
        {requests.length === 0 ? (
          <p className="text-gray-400">No payout requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="bg-black/30 rounded p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{fromCents(request.amount_cents).toFixed(2)} {request.currency}</p>
                  <span className="text-xs bg-white/10 px-2 py-1 rounded">{request.status}</span>
                </div>
                <p className="text-sm text-gray-400">Requested: {new Date(request.requested_at).toLocaleDateString()}</p>
                {request.review_required && (
                  <p className="text-xs text-yellow-300">Review required</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Linked Accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-gray-400">No payout accounts yet.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="bg-black/30 rounded p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{account.type.toUpperCase()}</p>
                  <span className="text-xs bg-white/10 px-2 py-1 rounded">{account.status}</span>
                </div>
                <p className="text-xs text-gray-400">Created: {new Date(account.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
