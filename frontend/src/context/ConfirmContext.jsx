// frontend/src/context/ConfirmContext.jsx
// 一个全局确认弹窗上下文，提供 Promise 风格的 confirm(options) API
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState({
    open: false,
    title: '确认操作',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    tone: 'default', // default | danger | warning
    resolve: null,
  });

  const close = useCallback((result) => {
    setState((prev) => {
      if (prev.resolve) {
        try { prev.resolve(Boolean(result)); } catch {}
      }
      return { ...prev, open: false, resolve: null };
    });
  }, []);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: options.title || '确认操作',
        message: options.message || '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        tone: options.tone || 'default',
        resolve,
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        message={state.message}
        confirmText={state.confirmText}
        cancelText={state.cancelText}
        tone={state.tone}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 必须在 <ConfirmProvider> 内部使用');
  return ctx.confirm;
};
