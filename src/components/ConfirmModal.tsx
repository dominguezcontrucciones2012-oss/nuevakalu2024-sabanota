import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700/50 rounded-xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden">
        {/* Glow de fondo para darle estética Kalu */}
        <div className={`absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20 ${isDestructive ? 'bg-red-500' : 'bg-indigo-500'}`} />
        
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-neutral-300 text-sm mb-6 whitespace-pre-wrap">{message}</p>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium text-white shadow-lg ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-500 shadow-red-900/50' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/50'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
