'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Global Error]', error);
  }

  return (
    <html>
      <body style={{ margin: 0, padding: 0, background: '#05070A', color: 'white' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <h2 style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#f87171',
            marginBottom: '16px',
          }}>
            Application Error
          </h2>

          {/* Only show error details in development */}
          {process.env.NODE_ENV === 'development' && (
            <pre style={{
              marginTop: '16px',
              width: '100%',
              maxWidth: '48rem',
              whiteSpace: 'pre-wrap',
              borderRadius: '8px',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '16px',
              fontSize: '12px',
              color: '#fca5a5',
              marginBottom: '24px',
              overflow: 'auto',
              maxHeight: '300px',
            }}>
              {error?.message}
              {'\n\n'}
              {error?.stack}
            </pre>
          )}

          {/* Production message */}
          {process.env.NODE_ENV !== 'development' && (
            <p style={{
              color: '#9ca3af',
              marginBottom: '16px',
              maxWidth: '28rem',
              textAlign: 'center',
            }}>
              An unexpected error occurred. Our team has been notified and will work to fix it.
            </p>
          )}

          {error?.digest && (
            <p style={{
              fontSize: '12px',
              color: '#6b7280',
              fontFamily: 'monospace',
              marginBottom: '24px',
            }}>
              Error ID: {error.digest}
            </p>
          )}

          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={reset}
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '14px',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#1d4ed8')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#2563eb')}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 20px',
                background: '#4b5563',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '14px',
                textDecoration: 'none',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#3f4551')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#4b5563')}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

