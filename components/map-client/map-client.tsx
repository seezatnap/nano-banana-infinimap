"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useSearchParams as useSearchParamsHook } from "next/navigation";
import { useUrlState } from "../hooks/useUrlState";
import { useTileRefresh } from "../hooks/useTileRefresh";
import { useMapInteractions } from "../hooks/useMapInteractions";
import { useMapPolling } from "../hooks/useMapPolling";
import { TileHighlight } from "../map/tile-highlight";
import { MapControls } from "../map/map-controls";
import { CanvasMenu } from "../map/canvas-menu";
import { TileMenu } from "../map/tile-menu";

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

export default function MapClient() {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const searchParams = useSearchParamsHook();
  
  const { updateURL } = useUrlState();
  const { refreshVisibleTiles } = useTileRefresh(map);
  const { pollTileStatus } = useMapPolling(map);

  // Handle tile generation with polling
  const handleGenerate = async (x: number, y: number, prompt: string) => {
    try {
      const response = await fetch(`/api/claim/${MAX_Z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      
      if (response.ok) {
        await pollTileStatus(x, y);
      }
    } catch (error) {
      console.error("Failed to generate tile:", error);
      throw error;
    }
  };

  // Handle tile regeneration with polling
  const handleRegenerate = async (x: number, y: number, prompt: string) => {
    try {
      const response = await fetch(`/api/invalidate/${MAX_Z}/${x}/${y}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      
      if (response.ok) {
        await pollTileStatus(x, y);
      }
    } catch (error) {
      console.error("Failed to regenerate tile:", error);
      throw error;
    }
  };

  // Handle tile deletion
  const handleDelete = async (x: number, y: number) => {
    try {
      const response = await fetch(`/api/delete/${MAX_Z}/${x}/${y}`, {
        method: "DELETE"
      });

      if (response.ok) {
        await refreshVisibleTiles();
      }
    } catch (error) {
      console.error("Failed to delete tile:", error);
      throw error;
    }
  };

  const {
    hoveredTile,
    selectedTile,
    tileExists,
    setTileExists,
    handleGenerate: handleGenerateWithState,
    handleRegenerate: handleRegenerateWithState,
    handleDelete: handleDeleteWithState
  } = useMapInteractions({
    map,
    onTileGenerate: handleGenerate,
    onTileRegenerate: handleRegenerate,
    onTileDelete: handleDelete
  });

  // Initialize map
  useEffect(() => {
    if (!ref.current || map) return;
    
    import('leaflet').then((L) => {
      const initialZoom = searchParams?.get('z') ? parseInt(searchParams.get('z')!) : MAX_Z;
      const initialLat = searchParams?.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
      const initialLng = searchParams?.get('lng') ? parseFloat(searchParams.get('lng')!) : null;
      
      const m = L.map(ref.current!, { 
        crs: L.CRS.Simple, 
        minZoom: 0, 
        maxZoom: MAX_Z,
        zoom: initialZoom
      });
      
      const world = (1 << MAX_Z) * 256;
      const sw = m.unproject([0, world] as any, MAX_Z);
      const ne = m.unproject([world, 0] as any, MAX_Z);
      const bounds = new L.LatLngBounds(sw, ne);
      m.setMaxBounds(bounds);
      
      // Set initial view
      if (initialLat !== null && initialLng !== null) {
        m.setView([initialLat, initialLng], initialZoom);
      } else {
        // Start at max zoom in the center of the world
        const centerLat = (sw.lat + ne.lat) / 2;
        const centerLng = (sw.lng + ne.lng) / 2;
        m.setView([centerLat, centerLng], initialZoom);
      }

      // Add tile layer with cache buster
      const tileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`, { 
        tileSize: 256, 
        minZoom: 0, 
        maxZoom: MAX_Z, 
        noWrap: true,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 0
      });
      tileLayer.addTo(m);
      
      // Store reference for refresh
      (m as any)._tileLayer = tileLayer;

      // Update URL when map moves
      m.on('moveend', () => updateURL(m));
      m.on('zoomend', () => updateURL(m));

      setMap(m);
      
      // Set initial URL if not already set
      if (!searchParams.get('z')) {
        updateURL(m);
      }
    });
  }, [map, searchParams, updateURL]);

  const isMaxZoom = map?.getZoom() === MAX_Z;
  const position = {
    z: searchParams.get('z'),
    lat: searchParams.get('lat'),
    lng: searchParams.get('lng')
  };

  const handleCanvasReset = async () => {
    // Clear the tile existence state
    setTileExists({});
    
    // Refresh the visible tiles to show default tiles
    await refreshVisibleTiles();
    
    // Navigate to center at max zoom (consistent with startup)
    if (map) {
      const L = await import('leaflet');
      const world = (1 << MAX_Z) * 256;
      const sw = map.unproject([0, world] as any, MAX_Z);
      const ne = map.unproject([world, 0] as any, MAX_Z);
      const centerLat = (sw.lat + ne.lat) / 2;
      const centerLng = (sw.lng + ne.lng) / 2;
      map.setView([centerLat, centerLng], MAX_Z);
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Map Controls */}
      <MapControls isMaxZoom={isMaxZoom} position={position} />
      
      {/* Canvas Menu */}
      <CanvasMenu onCanvasReset={handleCanvasReset} />
      
      {/* Tile Highlighting */}
      <TileHighlight 
        hoveredTile={hoveredTile}
        selectedTile={selectedTile}
        isMaxZoom={isMaxZoom}
      />

      {/* Tile Menu */}
      {selectedTile && isMaxZoom && (
        <TileMenu
          tile={selectedTile}
          exists={tileExists[`${selectedTile.x},${selectedTile.y}`] || false}
          onGenerate={(prompt) => handleGenerateWithState(selectedTile.x, selectedTile.y, prompt)}
          onRegenerate={(prompt) => handleRegenerateWithState(selectedTile.x, selectedTile.y, prompt)}
          onDelete={() => handleDeleteWithState(selectedTile.x, selectedTile.y)}
          onRefreshTiles={() => {
            setTimeout(() => {
              refreshVisibleTiles();
              setTileExists(prev => ({ ...prev, [`${selectedTile.x},${selectedTile.y}`]: true }));
            }, 50);
          }}
        />
      )}
      
      {/* Map Container */}
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}


