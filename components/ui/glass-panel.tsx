"use client";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

export function GlassPanel({ children, className = '', position = 'top-left' }: GlassPanelProps) {
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4', 
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
  };

  return (
    <div className={`
      absolute z-10 
      bg-white/90 backdrop-blur-sm 
      rounded-xl shadow-lg border border-white/20
      ${positionClasses[position]}
      ${className}
    `}>
      {children}
    </div>
  );
}
