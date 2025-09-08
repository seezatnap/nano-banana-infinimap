"use client";

import { useState, useCallback } from "react";

interface UseTileGenerationProps {
  x: number;
  y: number;
  z: number;
  onUpdate: () => void;
}

interface TileGenerationState {
  loading: boolean;
  error: string | null;
  previewId: string | null;
  previewTiles: string[][] | null;
}

export function useTileGeneration({ x, y, z, onUpdate }: UseTileGenerationProps) {
  const [state, setState] = useState<TileGenerationState>({
    loading: false,
    error: null,
    previewId: null,
    previewTiles: null
  });

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      previewId: null,
      previewTiles: null
    });
  }, []);

  // Extract 9 tiles from a composite image
  const extractTilesFromComposite = useCallback(async (compositeUrl: string): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const extractedTiles: string[][] = [];
        const TILE_SIZE = 256;
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
              const sx = dx * TILE_SIZE * scaleX;
              const sy = dy * TILE_SIZE * scaleY;
              const sw = TILE_SIZE * scaleX;
              const sh = TILE_SIZE * scaleY;
              
              ctx.drawImage(
                img,
                sx, sy, sw, sh,
                0, 0, TILE_SIZE, TILE_SIZE
              );
              row.push(canvas.toDataURL('image/webp'));
            }
          }
          extractedTiles.push(row);
        }
        resolve(extractedTiles);
      };
      img.onerror = reject;
      img.src = compositeUrl;
    });
  }, []);

  const generatePreview = useCallback(async (prompt: string, blendMode: boolean = true) => {
    if (!prompt.trim()) return;
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/edit-tile/${z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate preview");
      }
      
      const data = await response.json();
      const previewUrl = `/api/preview/${data.previewId}${blendMode ? '?mode=blended' : ''}`;
      const extractedTiles = await extractTilesFromComposite(previewUrl);
      
      setState(prev => ({
        ...prev,
        loading: false,
        previewId: data.previewId,
        previewTiles: extractedTiles
      }));
      
      return data.previewId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      throw err;
    }
  }, [x, y, z, extractTilesFromComposite]);

  const updatePreviewMode = useCallback(async (blendMode: boolean) => {
    if (!state.previewId) return;
    
    try {
      const previewUrl = `/api/preview/${state.previewId}${blendMode ? '?mode=blended' : ''}`;
      const extractedTiles = await extractTilesFromComposite(previewUrl);
      setState(prev => ({ ...prev, previewTiles: extractedTiles }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update preview mode";
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [state.previewId, extractTilesFromComposite]);

  const confirmGeneration = useCallback(async (selectedPositions: Set<string>) => {
    if (!state.previewId) return;
    
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const response = await fetch(`/api/confirm-edit/${z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          previewUrl: `/api/preview/${state.previewId}`,
          selectedPositions: Array.from(selectedPositions).map(s => { 
            const [sx, sy] = s.split(',').map(Number); 
            return { x: sx, y: sy }; 
          }),
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to confirm generation");
      }
      
      onUpdate();
      reset();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to confirm generation";
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
      throw err;
    }
  }, [state.previewId, x, y, z, onUpdate, reset]);

  return {
    ...state,
    generatePreview,
    updatePreviewMode,
    confirmGeneration,
    clearError,
    reset
  };
}
