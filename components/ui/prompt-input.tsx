"use client";

import { Play } from "lucide-react";
import { memo } from "react";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const PromptInput = memo(function PromptInput({ 
  value, 
  onChange, 
  onSubmit, 
  loading, 
  disabled = false,
  placeholder = "Describe what you want to generate..."
}: PromptInputProps) {
  const canSubmit = !loading && !disabled && value.trim().length > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="min-h-[64px] w-full resize-y rounded-xl border border-gray-300 px-3 py-2 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition-colors"
        rows={3}
        disabled={disabled || loading}
      />
      <div className="absolute bottom-2 right-2">
        <button
          type="button"
          aria-label="Generate (⌘+Enter)"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-auto transition-colors"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
          ) : (
            <Play className="h-3.5 w-3.5 text-white" />
          )}
        </button>
      </div>
    </div>
  );
});
