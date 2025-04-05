import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PixelData } from '../types';
import { monitoring } from '../services/monitoring';

interface PixelDBSchema extends DBSchema {
  pixels: {
    key: string;
    value: PixelData;
    indexes: { 'by-coordinates': [number, number] };
  };
  metadata: {
    key: string;
    value: any;
  };
}

class PixelCache {
  private db: IDBPDatabase<PixelDBSchema> | null = null;
  private readonly DB_NAME = 'pixel-cache';
  private readonly DB_VERSION = 1;

  async init() {
    try {
      this.db = await openDB<PixelDBSchema>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          const pixelStore = db.createObjectStore('pixels', {
            keyPath: 'id'
          });
          pixelStore.createIndex('by-coordinates', ['x', 'y'], { unique: true });
          db.createObjectStore('metadata');
        }
      });
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to initialize cache'),
        context: { action: 'cache_init' }
      });
    }
  }

  async getPixel(x: number, y: number): Promise<PixelData | null> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('pixels', 'readonly');
      const index = tx.store.index('by-coordinates');
      return await index.get([x, y]);
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to get pixel from cache'),
        context: { action: 'get_pixel', x, y }
      });
      return null;
    }
  }

  async setPixel(pixel: PixelData): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('pixels', 'readwrite');
      await tx.store.put({
        id: `${pixel.x}-${pixel.y}`,
        ...pixel
      });
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to set pixel in cache'),
        context: { action: 'set_pixel', pixel }
      });
    }
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('pixels', 'readwrite');
      await tx.store.clear();
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to clear cache'),
        context: { action: 'clear_cache' }
      });
    }
  }

  async getMetadata(key: string): Promise<any> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('metadata', 'readonly');
      return await tx.store.get(key);
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to get metadata'),
        context: { action: 'get_metadata', key }
      });
      return null;
    }
  }

  async setMetadata(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('metadata', 'readwrite');
      await tx.store.put(value, key);
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to set metadata'),
        context: { action: 'set_metadata', key }
      });
    }
  }

  async getPixelRange(
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number
  ): Promise<PixelData[]> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('pixels', 'readonly');
      const index = tx.store.index('by-coordinates');
      const pixels: PixelData[] = [];

      // IDBKeyRange doesn't support 2D ranges, so we need to iterate
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const pixel = await index.get([x, y]);
          if (pixel) pixels.push(pixel);
        }
      }

      return pixels;
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to get pixel range'),
        context: { 
          action: 'get_pixel_range',
          startX,
          startY,
          endX,
          endY
        }
      });
      return [];
    }
  }

  async setPixelRange(pixels: PixelData[]): Promise<void> {
    if (!this.db) await this.init();
    try {
      const tx = this.db!.transaction('pixels', 'readwrite');
      await Promise.all(
        pixels.map(pixel => 
          tx.store.put({
            id: `${pixel.x}-${pixel.y}`,
            ...pixel
          })
        )
      );
    } catch (error) {
      monitoring.logError({
        error: error instanceof Error ? error : new Error('Failed to set pixel range'),
        context: { 
          action: 'set_pixel_range',
          pixelCount: pixels.length
        }
      });
    }
  }
}

export const pixelCache = new PixelCache();