// frontend/src/components/ConfirmDialog.jsx
import React from 'react';

const toneStyles = {
  default: {
    headerBg: 'bg-indigo-600',
    icon: 'ℹ️',
    confirmBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  },
  danger: {
    headerBg: 'bg-red-600',
    icon: '⚠️',
    confirmBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    headerBg: 'bg-amber-500',
    icon: '⚠️',
    confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
};

export default function ConfirmDialog({
  open,
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  tone = 'default',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const s = toneStyles[tone] || toneStyles.default;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white w-[90%] max-w-md rounded-xl shadow-lg overflow-hidden">
        <div className={`${s.headerBg} text-white px-4 py-3 flex items-center gap-2`}>
          <span className="text-xl">{s.icon}</span>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="p-4 text-gray-700">
          {typeof message === 'string' ? (
            <p className="whitespace-pre-line leading-relaxed">{message}</p>
          ) : (
            message
          )}
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">{cancelText}</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-md ${s.confirmBtn}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
