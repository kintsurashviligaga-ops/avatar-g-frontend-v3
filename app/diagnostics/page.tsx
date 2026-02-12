'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getAccessToken, isAuthenticated } from '@/lib/auth/client';

interface DiagnosticsData {
  status: string;
  timestamp: string;
  environment?: unknown;
  supabase?: unknown;
}

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    loadDiagnostics();
    checkAuthToken();
  }, []);

  const checkAuthToken = async () => {
    try {
      const authenticated = await isAuthenticated();
      const token = await getAccessToken();
      if (authenticated && token) {
        setAuthToken('Present (JWT)');
      } else {
        setAuthToken('Not authenticated');
      }
    } catch {
      setAuthToken('Error checking auth');
    }
  };

  const loadDiagnostics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/diagnostics');
      const data = await response.json();
      setDiagnostics(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to load diagnostics:', message);
      setDiagnostics({
        status: 'error',
        timestamp: new Date().toISOString(),
        environment: { error: message },
      });
    } finally {
      setLoading(false);
    }
  };

  const runTest = async (
    name: string,
    endpoint: string,
    options?: RequestInit
  ): Promise<TestResult> => {
    try {
      const response = await fetch(endpoint, options);
      const data = await response.json();

      if (!response.ok) {
        return {
          name,
          status: 'error',
          message: data.error || `HTTP ${response.status}`,
          data,
        };
      }

      return {
        name,
        status: 'success',
        message: 'OK',
        data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return {
        name,
        status: 'error',
        message,
      };
    }
  };

  const runHealthChecks = async () => {
    setTestResults([]);
    const tests: TestResult[] = [];

    // Test all API routes with health check
    const endpoints = [
      { name: 'Diagnostics API', url: '/api/diagnostics?health=1' },
      { name: 'Avatars List API', url: '/api/avatars?health=1' },
      { name: 'Videos List API', url: '/api/videos?health=1' },
      { name: 'Music List API', url: '/api/music/list?health=1' },
    ];

    for (const endpoint of endpoints) {
      const result = await runTest(endpoint.name, endpoint.url);
      tests.push(result);
      setTestResults([...tests]);
    }
  };

  const runE2ETests = async () => {
    setTestResults([]);
    const tests: TestResult[] = [];

    // Get auth token using secure method
    const token = await getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Test Avatar Save
    const avatarTest = await runTest('Avatar Save (Mock)', '/api/avatar/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Test Avatar Diagnostics',
        image_url: 'https://example.com/test.png',
        prompt: 'Diagnostic test avatar',
        parameters: {},
      }),
    });
    tests.push(avatarTest);
    setTestResults([...tests]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test Avatars List
    const avatarsListTest = await runTest('Load Avatars', '/api/avatars', {
      headers,
    });
    tests.push(avatarsListTest);
    setTestResults([...tests]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test Music Generation (mock)
    const musicTest = await runTest('Music Generate (Mock)', '/api/music/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'Diagnostic test track',
        title: 'Test Track',
        mode: 'custom',
        tags: ['test'],
        duration: 30,
      }),
    });
    tests.push(musicTest);
    setTestResults([...tests]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test Video Generation (mock)
    const videoTest = await runTest('Video Generate (Mock)', '/api/video/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'Diagnostic test video',
        title: 'Test Video',
      }),
    });
    tests.push(videoTest);
    setTestResults([...tests]);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test Videos List
    const videosListTest = await runTest('Load Videos', '/api/videos', {
      headers,
    });
    tests.push(videosListTest);
    setTestResults([...tests]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
      case 'success':
        return 'text-green-400';
      case 'missing':
      case 'error':
        return 'text-red-400';
      case 'pending':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
      case 'success':
        return '✓';
      case 'missing':
      case 'error':
        return '✗';
      case 'pending':
        return '⋯';
      default:
        return '?';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading diagnostics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">System Diagnostics</h1>
          <p className="text-gray-400">
            Avatar G Platform - Environment & API Health Status
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {diagnostics?.timestamp ? new Date(diagnostics.timestamp).toLocaleString() : ''}
          </p>
        </div>

        {/* Auth Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">Authentication Status</h2>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Auth Token:</span>
              <span
                className={
                  authToken.includes('Present') ? 'text-green-400' : 'text-yellow-400'
                }
              >
                {authToken}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Environment Variables */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">Environment Variables</h2>

          {diagnostics?.environment?.validation ? (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                <div className="bg-gray-700 p-3 rounded">
                  <div className="text-gray-400">Total</div>
                  <div className="text-2xl font-bold">
                    {diagnostics.environment.validation.summary.total}
                  </div>
                </div>
                <div className="bg-gray-700 p-3 rounded">
                  <div className="text-gray-400">Present</div>
                  <div className="text-2xl font-bold text-green-400">
                    {diagnostics.environment.validation.summary.present}
                  </div>
                </div>
                <div className="bg-gray-700 p-3 rounded">
                  <div className="text-gray-400">Missing</div>
                  <div className="text-2xl font-bold text-red-400">
                    {diagnostics.environment.validation.summary.missing}
                  </div>
                </div>
                <div className="bg-gray-700 p-3 rounded">
                  <div className="text-gray-400">Empty</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {diagnostics.environment.validation.summary.empty}
                  </div>
                </div>
              </div>

              {diagnostics.environment.validation.errors.length > 0 && (
                <div className="bg-red-900/20 border border-red-500 rounded p-4 mb-4">
                  <h3 className="text-red-400 font-semibold mb-2">Errors:</h3>
                  <ul className="space-y-1 text-sm">
                    {diagnostics.environment.validation.errors.map(
                      (error: string, idx: number) => (
                        <li key={idx} className="text-red-300">
                          • {error}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

              {diagnostics.environment.validation.warnings.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500 rounded p-4">
                  <h3 className="text-yellow-400 font-semibold mb-2">Warnings:</h3>
                  <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
                    {diagnostics.environment.validation.warnings.map(
                      (warning: string, idx: number) => (
                        <li key={idx} className="text-yellow-300">
                          • {warning}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-400">Failed to load environment validation</p>
          )}
        </motion.div>

        {/* Provider Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">Provider Status</h2>
          {diagnostics?.environment?.providers ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(diagnostics.environment.providers).map(
                ([name, info]: [string, unknown]) => (
                  <div key={name} className="bg-gray-700 p-4 rounded">
                    <div className="font-semibold capitalize mb-2">{name}</div>
                    <div
                      className={
                        info.available ? 'text-green-400' : 'text-yellow-400'
                      }
                    >
                      {info.available ? '✓ Available' : '○ Fallback'}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      Mode: {info.mode}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-red-400">Failed to load provider status</p>
          )}
        </motion.div>

        {/* Feature Readiness */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">Feature Readiness</h2>
          {diagnostics?.environment?.features ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(diagnostics.environment.features).map(
                ([name, info]: [string, unknown]) => (
                  <div
                    key={name}
                    className={`p-4 rounded border-2 ${
                      info.ready
                        ? 'bg-green-900/20 border-green-500'
                        : 'bg-red-900/20 border-red-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold capitalize">{name}</span>
                      <span
                        className={info.ready ? 'text-green-400' : 'text-red-400'}
                      >
                        {info.ready ? '✓ Ready' : '✗ Not Ready'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{info.message}</p>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-red-400">Failed to load feature status</p>
          )}
        </motion.div>

        {/* Supabase Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">Supabase Status</h2>
          {diagnostics?.supabase ? (
            <>
              <div
                className={`mb-4 p-3 rounded ${
                  diagnostics.supabase.connected
                    ? 'bg-green-900/20 text-green-400'
                    : 'bg-red-900/20 text-red-400'
                }`}
              >
                {diagnostics.supabase.connected
                  ? '✓ Connected to Supabase'
                  : `✗ ${diagnostics.supabase.error || 'Not connected'}`}
              </div>

              {diagnostics.supabase.tables.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Database Tables:</h3>
                  <ul className="space-y-1">
                    {diagnostics.supabase.tables.map((table: string, idx: number) => (
                      <li
                        key={idx}
                        className={
                          table.includes('error') ? 'text-red-400' : 'text-green-400'
                        }
                      >
                        {table}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {diagnostics.supabase.buckets.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Storage Buckets:</h3>
                  <ul className="space-y-1">
                    {diagnostics.supabase.buckets.map((bucket: string, idx: number) => (
                      <li key={idx} className="text-gray-300">
                        • {bucket}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-400">Failed to load Supabase status</p>
          )}
        </motion.div>

        {/* Test Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h2 className="text-2xl font-semibold mb-4">API Tests</h2>
          <div className="flex gap-4 mb-4">
            <button
              onClick={runHealthChecks}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
            >
              Run Health Checks
            </button>
            <button
              onClick={runE2ETests}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition"
            >
              Run E2E Tests
            </button>
            <button
              onClick={loadDiagnostics}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition"
            >
              Refresh
            </button>
          </div>

          {testResults.length > 0 && (
            <div className="space-y-2">
              {testResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border-l-4 ${
                    result.status === 'success'
                      ? 'bg-green-900/20 border-green-500'
                      : result.status === 'error'
                      ? 'bg-red-900/20 border-red-500'
                      : 'bg-gray-700 border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{result.name}</span>
                    <span className={getStatusColor(result.status)}>
                      {getStatusIcon(result.status)} {result.status}
                    </span>
                  </div>
                  {result.message && (
                    <p className="text-sm text-gray-400 mt-1">{result.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
