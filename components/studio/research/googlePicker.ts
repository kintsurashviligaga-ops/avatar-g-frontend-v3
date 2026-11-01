/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { gapi?: any; google?: any }
}

let loading: Promise<void> | null = null;

/** A blocked script or failed module load is bounded and can be retried on the next click. */
export function loadGooglePicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (loading) return loading;
  const attempt = new Promise<void>((resolve, reject) => {
    let script: HTMLScriptElement | null = null;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (error) { script?.remove(); reject(error); } else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error('picker_timeout')), 15_000);
    const moduleLoad = () => {
      try {
        window.gapi.load('picker', {
          callback: () => finish(window.google?.picker ? undefined : new Error('picker_missing')),
          onerror: () => finish(new Error('picker_load')),
          timeout: 10_000,
          ontimeout: () => finish(new Error('picker_timeout')),
        });
      } catch { finish(new Error('picker_load')); }
    };
    if (window.gapi) { moduleLoad(); return; }
    script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = moduleLoad;
    script.onerror = () => finish(new Error('gapi_load'));
    document.head.appendChild(script);
  });
  loading = attempt.catch((error: unknown) => { loading = null; throw error; });
  return loading;
}
