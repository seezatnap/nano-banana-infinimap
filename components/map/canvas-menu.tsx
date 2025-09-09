"use client";

import { useState, memo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Settings, Trash2, RotateCcw } from "lucide-react";
import { LoadingSpinner } from "../ui/loading-spinner";

interface CanvasMenuProps {
  onCanvasReset?: () => void;
}

export const CanvasMenu = memo(function CanvasMenu({ onCanvasReset }: CanvasMenuProps) {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/canvas/reset', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset canvas');
      }

      const data = await response.json();
      console.log('Canvas reset:', data.message);
      
      // Call the callback to refresh the map
      if (onCanvasReset) {
        onCanvasReset();
      } else {
        // Fallback: reload the page
        window.location.reload();
      }
      
      setResetDialogOpen(false);
    } catch (error) {
      console.error('Failed to reset canvas:', error);
      alert('Failed to reset canvas. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Canvas Options"
          disabled={loading}
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
          ) : (
            <Settings className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Canvas</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content 
          align="end" 
          className="bg-white rounded-xl shadow-xl border border-gray-200 p-1 min-w-[180px] z-[10002]"
        >
          <div className="px-2 py-1 text-[11px] text-gray-600 font-medium">Canvas Options</div>
          <div className="my-1 h-px bg-gray-200" />
          
          <DropdownMenu.Item asChild>
            <button
              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              onClick={() => setResetDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
              Reset Canvas
            </button>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <button
              className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="h-4 w-4 text-blue-500" />
              Refresh Page
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>

      {/* Reset Confirmation Dialog */}
      <AlertDialog.Root open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-[10000]" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 w-[90vw] max-w-[450px] z-[10001]">
            <AlertDialog.Title className="text-lg font-semibold text-gray-900 mb-2">
              Reset Canvas?
            </AlertDialog.Title>
            <div className="mb-4">
              <AlertDialog.Description className="text-sm text-gray-600">
                This will permanently delete:
              </AlertDialog.Description>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-gray-600">
                <li>All generated tiles</li>
                <li>All tile metadata</li>
                <li>All generation history</li>
              </ul>
              <p className="mt-2 text-sm font-medium text-red-600">
                This action cannot be undone.
              </p>
            </div>
            
            {loading && (
              <div className="flex justify-center mb-4">
                <LoadingSpinner size="sm" text="Resetting canvas..." />
              </div>
            )}
            
            <div className="flex gap-2 justify-end">
              <AlertDialog.Cancel asChild>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  disabled={loading}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleReset}
                disabled={loading}
              >
                {loading ? "Resetting..." : "Reset Canvas"}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </DropdownMenu.Root>
  );
});
