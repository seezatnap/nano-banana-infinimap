"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { SelectedTile } from "../types/map";

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

interface UseMapInteractionsProps {
  map: any | null;
  onTileGenerate: (x: number, y: number, prompt: string) => Promise<void>;
  onTileRegenerate: (x: number, y: number, prompt: string) => Promise<void>;
  onTileDelete: (x: number, y: number) => Promise<void>;
}

export function useMapInteractions({ 
  map, 
  onTileGenerate, 
  onTileRegenerate, 
  onTileDelete 
}: UseMapInteractionsProps) {
  const [hoveredTile, setHoveredTile] = useState<SelectedTile | null>(null);
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null);
  const [tileExists, setTileExists] = useState<Record<string, boolean>>({});
  
  const selectedTileRef = useRef<typeof selectedTile>(null);
  const suppressOpenUntil = useRef<number>(0);

  useEffect(() => {
    selectedTileRef.current = selectedTile;
  }, [selectedTile]);

  // Check if a tile exists
  const checkTileExists = useCallback(async (x: number, y: number) => {
    try {
      const response = await fetch(`/api/meta/${MAX_Z}/${x}/${y}`);
      const data = await response.json();
      const exists = data.status === "READY";
      setTileExists(prev => ({ ...prev, [`${x},${y}`]: exists }));
      return exists;
    } catch {
      return false;
    }
  }, []);

  // Setup map event handlers
  useEffect(() => {
    if (!map) return;

    const L = window.L || require('leaflet');

    // Handle mouse move for hover
    const handleMouseMove = async (e: any) => {
      if (map.getZoom() !== map.getMaxZoom()) {
        setHoveredTile(null);
        map.getContainer().style.cursor = '';
        return;
      }
      
      const p = map.project(e.latlng, map.getZoom());
      const x = Math.floor(p.x / 256);
      const y = Math.floor(p.y / 256);
      
      if (!hoveredTile || hoveredTile.x !== x || hoveredTile.y !== y) {
        const tileCenterWorld = L.point((x + 0.5) * 256, (y + 0.5) * 256);
        const tileCenterLatLng = map.unproject(tileCenterWorld, map.getZoom());
        const tileCenterScreen = map.latLngToContainerPoint(tileCenterLatLng);
        
        setHoveredTile({ 
          x, 
          y, 
          screenX: tileCenterScreen.x,
          screenY: tileCenterScreen.y
        });

        map.getContainer().style.cursor = 'pointer';
        
        const key = `${x},${y}`;
        if (!(key in tileExists)) {
          checkTileExists(x, y);
        }
      }
    };

    // Handle mouse leave
    const handleMouseLeave = () => {
      setHoveredTile(null);
      map.getContainer().style.cursor = '';
    };

    // Handle zoom start
    const handleZoomStart = () => {
      setHoveredTile(null);
      setSelectedTile(null);
    };

    // Handle click
    const handleClick = (e: any) => {
      if (map.getZoom() !== map.getMaxZoom()) return;
      
      if (selectedTileRef.current) {
        setSelectedTile(null);
        selectedTileRef.current = null;
        suppressOpenUntil.current = performance.now() + 250;
        return;
      }
      
      if (performance.now() < suppressOpenUntil.current) return;
      
      const p = map.project(e.latlng, map.getZoom());
      const x = Math.floor(p.x / 256);
      const y = Math.floor(p.y / 256);

      const tileCenterWorld = L.point((x + 0.5) * 256, (y + 0.5) * 256);
      const tileCenterLatLng = map.unproject(tileCenterWorld, map.getZoom());
      const tileCenterScreen = map.latLngToContainerPoint(tileCenterLatLng);

      setSelectedTile({ x, y, screenX: tileCenterScreen.x, screenY: tileCenterScreen.y });

      const key = `${x},${y}`;
      if (!(key in tileExists)) {
        checkTileExists(x, y);
      }
    };

    // Update selected tile position on map movement
    const updateSelectedPosition = () => {
      const current = selectedTileRef.current;
      if (!current) return;
      const tileCenterWorld = L.point((current.x + 0.5) * 256, (current.y + 0.5) * 256);
      const tileCenterLatLng = map.unproject(tileCenterWorld, map.getZoom());
      const tileCenterScreen = map.latLngToContainerPoint(tileCenterLatLng);
      setSelectedTile(prev => prev ? ({ ...prev, screenX: tileCenterScreen.x, screenY: tileCenterScreen.y }) : prev);
    };

    // Add event listeners
    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', handleMouseLeave);
    map.on('zoomstart', handleZoomStart);
    map.on('click', handleClick);
    map.on('move', updateSelectedPosition);
    map.on('zoomend', updateSelectedPosition);

    // Cleanup
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseleave', handleMouseLeave);
      map.off('zoomstart', handleZoomStart);
      map.off('click', handleClick);
      map.off('move', updateSelectedPosition);
      map.off('zoomend', updateSelectedPosition);
    };
  }, [map, hoveredTile, tileExists, checkTileExists]);

  // Close menu when clicking outside
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!selectedTileRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-dialog-root]')) return;
      if (target && target.closest('[data-tile-menu]')) return;
      setSelectedTile(null);
      selectedTileRef.current = null;
      suppressOpenUntil.current = performance.now() + 250;
    };
    
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const handleGenerate = useCallback(async (x: number, y: number, prompt: string) => {
    await onTileGenerate(x, y, prompt);
    setTileExists(prev => ({ ...prev, [`${x},${y}`]: true }));
  }, [onTileGenerate]);

  const handleRegenerate = useCallback(async (x: number, y: number, prompt: string) => {
    await onTileRegenerate(x, y, prompt);
  }, [onTileRegenerate]);

  const handleDelete = useCallback(async (x: number, y: number) => {
    await onTileDelete(x, y);
    setTileExists(prev => ({ ...prev, [`${x},${y}`]: false }));
  }, [onTileDelete]);

  return useMemo(() => ({
    hoveredTile,
    selectedTile,
    tileExists,
    setSelectedTile,
    setTileExists,
    checkTileExists,
    handleGenerate,
    handleRegenerate,
    handleDelete
  }), [
    hoveredTile,
    selectedTile,
    tileExists,
    setSelectedTile,
    setTileExists,
    checkTileExists,
    handleGenerate,
    handleRegenerate,
    handleDelete
  ]);
}
