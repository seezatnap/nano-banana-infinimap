"use client";
import { useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TileGenerateModal } from "./TileGenerateModal";

interface TileControlsProps {
  x: number;
  y: number;
  z: number;
  exists: boolean;
  onGenerate: (prompt: string) => Promise<void>;
  onRegenerate: (prompt: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefreshTiles?: () => void;
}

export default function TileControls({ x, y, z, exists, onGenerate, onRegenerate, onDelete, onRefreshTiles }: TileControlsProps) {
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (error) {
      console.error("Failed to delete tile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-1">
      <Tooltip.Provider delayDuration={300}>
        {!exists ? (
          // Generate button for empty tiles
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button 
                className="w-7 h-7 rounded border border-emerald-700 bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg" 
                title="Generate tile"
                onClick={() => setGenerateModalOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs leading-none z-[10002]" sideOffset={5}>
                Generate new tile
                <Tooltip.Arrow className="fill-gray-900" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          // Regenerate and Delete buttons for existing tiles
          <>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button 
                  className="w-7 h-7 rounded border border-blue-700 bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg" 
                  title="Regenerate tile"
                  onClick={() => setGenerateModalOpen(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8a6 6 0 1 0 6-6v3m0-3L5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs leading-none z-[10002]" sideOffset={5}>
                  Regenerate tile
                  <Tooltip.Arrow className="fill-gray-900" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <AlertDialog.Trigger asChild>
                    <button className="w-7 h-7 rounded border border-red-700 bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg" title="Delete tile">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </AlertDialog.Trigger>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs leading-none z-[10002]" sideOffset={5}>
                    Delete tile
                    <Tooltip.Arrow className="fill-gray-900" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <AlertDialog.Portal>
                <AlertDialog.Overlay data-dialog-root className="fixed inset-0 bg-black/50 z-[10000]" />
                <AlertDialog.Content data-dialog-root className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl p-6 w-[90vw] max-w-[450px] max-h-[85vh] z-[10001]">
                  <AlertDialog.Title className="text-lg font-semibold text-gray-900 m-0">Delete Tile?</AlertDialog.Title>
                  <AlertDialog.Description className="mt-2 mb-5 text-sm text-gray-600 leading-relaxed">
                    This will permanently delete the tile at position ({x}, {y}). This action cannot be undone.
                  </AlertDialog.Description>
                  <div className="flex gap-2 justify-end">
                    <AlertDialog.Cancel asChild>
                      <button className="px-4 py-2 rounded text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading}>
                        Cancel
                      </button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <button 
                        className="px-4 py-2 rounded text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                        onClick={handleDelete}
                        disabled={loading}
                      >
                        {loading ? "Deleting..." : "Delete"}
                      </button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </>
        )}
      </Tooltip.Provider>
      
      {/* Generate/Regenerate Modal */}
      <TileGenerateModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        x={x}
        y={y}
        z={z}
        onUpdate={() => {
          if (onRefreshTiles) {
            onRefreshTiles();
          } else {
            // Fallback: perform a light tile-layer refresh by forcing a small delay then reloading
            // This keeps previous behavior if parent does not provide a refresher.
            setTimeout(() => window.location.reload(), 50);
          }
        }}
      />
    </div>
  );
}
