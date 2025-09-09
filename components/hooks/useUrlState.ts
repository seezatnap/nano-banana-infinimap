"use client";
import { useCallback, useRef } from "react";

export function useUrlState() {
  const updateTimeoutRef = useRef<any>(undefined);

  const updateURL = useCallback((m: any) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = window.setTimeout(() => {
      const center = m.getCenter();
      const zoom = m.getZoom();
      const params = new URLSearchParams();
      params.set("z", zoom.toString());
      params.set("lat", center.lat.toFixed(6));
      params.set("lng", center.lng.toFixed(6));

      const newURL = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", newURL);
    }, 300);
  }, []);

  return { updateURL };
}


