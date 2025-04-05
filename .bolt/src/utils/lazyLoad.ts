import 'intersection-observer';

export const lazyLoadTiles = () => {
  const tiles = document.querySelectorAll(".mosaic-tile");

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const tile = entry.target as HTMLElement;
          const tileUrl = tile.getAttribute("data-src");
          if (tileUrl) {
            tile.style.backgroundImage = `url(${tileUrl})`;
            obs.unobserve(tile);
          }
        }
      });

      // Disconnect observer when no more tiles need loading
      if (document.querySelectorAll(".mosaic-tile:not([style])").length === 0) {
        obs.disconnect();
      }
    },
    { 
      rootMargin: "200px", 
      threshold: 0.1 
    }
  );

  tiles.forEach((tile) => observer.observe(tile));

  return () => {
    observer.disconnect();
  };
};