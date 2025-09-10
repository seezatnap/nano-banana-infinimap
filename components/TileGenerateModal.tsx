"use client";

import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Check, Play, Settings, X as Close, RotateCcw, Wand2 } from "lucide-react";
import { z } from "zod";

interface TileGenerateModalProps {
  open: boolean;
  onClose: () => void;
  x: number;
  y: number;
  z: number;
  onUpdate: () => void;
}

const TILE_SIZE = 256;
const GRID_SIZE = 3;

export function TileGenerateModal({ open, onClose, x, y, z, onUpdate }: TileGenerateModalProps) {
  const [tiles, setTiles] = useState<string[][]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [blendPreview, setBlendPreview] = useState<boolean>(true);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [driftPeak, setDriftPeak] = useState<number | null>(null);
  const [driftLoading, setDriftLoading] = useState<boolean>(false);
  const [previewTiles, setPreviewTiles] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTiles, setLoadingTiles] = useState(true);
  const [newTilePositions, setNewTilePositions] = useState<Set<string>>(new Set());
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("preview");
  // Nudge (drift correction) controls are optional and off by default
  const [nudgeOpen, setNudgeOpen] = useState<boolean>(false);
  const [nudgeApplied, setNudgeApplied] = useState<boolean>(false);

  // Load the 3x3 grid of tiles with selective cache busting
  useEffect(() => {
    if (!open) return;
    
    const loadTiles = async () => {
      setLoadingTiles(true);
      const newTiles: string[][] = [];
      const newPositions = new Set<string>();
      
      // First, fetch metadata for all tiles to get their status and timestamps
      const metadataPromises: Promise<{x: number, y: number, status: string, updatedAt: string | null}>[] = [];
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
      
      // Create URLs with cache busting based on metadata
      for (let dy = -1; dy <= 1; dy++) {
        const row: string[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          const tileMeta = metadata.find(m => m.x === tileX && m.y === tileY);
          
          // Check if this is a new/empty tile
          if (tileMeta?.status === 'EMPTY') {
            newPositions.add(`${tileX},${tileY}`);
          }
          
          // Add cache buster based on updatedAt or current time for fresh load
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
      // Reset selections when opening or coordinates change
      setSelectedPositions(new Set());
      setLoadingTiles(false);
    };
    
    loadTiles();
  }, [open, x, y, z]);

  // Extract 9 tiles from a composite image
  const extractTilesFromComposite = async (compositeUrl: string): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const extractedTiles: string[][] = [];
        
        // Calculate scale in case image is not exactly 768x768
        const expectedSize = TILE_SIZE * 3; // 768
        const scaleX = img.width / expectedSize;
        const scaleY = img.height / expectedSize;
        
        for (let dy = 0; dy < 3; dy++) {
          const row: string[] = [];
          for (let dx = 0; dx < 3; dx++) {
            const canvas = document.createElement('canvas');
            canvas.width = TILE_SIZE;
            canvas.height = TILE_SIZE;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Scale source coordinates if needed
              const sx = dx * TILE_SIZE * scaleX;
              const sy = dy * TILE_SIZE * scaleY;
              const sw = TILE_SIZE * scaleX;
              const sh = TILE_SIZE * scaleY;
              
              ctx.drawImage(
                img,
                sx, sy, sw, sh,                   // source rect (scaled if needed)
                0, 0, TILE_SIZE, TILE_SIZE       // destination rect (always 256x256)
              );
              row.push(canvas.toDataURL('image/webp'));
            }
          }
          extractedTiles.push(row);
        }
        
        resolve(extractedTiles);
      };
      img.onerror = (err) => {
        console.error('Failed to load composite image:', err);
        reject(err);
      };
      img.src = compositeUrl;
    });
  };

  const loadPreviewTiles = async (id: string, blended: boolean, txOverride?: number, tyOverride?: number) => {
    const tx = (txOverride != null ? Math.round(txOverride) : Math.round(offsetX)) || 0;
    const ty = (tyOverride != null ? Math.round(tyOverride) : Math.round(offsetY)) || 0;
    const qp = blended ? `?mode=blended&tx=${tx}&ty=${ty}` : '';
    const url = `/api/preview/${id}${qp}`;
    setPreviewUrl(url);
    const extractedTiles = await extractTilesFromComposite(url);
    setPreviewTiles(extractedTiles);
    // Initialize default selection on first load: select all tiles by default
    setSelectedPositions(prev => {
      if (prev.size > 0) return prev;
      const sel = new Set<string>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          const key = `${tileX},${tileY}`;
          sel.add(key);
        }
      }
      return sel;
    });
  };

  // Utility: turn a data URL into a Blob
  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  // Compute drift between existing center and raw generated center; set offsets
  const computeDrift = async (id: string) => {
    try {
      setDriftLoading(true);
      // Ensure we have raw generated tiles
      const rawUrl = `/api/preview/${id}`; // raw mode
      const rawTiles = await extractTilesFromComposite(rawUrl);
      if (!tiles || !rawTiles) return;

      // Choose only selected positions that already exist
      const pairs: { ex: string; gen: string }[] = [];
      const positionsUsed: string[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = x + dx;
          const tileY = y + dy;
          const key = `${tileX},${tileY}`;
          const selected = selectedPositions.size > 0 ? selectedPositions.has(key) : true; // default to all existing
          const exists = !newTilePositions.has(key);
          if (!selected || !exists) continue;
          const ex = tiles[dy + 1]?.[dx + 1];
          const gen = rawTiles[dy + 1]?.[dx + 1];
          if (ex && gen) {
            pairs.push({ ex, gen });
            positionsUsed.push(key);
          }
        }
      }

      if (pairs.length === 0) {
        // No existing tiles in selection -> zero drift
        setOffsetX(0); setOffsetY(0); setDriftPeak(null);
        return { tx: 0, ty: 0 };
      }

      // Compute drift per pair and average
      const dxs: number[] = [], dys: number[] = [], peaks: number[] = [];
      for (const p of pairs) {
        const form = new FormData();
        form.append('a', await dataUrlToBlob(p.ex), 'a.png');
        form.append('b', await dataUrlToBlob(p.gen), 'b.png');
        const resp = await fetch('/api/drift', { method: 'POST', body: form });
        if (!resp.ok) continue;
        const json = await resp.json();
        dxs.push(json.dx || 0);
        dys.push(json.dy || 0);
        if (typeof json.peakValue === 'number') peaks.push(json.peakValue);
      }

      if (dxs.length === 0) { setOffsetX(0); setOffsetY(0); setDriftPeak(null); return; }

      const avg = (arr: number[]) => arr.reduce((a,b)=>a+b,0) / arr.length;
      // Use measured drift directly as the adjustment so UI displays
      // values in the same direction the overlay will move.
      const tx = Math.round(avg(dxs));
      const ty = Math.round(avg(dys));
      setOffsetX(tx);
      setOffsetY(ty);
      setDriftPeak(peaks.length ? avg(peaks) : null);
      return { tx, ty };
    } catch (e) {
      // ignore failures silently in UI
    } finally {
      setDriftLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/edit-tile/${z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to edit tile");
      }
      const data = await response.json();
      setPreviewId(data.previewId);
      // Default to no drift correction until user opts-in
      await loadPreviewTiles(data.previewId, blendPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!previewId) return;
    
    setLoading(true);
    
    try {
      const response = await fetch(`/api/confirm-edit/${z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          previewUrl: `/api/preview/${previewId}`,
          selectedPositions: Array.from(selectedPositions).map(s => { const [sx,sy] = s.split(',').map(Number); return { x: sx, y: sy }; }),
          offsetX: blendPreview && nudgeApplied ? Math.round(offsetX) : undefined,
          offsetY: blendPreview && nudgeApplied ? Math.round(offsetY) : undefined,
        }),
      });
      if (!response.ok) throw new Error("Failed to confirm edits");
      
      onUpdate();
      handleReset();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/edit-tile/${z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to regenerate preview");
      }
      const data = await response.json();
      setPreviewId(data.previewId);
      // Default to no drift correction until user opts-in
      await loadPreviewTiles(data.previewId, blendPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPrompt("");
    setPreviewUrl(null);
    setPreviewId(null);
    setPreviewTiles(null);
    setError(null);
    setOffsetX(0);
    setOffsetY(0);
    setDriftPeak(null);
    setNudgeOpen(false);
    setNudgeApplied(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000]" />
        <Dialog.Content data-dialog-root className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-0 w-[min(100vw,800px)] max-h-[90vh] overflow-auto z-[10001]">
          <div className="flex flex-col h-full">
            <div className="px-4 pt-4">
              <Dialog.Title className="text-lg">Generate Preview</Dialog.Title>
              <Dialog.Description className="text-xs mb-3">
                Provide a prompt, review the 3×3 preview, then approve changes.
              </Dialog.Description>
            </div>

            <div className="px-4 pb-4 space-y-4 flex-1">
              {/* Prompt area with circular generate CTA */}
              <div className="space-y-2">
                <div className="relative">
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want to generate..."
                    className="min-h-[64px] w-full resize-y rounded-xl border border-gray-300 px-3 py-2 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    rows={3}
                    disabled={loading}
                  />
                  <div className="absolute bottom-2 right-2">
                    <button
                      type="button"
                      aria-label="Generate"
                      onClick={() => (previewTiles ? handleRetry() : handleEdit())}
                      disabled={loading || !prompt.trim()}
                      className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-auto"
                    >
                      <Play className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                    {error}
                  </div>
                )}
              </div>

              {/* Tabs: Original vs Preview */}
              <div className="space-y-2">
                <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Image View</span>
                  <div className="flex items-center gap-2">
                      <Tabs.List className="rounded-xl text-xs border overflow-hidden">
                        <Tabs.Trigger value="original" className="px-2 py-1 text-xs data-[state=active]:bg-gray-200">
                          Original
                        </Tabs.Trigger>
                        <Tabs.Trigger value="preview" className="px-2 py-1 text-xs data-[state=active]:bg-gray-200">
                          Preview
                        </Tabs.Trigger>
                      </Tabs.List>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            className="h-7 w-7 rounded-full border hover:bg-gray-50 inline-flex items-center justify-center"
                            aria-label="Preview Settings"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end" className="bg-white rounded-md shadow border p-1 text-sm z-[10002]">
                          <div className="px-2 py-1 text-[11px] text-gray-600">Preview Settings</div>
                          <div className="my-1 h-px bg-gray-200" />
                          <div className="px-1 py-1">
                            <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
                              <input
                                type="radio"
                                name="blendMode"
                                className="accent-blue-600"
                                checked={!blendPreview}
                                onChange={async () => {
                                  setBlendPreview(false);
                                  if (previewId) await loadPreviewTiles(previewId, false);
                                }}
                              />
                              Raw
                            </label>
                            <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
                              <input
                                type="radio"
                                name="blendMode"
                                className="accent-blue-600"
                                checked={blendPreview}
                                onChange={async () => {
                                  setBlendPreview(true);
                                  if (previewId) await loadPreviewTiles(previewId, true);
                                }}
                              />
                              Blended
                            </label>
                          </div>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </div>

                  {/* ORIGINAL TAB */}
                  <Tabs.Content value="original">
                    <div className="rounded-2xl border bg-gray-100 p-2 flex items-center justify-center mt-2">
                      <div className="relative overflow-hidden rounded-xl mx-auto w-full aspect-square" style={{ width: 'min(100%, 56vmin)' }}>
                        {loadingTiles ? (
                          <div className="absolute inset-0 grid place-items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0">
                            {tiles.map((row, dy) =>
                              row.map((tile, dx) => (
                                <div key={`${dx}-${dy}`} className="relative w-full h-full">
                                  <img src={tile} alt={`Tile ${x + dx - 1},${y + dy - 1}`} className="block w-full h-full object-cover" />
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Tabs.Content>

                  {/* PREVIEW TAB */}
                  <Tabs.Content value="preview">
                    <div className="rounded-2xl border bg-gray-100 p-2 flex items-center justify-center mt-2">
                      <div className="relative overflow-hidden rounded-xl group mx-auto w-full aspect-square" style={{ width: 'min(100%, 56vmin)' }}>
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0">
                          {(previewTiles || tiles).map((row, dy) =>
                            row.map((tileData, dx) => {
                              const tileX = x + dx - 1;
                              const tileY = y + dy - 1;
                              const tileExists = !newTilePositions.has(`${tileX},${tileY}`);
                              const key = `${tileX},${tileY}`;
                              const selected = selectedPositions.has(key);
                              const willApply = previewTiles ? selected : false;
                              const imgSrc = previewTiles ? (willApply ? tileData : tiles[dy][dx]) : tiles[dy][dx];

                              return (
                                <div key={`${dx}-${dy}`} className="relative w-full h-full">
                                  <img src={imgSrc} alt={`Tile ${tileX},${tileY}`} className="block w-full h-full object-cover" />
                                  {/* Hover overlay controls for selection + tags (hover-only) */}
                                  {previewTiles && (
                                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                                      <div className="flex items-start justify-between p-1">
                                        {/* Tag pill shows only on hover */}
                                        <span
                                          className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white shadow"
                                          style={{ backgroundColor: tileExists ? '#3b82f6' : '#10b981' }}
                                        >
                                          {tileExists ? 'EXISTING' : 'NEW'}
                                        </span>
                                        <label className="flex items-center gap-1 bg-white/80 rounded-md px-1.5 py-0.5 shadow text-[10px] cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            className="w-3 h-3"
                                            checked={selected}
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              setSelectedPositions(prev => {
                                                const next = new Set(prev);
                                                if (checked) next.add(key); else next.delete(key);
                                                next.add(`${x},${y}`); // center must be selected
                                                return next;
                                              });
                                            }}
                                          />
                                          {selected ? 'Apply' : 'Skip'}
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Compact summary moved to footer toolbar */}
                  </Tabs.Content>
                </Tabs.Root>
              </div>

              {/* Compact Footer Toolbar */}
              <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t px-3 py-2 rounded-b-2xl">
                <div className="flex items-center gap-3">
                  {/* Left: status pills */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-gray-100 text-gray-700 text-[11px] font-medium">
                            {selectedPositions.size}/9
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={6} className="z-[10002] bg-gray-900 text-white px-2 py-1 rounded text-xs">
                            Selected {selectedPositions.size} of 9 tiles to apply
                            <Tooltip.Arrow className="fill-gray-900" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>

                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <span className="inline-flex items-center px-2 h-7 rounded-full border text-[11px] text-gray-700">
                            {blendPreview ? 'Blended' : 'Raw'}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={6} className="z-[10002] bg-gray-900 text-white px-2 py-1 rounded text-xs">
                            Preview mode: {blendPreview ? 'Blended (existing tiles fade to edges)' : 'Raw model output'}
                            <Tooltip.Arrow className="fill-gray-900" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>

                      {typeof driftPeak === 'number' && (
                        <span className="text-[11px] text-gray-500">Peak {driftPeak.toFixed(3)}</span>
                      )}
                    </Tooltip.Provider>
                  </div>

                  {/* Middle section intentionally empty to keep toolbar single-line and compact. */}

                  {/* Right: actions */}
                  <div className="ml-auto flex items-center gap-1">
                    {/* Nudge toggle */}
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            className={`h-8 px-2 inline-flex items-center gap-1 rounded-md border hover:bg-gray-50 ${nudgeOpen ? 'bg-gray-50' : ''}`}
                            onClick={() => {
                              const next = !nudgeOpen;
                              setNudgeOpen(next);
                              if (!next) {
                                // Reset when closing to ensure no accidental application
                                setOffsetX(0); setOffsetY(0); setDriftPeak(null); setNudgeApplied(false);
                              }
                            }}
                          >
                            {/* simple icon via CSS caret */}
                            <span className={`transition-transform ${nudgeOpen ? 'rotate-90' : ''}`}>▸</span>
                            <span className="text-[11px]">Nudge</span>
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={6} className="z-[10002] bg-gray-900 text-white px-2 py-1 rounded text-xs">Optional drift correction</Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>

                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            onClick={handleClose}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border hover:bg-gray-50"
                            aria-label="Close"
                          >
                            <Close className="w-4 h-4" />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={6} className="z-[10002] bg-gray-900 text-white px-2 py-1 rounded text-xs">Cancel</Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>

                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            onClick={handleReset}
                            disabled={loading}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border hover:bg-gray-50 disabled:opacity-50"
                            aria-label="Reset"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content sideOffset={6} className="z-[10002] bg-gray-900 text-white px-2 py-1 rounded text-xs">Reset modal</Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>

                    <button
                      onClick={handleAccept}
                      disabled={loading || !previewTiles || selectedPositions.size === 0}
                      className="h-8 px-3 rounded-md text-xs bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </button>
                  </div>
                </div>
                {/* Nudge expandable row */}
                {nudgeOpen && previewTiles && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-gray-700">Drift correction</span>
                    <div className="flex items-center gap-1">
                      <label className="text-gray-700">X</label>
                      <input
                        type="number"
                        className="w-16 h-7 border rounded px-1"
                        value={offsetX}
                        onChange={async (e) => {
                          const v = parseInt(e.target.value, 10) || 0;
                          setOffsetX(v);
                          if (previewId && blendPreview) await loadPreviewTiles(previewId, true);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-gray-700">Y</label>
                      <input
                        type="number"
                        className="w-16 h-7 border rounded px-1"
                        value={offsetY}
                        onChange={async (e) => {
                          const v = parseInt(e.target.value, 10) || 0;
                          setOffsetY(v);
                          if (previewId && blendPreview) await loadPreviewTiles(previewId, true);
                        }}
                      />
                    </div>
                    <button
                      className="h-7 px-2 inline-flex items-center gap-1 rounded border hover:bg-gray-50 disabled:opacity-50"
                      disabled={!previewId || driftLoading}
                      onClick={async () => {
                        if (previewId) {
                          const suggestion = await computeDrift(previewId);
                          setNudgeApplied(true);
                          if (blendPreview) await loadPreviewTiles(previewId, true, suggestion?.tx, suggestion?.ty);
                        }
                      }}
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Suggest
                    </button>
                    {typeof driftPeak === 'number' && (
                      <span className="text-gray-500">Peak {driftPeak.toFixed(3)}</span>
                    )}
                    <span className="text-gray-500">
                      Using {Array.from(selectedPositions).filter(k => !newTilePositions.has(k)).length} existing selected tile(s)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
