import React, { useCallback, useEffect, useState } from 'react';
import { useVirtualGrid } from '../hooks/useVirtualGrid';
import { usePixelStore } from '../store/pixelStore';
import { PixelData } from '../types';
import { useInView } from 'react-intersection-observer';
import { monitoring } from '../services/monitoring';

interface VirtualPixelGridProps {
  onPixelClick: (pixel: PixelData) => void;
}

export const VirtualPixelGrid: React.FC<VirtualPixelGridProps> = ({ onPixelClick }) => {
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    triggerOnce: false
  });

  const {
    containerRef,
    virtualRows,
    virtualColumns,
    totalSize,
    isLoading,
    error,
    scrollToCoordinates
  } = useVirtualGrid();

  const { pixels, getPixelData } = usePixelStore();
  const [selectedCoords, setSelectedCoords] = useState<{ x: number; y: number } | null>(null);

  const handlePixelClick = useCallback((x: number, y: number) => {
    try {
      const pixelData = getPixelData(x, y);
      if (pixelData) {
        setSelectedCoords({ x, y });
        onPixelClick(pixelData);
      }
    } catch (error) {
      console.error('Error handling pixel click:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to handle pixel click'),
        context: { action: 'handle_pixel_click', x, y }
      });
    }
  }, [getPixelData, onPixelClick]);

  useEffect(() => {
    if (selectedCoords && inView) {
      if (!containerRef.current) {
        console.warn("Container ref not available for scrolling");
        return;
      }

      if (typeof selectedCoords.x !== 'number' || typeof selectedCoords.y !== 'number' || 
          isNaN(selectedCoords.x) || isNaN(selectedCoords.y)) {
        console.warn("Invalid coordinates for scrolling:", selectedCoords);
        return;
      }

      scrollToCoordinates(selectedCoords.x, selectedCoords.y);
    }
  }, [selectedCoords, inView, scrollToCoordinates]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div 
      ref={(el) => {
        // Combine refs
        if (el) {
          containerRef.current = el;
          inViewRef(el);
        }
      }}
      className="relative w-full h-full overflow-auto bg-gray-900"
      style={{
        width: '100%',
        height: '100%'
      }}
    >
      <div
        className="relative"
        style={{
          height: `${totalSize.height}px`,
          width: `${totalSize.width}px`
        }}
      >
        {virtualRows.map(virtualRow => (
          virtualColumns.map(virtualCol => {
            const pixel = pixels[virtualRow.index]?.[virtualCol.index];
            if (!pixel) return null;

            return (
              <div
                key={`${virtualRow.index}-${virtualCol.index}`}
                className={`absolute cursor-pointer transition-opacity duration-200
                  ${pixel.imageUrl ? 'bg-red-500/10 hover:bg-red-500/20' : 'hover:bg-white/5'}
                  ${selectedCoords?.x === virtualCol.index && selectedCoords?.y === virtualRow.index
                    ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900'
                    : ''
                  }`}
                style={{
                  top: `${virtualRow.start}px`,
                  left: `${virtualCol.start}px`,
                  width: `${virtualCol.size}px`,
                  height: `${virtualRow.size}px`,
                }}
                onClick={() => handlePixelClick(virtualCol.index, virtualRow.index)}
              >
                {pixel.imageUrl && (
                  <img
                    src={pixel.imageUrl}
                    alt={`Pixel ${virtualCol.index},${virtualRow.index}`}
                    className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                    loading="lazy"
                  />
                )}
              </div>
            );
          })
        ))}
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        </div>
      )}
    </div>
  );
};

export default VirtualPixelGrid;