import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import OpenSeadragon from "openseadragon";
import { usePixelStore } from "../../store/pixelStore";
import { GRID_WIDTH, GRID_HEIGHT, PIXEL_SIZE, PixelData } from "../../types";
import { getSupabase } from "../../lib/supabase";
import PixelModal from "../PixelModal";
import { ShareModal } from "../ShareModal";
import { debounce } from "lodash";
import { ZoomIn, ZoomOut, Home } from "lucide-react";

const HOVER_TIMEOUT = 500;
const IMAGE_LOAD_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const DRAG_THRESHOLD = 10; // pixels
const CLICK_TIMEOUT = 250; // milliseconds
const MAX_ZOOM = 12;
const ZOOM_LEVELS = [1, 3, 6, MAX_ZOOM];
const MIN_OPACITY = 0.5;
const MAX_OPACITY = 1.0;

const PixelGrid: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const hoverBoxRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const isZoomingRef = useRef(false);
  const currentZoomLevelRef = useRef<number>(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<PixelData | null>(null);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const { loadPixels, getPixelData, pixels } = usePixelStore();

  const loadImageWithTimeout = (url: string, timeout: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      const timeoutId = setTimeout(() => {
        img.src = "";
        reject(new Error("Image load timeout"));
      }, timeout);

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  };

  const retryLoadImage = async (url: string, retries = MAX_RETRIES): Promise<void> => {
    try {
      await loadImageWithTimeout(url, IMAGE_LOAD_TIMEOUT);
      setMainImageUrl(url);
      setImageError(null);
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return retryLoadImage(url, retries - 1);
      }
      throw error;
    }
  };

  useEffect(() => {
    const loadMainImage = async () => {
      const defaultImage = "/mosaic.jpg";
      
      try {
        const supabase = await getSupabase();
        const { data, error } = await supabase
          .from("settings")
          .select("value")
          .eq("key", "main_image")
          .single();

        if (error) throw error;

        const imageUrl = data?.value?.url || defaultImage;
        
        // Only load if URL actually changes
        if (imageUrl !== mainImageUrl) {
          await retryLoadImage(imageUrl);
        }
      } catch (error) {
        if (mainImageUrl !== defaultImage) {
          await retryLoadImage(defaultImage);
        }
      }
    };

    loadMainImage();
    loadPixels().catch(error => {
      console.error("Error loading pixels:", error);
      setImageError("Failed to load pixels");
    });

    return () => {
      updatePixelOpacity.cancel();
    };
  }, [loadPixels, mainImageUrl]);

  const updatePixelOpacity = useMemo(() => 
    debounce((viewer: OpenSeadragon.Viewer) => {
      if (!viewer || !viewer.isOpen()) return;

      const zoom = viewer.viewport.getZoom();
      
      // Calculate opacity based on zoom level, starting from MIN_OPACITY (0.5)
      const currentOpacity = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * (zoom / MAX_ZOOM);

      document.querySelectorAll('.pixel-overlay').forEach((element) => {
        (element as HTMLElement).style.opacity = `${currentOpacity}`;
      });
    }, 16),
  []);

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
      hoverTimeoutRef.current = window.setTimeout(hideHoverBox, HOVER_TIMEOUT);
    }, 16),
  [getPixelCoordinates, hideHoverBox, getPixelData]);

  const handlePixelClick = useCallback((event: OpenSeadragon.MouseTrackerEvent) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.isOpen()) return;

    const coords = getPixelCoordinates(event);
    if (!coords) return;

    // Check if this was a drag rather than a click
    if (dragStartRef.current) {
      const dx = event.position.x - dragStartRef.current.x;
      const dy = event.position.y - dragStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeDiff = Date.now() - dragStartRef.current.time;

      if (distance > DRAG_THRESHOLD || timeDiff > CLICK_TIMEOUT) {
        dragStartRef.current = null;
        return;
      }
    }

    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTimeRef.current;
    const isDoubleClick = timeSinceLastClick < 300; // 300ms for double click detection
    lastClickTimeRef.current = currentTime;

    if (isDoubleClick) {
      // Handle double click zoom
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
    } else if (viewer.viewport.getZoom() >= MAX_ZOOM) {
      // Only open modal at maximum zoom
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
    }
  }, [getPixelCoordinates, getPixelData]);

  const handleZoomIn = useCallback(() => {
    if (viewerRef.current) {
      const nextZoomLevel = Math.min(currentZoomLevelRef.current + 1, ZOOM_LEVELS.length - 1);
      currentZoomLevelRef.current = nextZoomLevel;
      viewerRef.current.viewport.zoomTo(ZOOM_LEVELS[nextZoomLevel]);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (viewerRef.current) {
      const nextZoomLevel = Math.max(currentZoomLevelRef.current - 1, 0);
      currentZoomLevelRef.current = nextZoomLevel;
      viewerRef.current.viewport.zoomTo(ZOOM_LEVELS[nextZoomLevel]);
    }
  }, []);

  const handleHome = useCallback(() => {
    if (viewerRef.current) {
      currentZoomLevelRef.current = 0;
      viewerRef.current.viewport.goHome();
    }
  }, []);

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
      minZoomLevel: ZOOM_LEVELS[0],
      maxZoomLevel: ZOOM_LEVELS[ZOOM_LEVELS.length - 1],
      defaultZoomLevel: ZOOM_LEVELS[0],
      zoomPerScroll: 1.4,
      zoomPerClick: 1.5,
      visibilityRatio: 0.8,
      springStiffness: 15.0,
      animationTime: 1.2,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true,
        pinchToZoom: true,
        scrollToZoom: true,
        flickEnabled: true,
      },
      gestureSettingsTouch: {
        pinchToZoom: true,
        flickEnabled: true,
        dragToPan: true,
        pinchRotate: false,
        clickToZoom: false,
        dblClickToZoom: true
      },
      showNavigationControl: false,
      zoomInButton: false,
      zoomOutButton: false,
      homeButton: false,
      showZoomControl: false,
      showHomeControl: false,
      navigatorPosition: 'NONE',
      navImages: {
        zoomIn: { REST: '', GROUP: '', HOVER: '', DOWN: '' },
        zoomOut: { REST: '', GROUP: '', HOVER: '', DOWN: '' },
        home: { REST: '', GROUP: '', HOVER: '', DOWN: '' },
        next: { REST: '', GROUP: '', HOVER: '', DOWN: '' },
        previous: { REST: '', GROUP: '', HOVER: '', DOWN: '' }
      }
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

    const handleDragStart = (event: OpenSeadragon.MouseTrackerEvent) => {
      dragStartRef.current = {
        x: event.position.x,
        y: event.position.y,
        time: Date.now()
      };
    };

    viewer.addHandler('animation', handleAnimation);
    viewer.addHandler('animation-finish', handleAnimationFinish);
    viewer.addHandler('zoom', () => {
      if (viewer.isOpen()) {
        updatePixelOpacity(viewer);
      }
    });
    viewer.addHandler('canvas-drag', handleDragStart);
    viewer.addHandler('canvas-click', handlePixelClick);

    const tracker = new OpenSeadragon.MouseTracker({
      element: viewer.canvas,
      moveHandler: updateHoverBox,
      leaveHandler: hideHoverBox,
    });

    tracker.setTracking(true);

    if (pixels && pixels.length > 0) {
      pixels.forEach(row => {
        if (row) {
          row.forEach(pixel => {
            if (pixel && pixel.imageUrl) {
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
        }
      });
    }

    if (viewer.isOpen()) {
      updatePixelOpacity(viewer);
    }

    return () => {
      tracker.destroy();
      if (viewerRef.current) {
        viewerRef.current.removeHandler('animation', handleAnimation);
        viewerRef.current.removeHandler('animation-finish', handleAnimationFinish);
        viewerRef.current.removeHandler('zoom', updatePixelOpacity);
        viewerRef.current.removeHandler('canvas-drag', handleDragStart);
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
    element.setAttribute('loading', 'lazy');
    element.setAttribute('decoding', 'async');
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
            Loading image...
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
      
      <div className="absolute bottom-8 right-8 flex gap-3">
        <button
          onClick={handleZoomIn}
          className="p-3 bg-gray-900/80 hover:bg-gray-800 rounded-lg backdrop-blur-sm text-gray-300 hover:text-white transition-colors shadow-lg"
          title="Zoom In"
        >
          <ZoomIn size={24} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-3 bg-gray-900/80 hover:bg-gray-800 rounded-lg backdrop-blur-sm text-gray-300 hover:text-white transition-colors shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut size={24} />
        </button>
        <button
          onClick={handleHome}
          className="p-3 bg-gray-900/80 hover:bg-gray-800 rounded-lg backdrop-blur-sm text-gray-300 hover:text-white transition-colors shadow-lg"
          title="Reset View"
        >
          <Home size={24} />
        </button>
      </div>
      
      {modalOpen && selectedPixel && (
      <PixelModal 
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  pixel={selectedPixel ? { x: selectedPixel.x, y: selectedPixel.y } : null}
  setSelectedPixel={(pixel) => setSelectedPixel(pixel ? { ...pixel, imageUrl: null } : null)}
  fromButton={false}
/>
      )}

      {shareModalOpen && selectedPixel && (
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