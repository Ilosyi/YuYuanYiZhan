// frontend/src/context/ToastContext.jsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastContainer from '../components/ToastContainer';

const ToastContext = createContext(null);

let idSeq = 1;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timers = timersRef.current;
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }, []);

  const push = useCallback((t) => {
    const id = idSeq++;
    const toast = {
      id,
      type: t.type || 'info',
      message: t.message || '',
      title: t.title || undefined,
      duration: typeof t.duration === 'number' ? t.duration : 2500,
    };
    setToasts((prev) => [...prev, toast]);
    if (toast.duration > 0) {
      const timer = setTimeout(() => remove(id), toast.duration);
      timersRef.current.set(id, timer);
    }
    return id;
  }, [remove]);

  const api = useMemo(() => ({
    notify: (opts) => push(opts || {}),
    success: (msg, opts = {}) => push({ type: 'success', message: msg, ...opts }),
    error: (msg, opts = {}) => push({ type: 'error', message: msg, ...opts }),
    info: (msg, opts = {}) => push({ type: 'info', message: msg, ...opts }),
    warning: (msg, opts = {}) => push({ type: 'warning', message: msg, ...opts }),
    remove,
  }), [push, remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内部使用');
  return ctx;
};
