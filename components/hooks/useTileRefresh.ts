"use client";
import { useCallback } from "react";

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

export function useTileRefresh(map: any | null) {
  const refreshVisibleTiles = useCallback(async () => {
    if (!map) {
      console.log(`⚠️ Cannot refresh tiles: map not initialized`);
      return;
    }

    console.log(`🔄 Refreshing visible tiles...`);
    const tileLayer = (map as any)?._tileLayer;
    const ts = Date.now();

    if (tileLayer?.setUrl) {
      console.log(`📡 Updating existing tile layer URL with cache buster: ?v=${ts}`);
      tileLayer.setUrl(`/api/tiles/{z}/{x}/{y}?v=${ts}`);
      console.log(`✅ Tile layer URL updated`);
    } else if (tileLayer) {
      console.log(`🔄 Recreating tile layer (setUrl not available)`);
      const L = await import('leaflet');
      (map as any).removeLayer(tileLayer);
      const newTileLayer = L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${ts}`, {
        tileSize: 256,
        minZoom: 0,
        maxZoom: MAX_Z,
        noWrap: true,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 0
      });
      newTileLayer.addTo(map as any);
      (map as any)._tileLayer = newTileLayer;
      console.log(`✅ New tile layer added to map`);
    } else {
      console.log(`⚠️ No tile layer found to refresh`);
    }
  }, [map]);

  return { refreshVisibleTiles };
}


