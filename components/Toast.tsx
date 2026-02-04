"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Info, XCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, x: 100 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="pointer-events-auto"
            >
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-lg backdrop-blur-xl border shadow-lg min-w-[300px] ${
                  toast.type === "success"
                    ? "bg-green-500/10 border-green-500/30"
                    : toast.type === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-cyan-500/10 border-cyan-500/30"
                }`}
              >
                {toast.type === "success" && (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                )}
                {toast.type === "error" && (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
                {toast.type === "info" && (
                  <Info className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                )}
                <p className="text-sm flex-1">{toast.message}</p>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
      }
