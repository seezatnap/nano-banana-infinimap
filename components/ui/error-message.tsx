"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { memo } from "react";

interface ErrorMessageProps {
  error: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorMessage = memo(function ErrorMessage({ 
  error, 
  onRetry, 
  className = "" 
}: ErrorMessageProps) {
  return (
    <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-red-800 text-sm font-medium">Error</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1 text-red-600 text-xs hover:text-red-800 font-medium transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
