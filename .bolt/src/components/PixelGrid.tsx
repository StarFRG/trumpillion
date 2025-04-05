import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import OpenSeadragon from "openseadragon";
import { usePixelStore } from "../store/pixelStore";
import { GRID_WIDTH, GRID_HEIGHT, PIXEL_SIZE, PixelData } from "../types";
import { supabase } from "../lib/supabase";
import PixelModal from "./PixelModal";
import { ShareModal } from "./ShareModal";
import { debounce } from "lodash";

const PixelGrid: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const hoverBoxRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const isZoomingRef = useRef(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<PixelData | null>(null);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const { loadPixels, getPixelData, pixels } = usePixelStore();

  // Optimiere Performance-kritische Funktionen mit useMemo
  const updatePixelOpacity = useMemo(() => 
    debounce((viewer: OpenSeadragon.Viewer) => {
      if (!viewer || !viewer.isOpen()) return;

      const zoom = viewer.viewport.getZoom();
      const maxZoom = 12;
      const minOpacity = 0.4;
      const maxOpacity = 1.0;

      const currentOpacity = minOpacity + (maxOpacity - minOpacity) * (zoom / maxZoom);

      document.querySelectorAll('.pixel-overlay').forEach((element) => {
        (element as HTMLElement).style.opacity = `${currentOpacity}`;
      });
    }, 16), // 60fps
  []);

  useEffect(() => {
    const loadMainImage = async () => {
      const defaultImage = "/mosaic.jpg";
      setMainImageUrl(defaultImage);

      try {
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "main_image")
          .single();

        if (error) throw error;
        if (data?.value?.url) {
          setMainImageUrl(data.value.url);
        }
      } catch (error) {
        console.error("Error loading main image:", error);
        setImageError("Failed to load main image settings");
      }
    };

    loadMainImage();
    loadPixels();

    // Cleanup-Funktion
    return () => {
      updatePixelOpacity.cancel();
    };
  }, [loadPixels, updatePixelOpacity]);

  const getPixelCoordinates = useCallback((event: OpenSeadragon.MouseTrackerEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.isOpen()) return null;

    const viewportPoint = viewer.viewport.pointFromPixel(event.position);
    const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);

    const x = Math.floor(imagePoint.x);
    const y = Math.floor(imagePoint.y);

    if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
      return { x, y };
    }
    return null;
  }, []);

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

      lastMousePositionRef.current = event.position;

      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
      hoverTimeoutRef.current = window.setTimeout(hideHoverBox, 150);
    }, 16),
  [getPixelCoordinates, hideHoverBox, getPixelData]);

  const handlePixelClick = useCallback((event: OpenSeadragon.MouseTrackerEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.isOpen()) return;

    const coords = getPixelCoordinates(event);
    if (!coords) return;

    const zoom = viewer.viewport.getZoom();
    const maxZoom = 12;
    const viewportCoords = viewer.viewport.imageToViewportCoordinates(coords.x, coords.y);

    if (zoom < 6) {
      viewer.viewport.zoomTo(6, viewportCoords, true);
      viewer.viewport.panTo(viewportCoords, true);
      return;
    } else if (zoom < maxZoom) {
      viewer.viewport.zoomTo(maxZoom, viewportCoords, true);
      viewer.viewport.panTo(viewportCoords, true);
      return;
    }

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
  }, [getPixelCoordinates, getPixelData]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current || !mainImageUrl) return;

    const viewer = OpenSeadragon({
      element: containerRef.current,
      tileSources: {
        type: "image",
        url: mainImageUrl,
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        crossOriginPolicy: "Anonymous",
        ajaxWithCredentials: false,
        loadTilesWithAjax: true,
        success: () => {
          setImageLoaded(true);
          setImageError(null);
        },
        failure: () => {
          setImageError("Failed to load image");
        }
      },
      showNavigator: false,
      constrainDuringPan: true,
      minZoomLevel: 1.0,
      maxZoomLevel: 12.0,
      defaultZoomLevel: 1.0,
      zoomPerScroll: 1.4,
      zoomPerClick: 2.0,
      visibilityRatio: 1,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: false,
        pinchToZoom: true,
        scrollToZoom: true,
        flickEnabled: true,
      },
      showFullPageControl: false,
      fullPageButton: false,
      springStiffness: 15.0,
      animationTime: 1.2,
    });

    viewerRef.current = viewer;

    const handleAnimation = () => {
      isZoomingRef.current = true;
      hideHoverBox();
      if (viewer.isOpen()) {
        updatePixelOpacity(viewer);
      }
    };

    const handleAnimationFinish = () => {
      isZoomingRef.current = false;
    };

    viewer.addHandler('animation', handleAnimation);
    viewer.addHandler('animation-finish', handleAnimationFinish);
    viewer.addHandler('zoom', () => {
      if (viewer.isOpen()) {
        updatePixelOpacity(viewer);
      }
    });
    viewer.addHandler('canvas-click', handlePixelClick);

    const tracker = new OpenSeadragon.MouseTracker({
      element: viewer.canvas,
      moveHandler: updateHoverBox,
      leaveHandler: hideHoverBox,
    });

    tracker.setTracking(true);

    pixels.forEach(row => {
      row.forEach(pixel => {
        if (pixel.imageUrl) {
          viewer.addOverlay({
            element: createPixelOverlay(pixel.imageUrl),
            location: new OpenSeadragon.Rect(
              pixel.x / GRID_WIDTH,
              pixel.y / GRID_HEIGHT,
              1 / GRID_WIDTH,
              1 / GRID_HEIGHT
            ),
            placement: OpenSeadragon.Placement.CENTER
          });
        }
      });
    });

    if (viewer.isOpen()) {
      updatePixelOpacity(viewer);
    }

    return () => {
      tracker.destroy();
      if (viewerRef.current) {
        viewerRef.current.removeHandler('animation', handleAnimation);
        viewerRef.current.removeHandler('animation-finish', handleAnimationFinish);
        viewerRef.current.removeHandler('zoom', updatePixelOpacity);
        viewerRef.current.removeHandler('canvas-click', handlePixelClick);
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      if (hoverBoxRef.current) {
        hoverBoxRef.current.remove();
        hoverBoxRef.current = null;
      }
      if (hoverTimeoutRef.current) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [updatePixelOpacity, hideHoverBox, updateHoverBox, handlePixelClick, pixels, mainImageUrl]);

  const createPixelOverlay = useCallback((imageUrl: string) => {
    const element = document.createElement('div');
    element.className = 'pixel-overlay';
    element.style.backgroundImage = `url(${imageUrl})`;
    return element;
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Lade Bild...
          </div>
        </div>
      )}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-500 bg-red-500/10 px-4 py-2 rounded-lg">
            {imageError}
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      
      {modalOpen && (
        <PixelModal 
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          pixel={selectedPixel}
          setSelectedPixel={setSelectedPixel}
          fromButton={false}
        />
      )}

      {shareModalOpen && (
        <ShareModal 
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          pixel={selectedPixel}
        />
      )}
    </div>
  );
};

export default PixelGrid;