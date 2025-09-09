"use client";

import { useCallback } from "react";

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

export function useMapPolling(map: any | null) {
  // Poll for tile generation completion
  const pollTileStatus = useCallback(async (x: number, y: number) => {
    if (!map) return;

    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 30 seconds
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/meta/${MAX_Z}/${x}/${y}`);
        const data = await response.json();
        
        if (data.status === "READY") {
          // Import Leaflet dynamically
          const L = await import('leaflet');
          
          // Get the tile layer
          const tileLayer = (map as any)._tileLayer;
          if (tileLayer) {
            // Try to update specific tile or force full redraw
            let tileFound = false;
            const keys = [
              `${x}:${y}:${MAX_Z}`,
              `${MAX_Z}:${x}:${y}`,
              `${x}_${y}_${MAX_Z}`,
              `${MAX_Z}_${x}_${y}`
            ];
            
            for (const key of keys) {
              if (tileLayer._tiles && tileLayer._tiles[key]) {
                const tileEl = tileLayer._tiles[key].el;
                if (tileEl && tileEl.src) {
                  tileEl.src = `/api/tiles/${MAX_Z}/${x}/${y}?t=${Date.now()}`;
                  tileFound = true;
                  break;
                }
              }
            }
            
            if (!tileFound) {
              // Force full layer refresh
              map.removeLayer(tileLayer);
              const newTileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${Date.now()}`, { 
                tileSize: 256, 
                minZoom: 0, 
                maxZoom: MAX_Z, 
                noWrap: true,
                updateWhenIdle: false,
                updateWhenZooming: false,
                keepBuffer: 0
              });
              newTileLayer.addTo(map);
              (map as any)._tileLayer = newTileLayer;
            }
          }
        } else if (data.status === "PENDING" && attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 1000); // Check again in 1 second
        }
      } catch (error) {
        console.error("Error checking tile status:", error);
      }
    };
    
    setTimeout(checkStatus, 1000); // Start checking after 1 second
  }, [map]);

  return { pollTileStatus };
}
