import React from 'react';

interface KaluLoaderProps {
  message?: string;
  subMessage?: string;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function KaluLoader({
  message = 'MUNDO KALU',
  subMessage = 'CARGANDO SESIÓN...',
  fullScreen = false,
  size = 'md',
  className = ''
}: KaluLoaderProps) {
  
  const sizeClasses = {
    sm: {
      container: 'w-12 h-12 mb-3',
      text: 'text-2xl',
      title: 'text-sm',
      sub: 'text-[8px]'
    },
    md: {
      container: 'w-20 h-20 mb-6',
      text: 'text-4xl',
      title: 'text-xl',
      sub: 'text-[10px]'
    },
    lg: {
      container: 'w-24 h-24 mb-8',
      text: 'text-5xl',
      title: 'text-2xl',
      sub: 'text-xs'
    }
  }[size];

  const content = (
    <div className={`flex flex-col justify-center items-center px-6 relative z-10 animate-fade-in text-center select-none ${className}`}>
      {/* Círculo Corporativo con K y Anillo Giratorio */}
      <div className={`${sizeClasses.container} bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto relative shadow-[0_0_25px_rgba(16,185,129,0.15)]`}>
        <div className="absolute inset-0 rounded-full border-t-2 border-emerald-500 animate-spin"></div>
        <span className={`${sizeClasses.text} font-black text-emerald-500 leading-none font-serif select-none`}>
          K
        </span>
      </div>

      {/* Título de Marca */}
      {message && (
        <h2 className={`${sizeClasses.title} font-bold tracking-widest text-slate-200 uppercase font-sans leading-tight`}>
          {message}
        </h2>
      )}

      {/* Submensaje de Estado Asíncrono */}
      {subMessage && (
        <p className={`${sizeClasses.sub} text-slate-500 font-mono tracking-widest mt-2 uppercase animate-pulse`}>
          {subMessage}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center">
        {content}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-10 bg-slate-950 w-full h-full min-h-[180px]">
      {content}
    </div>
  );
}
