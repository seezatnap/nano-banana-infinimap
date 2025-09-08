"use client";

import { useState, memo } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Plus, RotateCcw } from "lucide-react";
import { SelectedTile } from "../types/map";
import { ActionButton } from "../ui/action-button";
import { TileGenerateModal } from "../tile-generate-modal/tile-generate-modal";

interface TileMenuProps {
  tile: SelectedTile;
  exists: boolean;
  onGenerate: (prompt: string) => Promise<void>;
  onRegenerate: (prompt: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefreshTiles?: () => void;
}

export const TileMenu = memo(function TileMenu({ 
  tile, 
  exists, 
  onGenerate, 
  onRegenerate, 
  onDelete, 
  onRefreshTiles 
}: TileMenuProps) {
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: tile.screenX,
        top: tile.screenY,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
      }}
    >
      <div
        data-tile-menu
        className="pointer-events-auto bg-white/95 backdrop-blur-sm rounded-xl shadow-xl p-3 border border-white/20"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-gray-500 mb-2 font-mono">
          Tile ({tile.x}, {tile.y})
        </div>
        
        <div className="flex gap-2">
          <Tooltip.Provider delayDuration={300}>
            {/* Direct Delete Button (Working) */}
            {exists && (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="w-7 h-7 rounded border border-orange-700 bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg text-xs font-bold"
                    title="Delete tile"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await onDelete();
                      } catch (error) {
                        console.error('Failed to delete tile:', error);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    ) : (
                      'D'
                    )}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs z-[10002]" sideOffset={5}>
                    Delete tile
                    <Tooltip.Arrow className="fill-gray-900" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
            {!exists ? (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <ActionButton
                    icon={<Plus size={16} />}
                    label="Generate"
                    variant="success"
                    size="sm"
                    onClick={() => setGenerateModalOpen(true)}
                  />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs z-[10002]" sideOffset={5}>
                    Generate new tile
                    <Tooltip.Arrow className="fill-gray-900" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            ) : (
              <>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <ActionButton
                      icon={<RotateCcw size={16} />}
                      label="Regenerate"
                      variant="primary"
                      size="sm"
                      onClick={() => setGenerateModalOpen(true)}
                    />
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="bg-gray-900 text-white px-2 py-1 rounded text-xs z-[10002]" sideOffset={5}>
                      Regenerate tile
                      <Tooltip.Arrow className="fill-gray-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>

              </>
            )}
          </Tooltip.Provider>
        </div>
      </div>

      {/* Generate/Regenerate Modal */}
      <TileGenerateModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        x={tile.x}
        y={tile.y}
        z={8} // MAX_Z
        onUpdate={() => {
          if (onRefreshTiles) {
            onRefreshTiles();
          } else {
            setTimeout(() => window.location.reload(), 50);
          }
        }}
      />
    </div>
  );
});
