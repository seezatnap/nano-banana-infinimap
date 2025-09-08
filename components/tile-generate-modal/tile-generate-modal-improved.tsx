"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Check } from "lucide-react";
import { useTileGeneration } from "../hooks/useTileGeneration";
import { PromptInput } from "../ui/prompt-input";
import { TileGrid } from "../ui/tile-grid";
import { PreviewControls } from "../ui/preview-controls";
import { ErrorMessage } from "../ui/error-message";
import { ActionButton } from "../ui/action-button";

interface TileGenerateModalProps {
  open: boolean;
  onClose: () => void;
  x: number;
  y: number;
  z: number;
  onUpdate: () => void;
}

export function TileGenerateModalImproved({ 
  open, 
  onClose, 
  x, 
  y, 
  z, 
  onUpdate 
}: TileGenerateModalProps) {
  const [tiles, setTiles] = useState<string[][]>([]);
  const [prompt, setPrompt] = useState("");
  const [blendPreview, setBlendPreview] = useState<boolean>(true);
  const [loadingTiles, setLoadingTiles] = useState(true);
  const [newTilePositions, setNewTilePositions] = useState<Set<string>>(new Set());
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("preview");

  const {
    loading,
    error,
    previewTiles,
    generatePreview,
    updatePreviewMode,
    confirmGeneration,
    clearError,
    reset
  } = useTileGeneration({ x, y, z, onUpdate });

  // Load the 3x3 grid of tiles with selective cache busting
  const loadTiles = useCallback(async () => {
    if (!open) return;
    
    setLoadingTiles(true);
    const newTiles: string[][] = [];
    const newPositions = new Set<string>();
    
    try {
      // Fetch metadata for all tiles
      const metadataPromises = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          metadataPromises.push(
            fetch(`/api/meta/${z}/${tileX}/${tileY}`)
              .then(r => r.json())
              .then(data => ({ x: tileX, y: tileY, ...data }))
          );
        }
      }
      
      const metadata = await Promise.all(metadataPromises);
      
      // Create URLs with cache busting
      for (let dy = -1; dy <= 1; dy++) {
        const row: string[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          const tileMeta = metadata.find(m => m.x === tileX && m.y === tileY);
          
          if (tileMeta?.status === 'EMPTY') {
            newPositions.add(`${tileX},${tileY}`);
          }
          
          const cacheBuster = tileMeta?.updatedAt 
            ? new Date(tileMeta.updatedAt).getTime() 
            : Date.now();
          const url = `/api/tiles/${z}/${tileX}/${tileY}?v=${cacheBuster}`;
          row.push(url);
        }
        newTiles.push(row);
      }
      
      setTiles(newTiles);
      setNewTilePositions(newPositions);
      setSelectedPositions(new Set());
    } catch (error) {
      console.error('Failed to load tiles:', error);
    } finally {
      setLoadingTiles(false);
    }
  }, [open, x, y, z]);

  useEffect(() => {
    loadTiles();
  }, [loadTiles]);

  // Initialize default selections when preview is loaded
  useEffect(() => {
    if (previewTiles && selectedPositions.size === 0) {
      const defaultSelections = new Set<string>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          defaultSelections.add(`${tileX},${tileY}`);
        }
      }
      setSelectedPositions(defaultSelections);
    }
  }, [previewTiles, selectedPositions.size, x, y]);

  const handleGenerate = useCallback(async () => {
    try {
      await generatePreview(prompt, blendPreview);
    } catch (error) {
      // Error handled by hook
    }
  }, [prompt, blendPreview, generatePreview]);

  const handleBlendModeChange = useCallback(async (blend: boolean) => {
    setBlendPreview(blend);
    await updatePreviewMode(blend);
  }, [updatePreviewMode]);

  const handleTileSelect = useCallback((tileX: number, tileY: number, selected: boolean) => {
    setSelectedPositions(prev => {
      const next = new Set(prev);
      const key = `${tileX},${tileY}`;
      if (selected) {
        next.add(key);
      } else {
        next.delete(key);
      }
      // Center tile must always be selected
      next.add(`${x},${y}`);
      return next;
    });
  }, [x, y]);

  const handleAccept = useCallback(async () => {
    try {
      await confirmGeneration(selectedPositions);
      handleClose();
    } catch (error) {
      // Error handled by hook
    }
  }, [confirmGeneration, selectedPositions]);

  const handleClose = useCallback(() => {
    reset();
    setPrompt("");
    setSelectedPositions(new Set());
    setActiveTab("preview");
    onClose();
  }, [reset, onClose]);

  const displayTiles = useMemo(() => {
    if (activeTab === "preview" && previewTiles) {
      // Show blended tiles based on selections
      return tiles.map((row, dy) =>
        row.map((originalTile, dx) => {
          const tileX = x + dx - 1;
          const tileY = y + dy - 1;
          const key = `${tileX},${tileY}`;
          const isSelected = selectedPositions.has(key);
          return isSelected ? previewTiles[dy][dx] : originalTile;
        })
      );
    }
    return tiles;
  }, [activeTab, tiles, previewTiles, selectedPositions, x, y]);

  const canAccept = previewTiles && selectedPositions.size > 0 && !loading;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000]" />
        <Dialog.Content 
          data-dialog-root 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-0 w-[min(100vw,800px)] max-h-[90vh] overflow-auto z-[10001]"
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 pt-4">
              <Dialog.Title className="text-lg font-semibold">Generate Preview</Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mb-3">
                Provide a prompt, review the 3×3 preview, then approve changes.
              </Dialog.Description>
            </div>

            <div className="px-4 pb-4 space-y-4 flex-1">
              {/* Prompt Input */}
              <div className="space-y-2">
                <PromptInput
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={previewTiles ? handleGenerate : handleGenerate}
                  loading={loading}
                />
                {error && (
                  <ErrorMessage 
                    error={error} 
                    onRetry={clearError} 
                  />
                )}
              </div>

              {/* Preview Tabs */}
              <div className="space-y-2">
                <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                  <PreviewControls
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    blendMode={blendPreview}
                    onBlendModeChange={handleBlendModeChange}
                  />

                  <Tabs.Content value="original">
                    <TileGrid
                      tiles={tiles}
                      loading={loadingTiles}
                      className="mt-2"
                    />
                  </Tabs.Content>

                  <Tabs.Content value="preview">
                    <TileGrid
                      tiles={displayTiles}
                      loading={loadingTiles}
                      onTileSelect={previewTiles ? handleTileSelect : undefined}
                      selectedPositions={selectedPositions}
                      newTilePositions={newTilePositions}
                      centerX={x}
                      centerY={y}
                      showControls={!!previewTiles}
                      className="mt-2"
                    />
                    {previewTiles && (
                      <div className="text-xs text-gray-600 mt-2 space-y-1">
                        <p>Selected {selectedPositions.size} of 9 tiles to apply.</p>
                        <p>Preview mode: {blendPreview ? 'Blended (existing tiles fade to edges)' : 'Raw model output'}</p>
                      </div>
                    )}
                  </Tabs.Content>
                </Tabs.Root>
              </div>

              {/* Actions */}
              <div className="flex w-full items-center justify-end gap-2 pt-2">
                <ActionButton
                  label="Cancel"
                  variant="secondary"
                  onClick={handleClose}
                />
                <ActionButton
                  label="Reset"
                  variant="secondary"
                  onClick={reset}
                  disabled={loading}
                />
                <ActionButton
                  icon={<Check className="w-4 h-4" />}
                  label="Accept Changes"
                  variant="success"
                  onClick={handleAccept}
                  disabled={!canAccept}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
