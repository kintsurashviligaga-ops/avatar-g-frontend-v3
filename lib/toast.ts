type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  title?: string;
  description: string;
  type?: ToastType;
  duration?: number;
}

class ToastManager {
  private listeners: Set<(toast: ToastOptions & { id: string }) => void> = new Set();

  subscribe(callback: (toast: ToastOptions & { id: string }) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  show(options: ToastOptions) {
    const id = Math.random().toString(36).substr(2, 9);
    const toast = { ...options, id };
    this.listeners.forEach(listener => listener(toast));
  }

  success(description: string, title?: string) {
    this.show({ description, title, type: 'success' });
  }

  error(description: string, title?: string) {
    this.show({ description, title, type: 'error' });
  }

  info(description: string, title?: string) {
    this.show({ description, title, type: 'info' });
  }

  warning(description: string, title?: string) {
    this.show({ description, title, type: 'warning' });
  }
}

export const toast = new ToastManager();
