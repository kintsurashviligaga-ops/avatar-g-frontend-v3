'use client';

import { useEffect } from 'react';

/**
 * PRODUCTION-HARDENED GLOBAL ERROR BOUNDARY
 * 
 * - Logs errors to /api/log-error in production
 * - Always shows Georgian UI, never generic "Application Error"
 * - Never crashes, always recovers gracefully
 * - Console logs for debugging production issues
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Always log to console for production debugging
    console.error('[Global Error Caught]', {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    });

    // In development, show full stack in console
    if (process.env.NODE_ENV === 'development') {
      console.error('[Global Error - Full Stack]', error);
      return;
    }

    // In production, log to API endpoint (non-blocking)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      try {
        fetch('/api/log-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error?.message || 'Unknown error',
            digest: error?.digest,
            stack: error?.stack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
          }),
        }).catch((err) => {
          // Even if logging fails, don't crash - just log to console
          console.error('[Error Logging Failed]', err);
        });
      } catch (loggingError) {
        // Never crash on logging failure
        console.error('[Error Logging Exception]', loggingError);
      }
    }
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#05070A',
      color: 'white',
    }}>
          <div style={{
            maxWidth: '600px',
            textAlign: 'center',
          }}>
            {/* Main Error Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 24px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '40px' }}>⚠️</span>
            </div>

            {/* Error Title */}
            <h1 style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#f87171',
              marginBottom: '16px',
              lineHeight: '1.2',
            }}>
              სისტემური შეცდომა
            </h1>

            {/* Production message - Always Georgian */}
            <p style={{
              color: '#9ca3af',
              marginBottom: '24px',
              fontSize: '16px',
              lineHeight: '1.6',
            }}>
              სისტემაში დროებითი პრობლემა დაფიქსირდა. გთხოვთ სცადოთ ხელახლა ან დაუკავშირდეთ მხარდაჭერას.
            </p>

            {/* Only show error details in development */}
            {process.env.NODE_ENV === 'development' && error?.message && (
              <details style={{
                marginBottom: '24px',
                textAlign: 'left',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '8px',
                padding: '16px',
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: '#fca5a5',
                  marginBottom: '8px',
                }}>
                  დეტალური ინფორმაცია (დეველოპმენტი)
                </summary>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '12px',
                  color: '#fca5a5',
                  overflow: 'auto',
                  maxHeight: '200px',
                  margin: 0,
                }}>
                  {error.message}
                  {'\n\n'}
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Error ID for support */}
            {error?.digest && (
              <p style={{
                fontSize: '12px',
                color: '#6b7280',
                fontFamily: 'monospace',
                marginBottom: '32px',
              }}>
                შეცდომის ID: {error.digest}
              </p>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  try {
                    reset();
                  } catch (resetError) {
                    console.error('[Reset Failed]', resetError);
                    window.location.href = '/';
                  }
                }}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                🔄 სცადეთ თავიდან
              </button>
              <a
                href="/"
                style={{
                  padding: '12px 24px',
                  background: '#4b5563',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                🏠 მთავარ გვერდზე
              </a>
            </div>

            {/* Support Contact */}
            <p style={{
              marginTop: '32px',
              fontSize: '14px',
              color: '#6b7280',
            }}>
              დახმარება საჭიროა?{' '}
              <a 
                href="mailto:support@myavatar.ge" 
                style={{
                  color: '#818cf8',
                  textDecoration: 'none',
                }}
              >
                support@myavatar.ge
              </a>
            </p>
        </div>
    </div>
  );
}

