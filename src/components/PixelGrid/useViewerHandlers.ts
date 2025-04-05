import { useCallback } from 'react';
import OpenSeadragon from 'openseadragon';

export const useViewerHandlers = (
  viewerRef: React.RefObject<OpenSeadragon.Viewer>,
  currentZoomLevelRef: React.RefObject<number>,
  ZOOM_LEVELS: number[]
) => {
  const handleZoomIn = useCallback(() => {
    if (viewerRef.current) {
      const nextZoomLevel = Math.min(currentZoomLevelRef.current + 1, ZOOM_LEVELS.length - 1);
      currentZoomLevelRef.current = nextZoomLevel;
      viewerRef.current.viewport.zoomTo(ZOOM_LEVELS[nextZoomLevel]);
    }
  }, [ZOOM_LEVELS]);

  const handleZoomOut = useCallback(() => {
    if (viewerRef.current) {
      const nextZoomLevel = Math.max(currentZoomLevelRef.current - 1, 0);
      currentZoomLevelRef.current = nextZoomLevel;
      viewerRef.current.viewport.zoomTo(ZOOM_LEVELS[nextZoomLevel]);
    }
  }, [ZOOM_LEVELS]);

  const handleHome = useCallback(() => {
    if (viewerRef.current) {
      currentZoomLevelRef.current = 0;
      viewerRef.current.viewport.goHome();
    }
  }, []);

  return {
    handleZoomIn,
    handleZoomOut,
    handleHome
  };
};