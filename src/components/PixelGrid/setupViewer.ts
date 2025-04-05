import OpenSeadragon from "openseadragon";
import { PixelData } from "../../types";

interface SetupViewerProps {
  container: HTMLElement;
  mainImageUrl: string;
  GRID_WIDTH: number;
  GRID_HEIGHT: number;
  ZOOM_LEVELS: number[];
  setImageLoaded: (loaded: boolean) => void;
  setImageError: (error: string | null) => void;
  handleAnimation: () => void;
  handleAnimationFinish: () => void;
  handleDragStart: (event: OpenSeadragon.MouseTrackerEvent) => void;
  handlePixelClick: (event: OpenSeadragon.MouseTrackerEvent) => void;
  updateHoverBox: (event: OpenSeadragon.MouseTrackerEvent) => void;
  hideHoverBox: () => void;
  pixels: PixelData[][];
}

export const setupViewer = ({
  container,
  mainImageUrl,
  GRID_WIDTH,
  GRID_HEIGHT,
  ZOOM_LEVELS,
  setImageLoaded,
  setImageError,
  handleAnimation,
  handleAnimationFinish,
  handleDragStart,
  handlePixelClick,
  updateHoverBox,
  hideHoverBox,
  pixels
}: SetupViewerProps): OpenSeadragon.Viewer => {
  const viewer = OpenSeadragon({
    element: container,
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

  viewer.addHandler('animation', handleAnimation);
  viewer.addHandler('animation-finish', handleAnimationFinish);
  viewer.addHandler('canvas-drag', handleDragStart);
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

  return viewer;
};

const createPixelOverlay = (imageUrl: string) => {
  const element = document.createElement('div');
  element.className = 'pixel-overlay';
  element.style.backgroundImage = `url(${imageUrl})`;
  element.setAttribute('loading', 'lazy');
  element.setAttribute('decoding', 'async');
  return element;
};