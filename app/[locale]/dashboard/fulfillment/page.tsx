'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Package, AlertCircle, CheckCircle, Clock, TruckIcon } from 'lucide-react';

interface FulfillmentJob {
  id: string;
  order_id: string;
  fulfillment_type: string;
  status: string;
  tracking_number?: string;
  carrier?: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
  orders?: {
    order_number: string;
    buyer_name: string;
    total_amount: number;
  };
  suppliers?: {
    name: string;
  };
}

export default function FulfillmentDashboard() {
  const _t = useTranslations();
  const [jobs, setJobs] = useState<FulfillmentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchJobs = useCallback(async () => {
    try {
      const url = filter === 'all' ? '/api/fulfillment' : `/api/fulfillment?status=${filter}`;
      const response = await fetch(url);
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleRetry = async (jobId: string) => {
    try {
      await fetch(`/api/fulfillment/${jobId}/retry`, { method: 'POST' });
      await fetchJobs();
    } catch (error) {
      console.error('Error retrying job:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case'queued':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'processing':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'shipped':
        return <TruckIcon className="w-5 h-5 text-green-500" />;
      case 'delivered':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Package className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Fulfillment Dashboard</h1>

        {/* Status Filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {['all', 'queued', 'processing', 'shipped', 'delivered', 'failed'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitepsace-nowrap ${
                filter === status
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
              <Package className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No fulfillment jobs</h3>
              <p className="text-gray-400">No jobs found with this filter</p>
            </div>
          ) : (
            jobs.map((job) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Order #{job.orders?.order_number}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {job.fulfillment_type} • {job.suppliers?.name || 'Manual'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-medium ${
                      job.status === 'delivered'
                        ? 'bg-green-500/10 text-green-500'
                        : job.status === 'failed'
                        ? 'bg-red-500/10 text-red-500'
                        : job.status === 'shipped'
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'bg-yellow-500/10 text-yellow-500'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {job.tracking_number && (
                  <div className="mb-4 p-3 bg-white/5 rounded-lg">
                    <p className="text-sm text-gray-400">Tracking</p>
                    <p className="text-white font-mono">{job.tracking_number}</p>
                    <p className="text-sm text-gray-400">{job.carrier}</p>
                  </div>
                )}

                {job.error_message && (
                  <div className="mb-4 p-3 bg-red-500/10 rounded-lg">
                    <p className="text-sm text-red-400">Error</p>
                    <p className="text-white text-sm">{job.error_message}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Retry attempts: {job.retry_count}
                    </p>
                  </div>
                )}

                {job.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Retry Fulfillment
                  </button>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
