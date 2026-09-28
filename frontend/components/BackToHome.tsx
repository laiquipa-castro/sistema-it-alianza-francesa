'use client';

import { ArrowLeft, Home } from 'lucide-react';

interface BackToHomeProps {
  onClick: () => void;
  label?: string;
  variant?: 'light' | 'solid';
}

/**
 * Botón reutilizable de navegación "Volver al Inicio".
 * Evita duplicar el marcado en las distintas subpáginas/secciones del frontend.
 */
export default function BackToHome({
  onClick,
  label = 'Volver al Inicio',
  variant = 'light',
}: BackToHomeProps) {
  const base =
    'inline-flex items-center gap-2 rounded-xl text-sm font-semibold transition-all px-4 py-2 shrink-0';
  const styles =
    variant === 'solid'
      ? 'bg-[#ED1C24] text-white hover:bg-[#C41219] shadow-sm'
      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Volver al Inicio"
      className={`${base} ${styles}`}
    >
      <ArrowLeft className="w-4 h-4" />
      <Home className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
