import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { GRID_WIDTH, GRID_HEIGHT, PIXEL_SIZE } from '../types';
import { usePixelStore } from '../store/pixelStore';
import { debounce } from 'lodash';
import { monitoring } from '../services/monitoring';

export const useVirtualGrid = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { pixels, loadPixels } = usePixelStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = debounce(() => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    }, 100);

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      updateDimensions.cancel();
    };
  }, []);

  // Virtual rows
  const rowVirtualizer = useVirtualizer({
    count: GRID_HEIGHT,
    getScrollElement: () => containerRef.current,
    estimateSize: () => PIXEL_SIZE,
    overscan: 5,
    paddingStart: 0,
    paddingEnd: 0,
    scrollPaddingStart: 0,
    scrollPaddingEnd: 0,
  });

  // Virtual columns for each row
  const columnVirtualizer = useVirtualizer({
    count: GRID_WIDTH,
    getScrollElement: () => containerRef.current,
    estimateSize: () => PIXEL_SIZE,
    horizontal: true,
    overscan: 5,
    paddingStart: 0,
    paddingEnd: 0,
    scrollPaddingStart: 0,
    scrollPaddingEnd: 0,
  });

  // Debounced load pixels function
  const debouncedLoadPixels = useMemo(() => 
    debounce(async () => {
      try {
        setError(null);
        setIsLoading(true);

        const visibleRows = rowVirtualizer.getVirtualItems();
        const visibleCols = columnVirtualizer.getVirtualItems();
        
        if (!visibleRows.length || !visibleCols.length) return;

        const startRow = Math.max(0, visibleRows[0].index - 5);
        const endRow = Math.min(GRID_HEIGHT - 1, visibleRows[visibleRows.length - 1].index + 5);
        const startCol = Math.max(0, visibleCols[0].index - 5);
        const endCol = Math.min(GRID_WIDTH - 1, visibleCols[visibleCols.length - 1].index + 5);

        await loadPixels(startRow, startCol, endRow, endCol);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load pixels';
        setError(errorMessage);
        monitoring.logError({
          error: error instanceof Error ? error : new Error(errorMessage),
          context: { action: 'load_visible_pixels' }
        });
      } finally {
        setIsLoading(false);
      }
    }, 100),
    [rowVirtualizer, columnVirtualizer, loadPixels]
  );

  // Scroll to specific coordinates
  const scrollToCoordinates = useMemo(() => (x: number, y: number) => {
    if (!containerRef.current) return;

    const rowIndex = Math.floor(y);
    const colIndex = Math.floor(x);

    rowVirtualizer.scrollToIndex(rowIndex, { align: 'center' });
    columnVirtualizer.scrollToIndex(colIndex, { align: 'center' });
  }, [rowVirtualizer, columnVirtualizer]);

  // Get visible range
  const getVisibleRange = useMemo(() => () => {
    const visibleRows = rowVirtualizer.getVirtualItems();
    const visibleCols = columnVirtualizer.getVirtualItems();

    if (!visibleRows.length || !visibleCols.length) {
      return {
        startRow: 0,
        endRow: 0,
        startCol: 0,
        endCol: 0,
      };
    }

    return {
      startRow: visibleRows[0]?.index ?? 0,
      endRow: visibleRows[visibleRows.length - 1]?.index ?? 0,
      startCol: visibleCols[0]?.index ?? 0,
      endCol: visibleCols[visibleCols.length - 1]?.index ?? 0,
    };
  }, [rowVirtualizer, columnVirtualizer]);

  // Load pixels when scroll position changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', debouncedLoadPixels);
    debouncedLoadPixels();

    return () => {
      container.removeEventListener('scroll', debouncedLoadPixels);
      debouncedLoadPixels.cancel();
    };
  }, [debouncedLoadPixels]);

  // Cleanup
  useEffect(() => {
    return () => {
      rowVirtualizer.cleanup();
      columnVirtualizer.cleanup();
    };
  }, [rowVirtualizer, columnVirtualizer]);

  return {
    containerRef,
    dimensions,
    rowVirtualizer,
    columnVirtualizer,
    isLoading,
    error,
    scrollToCoordinates,
    getVisibleRange,
    virtualRows: rowVirtualizer.getVirtualItems(),
    virtualColumns: columnVirtualizer.getVirtualItems(),
    totalSize: {
      width: columnVirtualizer.getTotalSize(),
      height: rowVirtualizer.getTotalSize(),
    },
  };
};