"use client";

import { ReactNode } from "react";

interface ActionButtonProps {
  icon?: ReactNode;
  label: string;
  variant: 'primary' | 'success' | 'danger' | 'secondary';
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ActionButton({ 
  icon, 
  label, 
  variant, 
  onClick, 
  disabled = false, 
  loading = false,
  size = 'md',
  className = '' 
}: ActionButtonProps) {
  const baseClasses = "rounded-lg border font-medium transition-all hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none flex items-center justify-center gap-2";
  
  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "px-3 py-2 text-sm"
  };

  const variantClasses = {
    primary: "border-blue-700 bg-blue-500 hover:bg-blue-600 text-white",
    success: "border-emerald-700 bg-emerald-500 hover:bg-emerald-600 text-white", 
    danger: "border-red-700 bg-red-500 hover:bg-red-600 text-white",
    secondary: "border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
    >
      {loading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
      ) : (
        icon
      )}
      {size === 'md' && <span>{label}</span>}
    </button>
  );
}
