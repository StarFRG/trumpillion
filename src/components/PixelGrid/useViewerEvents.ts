import { useCallback, useMemo } from 'react';
import OpenSeadragon from 'openseadragon';
import { debounce } from 'lodash';
import { PixelData } from '../../types';

interface UseViewerEventsProps {
  viewerRef: React.RefObject<OpenSeadragon.Viewer>;
  hoverBoxRef: React.RefObject<HTMLDivElement>;
  hoverTimeoutRef: React.RefObject<number | null>;
  dragStartRef: React.RefObject<{ x: number; y: number; time: number } | null>;
  lastClickTimeRef: React.RefObject<number>;
  isZoomingRef: React.RefObject<boolean>;
  currentZoomLevelRef: React.RefObject<number>;
  getPixelData: (x: number, y: number) => PixelData | null;
  setModalOpen: (open: boolean) => void;
  setShareModalOpen: (open: boolean) => void;
  setSelectedPixel: (pixel: PixelData | null) => void;
  ZOOM_LEVELS: number[];
  MAX_ZOOM: number;
  MIN_OPACITY: number;
  MAX_OPACITY: number;
  HOVER_TIMEOUT: number;
  DRAG_THRESHOLD: number;
  CLICK_TIMEOUT: number;
}

export const useViewerEvents = ({
  viewerRef,
  hoverBoxRef,
  hoverTimeoutRef,
  dragStartRef,
  lastClickTimeRef,
  isZoomingRef,
  currentZoomLevelRef,
  getPixelData,
  setModalOpen,
  setShareModalOpen,
  setSelectedPixel,
  ZOOM_LEVELS,
  MAX_ZOOM,
  MIN_OPACITY,
  MAX_OPACITY,
  HOVER_TIMEOUT,
  DRAG_THRESHOLD,
  CLICK_TIMEOUT
}: UseViewerEventsProps) => {
  const updatePixelOpacity = useMemo(() => 
    debounce((viewer: OpenSeadragon.Viewer) => {
      if (!viewer || !viewer.isOpen()) return;

      const zoom = viewer.viewport.getZoom();
      const currentOpacity = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * (zoom / MAX_ZOOM);

      document.querySelectorAll('.pixel-overlay').forEach((element) => {
        (element as HTMLElement).style.opacity = `${currentOpacity}`;
      });
    }, 16),
  [MAX_ZOOM, MIN_OPACITY, MAX_OPACITY]);

  const hideHoverBox = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (hoverBoxRef.current) {
      hoverBoxRef.current.style.opacity = '0';
      hoverBoxRef.current.style.display = 'none';
    }
  }, []);

  const getPixelCoordinates = useCallback((event: OpenSeadragon.MouseTrackerEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.isOpen()) return null;

    const viewportPoint = viewer.viewport.pointFromPixel(event.position);
    const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

    const x = Math.floor(imagePoint.x);
    const y = Math.floor(imagePoint.y);

    if (x >= 0 && x < 1000 && y >= 0 && y < 1000) {
      return { x, y };
    }
    return null;
  }, []);

  const updateHoverBox = useMemo(() => 
    debounce((event: OpenSeadragon.MouseTrackerEvent) => {
      const viewer = viewerRef.current;
      if (!viewer || !viewer.isOpen() || isZoomingRef.current) return;

      const coords = getPixelCoordinates(event);
      if (!coords) {
        hideHoverBox();
        return;
      }

      if (!hoverBoxRef.current) {
        const box = document.createElement("div");
        box.className = "hover-box";
        viewer.canvas.parentElement?.appendChild(box);
        hoverBoxRef.current = box;
      }

      const box = hoverBoxRef.current;
      const zoom = viewer.viewport.getZoom();
      const pixelSize = Math.max(1, Math.round(zoom * 20));
      const viewportCoords = viewer.viewport.imageToViewportCoordinates(coords.x, coords.y);
      const screenCoords = viewer.viewport.viewportToViewerElementCoordinates(viewportCoords);

      const pixelData = getPixelData(coords.x, coords.y);

      requestAnimationFrame(() => {
        box.style.width = `${pixelSize}px`;
        box.style.height = `${pixelSize}px`;
        box.style.transform = `translate3d(${Math.round(screenCoords.x)}px, ${Math.round(screenCoords.y)}px, 0)`;
        box.style.display = 'block';
        box.style.opacity = pixelData?.imageUrl ? '1' : '0.5';
        
        if (pixelData?.imageUrl) {
          box.classList.add('has-content');
        } else {
          box.classList.remove('has-content');
        }
      });

      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
      hoverTimeoutRef.current = window.setTimeout(hideHoverBox, HOVER_TIMEOUT);
    }, 16),
  [getPixelCoordinates, hideHoverBox, getPixelData, HOVER_TIMEOUT]);

  const handlePixelClick = useCallback((event: OpenSeadragon.MouseTrackerEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.isOpen()) return null;

    const coords = getPixelCoordinates(event);
    if (!coords) return null;

    if (dragStartRef.current) {
      const dx = event.position.x - dragStartRef.current.x;
      const dy = event.position.y - dragStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeDiff = Date.now() - dragStartRef.current.time;

      if (distance > DRAG_THRESHOLD || timeDiff > CLICK_TIMEOUT) {
        dragStartRef.current = null;
        return null;
      }
    }

    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTimeRef.current;
    const isDoubleClick = timeSinceLastClick < 300;
    lastClickTimeRef.current = currentTime;

    if (isDoubleClick) {
      const zoom = viewer.viewport.getZoom();
      const viewportCoords = viewer.viewport.imageToViewportCoordinates(coords.x, coords.y);

      if (currentZoomLevelRef.current < ZOOM_LEVELS.length - 1) {
        currentZoomLevelRef.current++;
        viewer.viewport.zoomTo(ZOOM_LEVELS[currentZoomLevelRef.current], viewportCoords, true);
        viewer.viewport.panTo(viewportCoords, true);
      } else {
        currentZoomLevelRef.current = 0;
        viewer.viewport.goHome();
      }
      return null;
    } else if (viewer.viewport.getZoom() >= MAX_ZOOM) {
      const pixelData = getPixelData(coords.x, coords.y);
      const pixel = {
        x: coords.x,
        y: coords.y,
        imageUrl: pixelData?.imageUrl || null,
        ownerName: pixelData?.ownerName,
        country: pixelData?.country
      };

      if (pixelData?.imageUrl) {
        setShareModalOpen(true);
        setSelectedPixel(pixel);
      } else {
        setModalOpen(true);
        setSelectedPixel(pixel);
      }
      return pixel;
    }
    return null;
  }, [getPixelCoordinates, getPixelData, DRAG_THRESHOLD, CLICK_TIMEOUT, ZOOM_LEVELS, MAX_ZOOM]);

  return {
    updatePixelOpacity,
    hideHoverBox,
    updateHoverBox,
    handlePixelClick
  };
};