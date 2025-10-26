// frontend/src/components/ToastContainer.jsx
import React from 'react';

const styles = {
  base: 'pointer-events-none fixed top-4 right-4 z-[1000] flex flex-col gap-2',
  item: 'pointer-events-auto w-80 max-w-[92vw] rounded-lg shadow-lg border px-4 py-3 flex items-start gap-3 bg-white',
  close: 'ml-auto text-gray-400 hover:text-gray-600',
  icon: {
    success: '✅',
    error: '⛔',
    info: 'ℹ️',
    warning: '⚠️',
  },
  ring: {
    success: 'border-emerald-200',
    error: 'border-red-200',
    info: 'border-indigo-200',
    warning: 'border-amber-200',
  },
  title: 'text-sm font-semibold text-gray-900',
  msg: 'text-sm text-gray-700',
};

export default function ToastContainer({ toasts = [], onClose = () => {} }) {
  return (
    <div className={styles.base}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.item} ${styles.ring[t.type] || styles.ring.info}`}>
          <div className="text-xl leading-6">{styles.icon[t.type] || styles.icon.info}</div>
          <div className="flex-1 min-w-0">
            {t.title && <div className={styles.title}>{t.title}</div>}
            <div className={styles.msg}>{t.message}</div>
          </div>
          <button onClick={() => onClose(t.id)} className={styles.close} aria-label="关闭">✕</button>
        </div>
      ))}
    </div>
  );
}
