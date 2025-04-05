import * as THREE from 'three';
import type { Viewer } from 'openseadragon';

export class WebGLRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private viewer: Viewer;
 private texture: THREE.Texture = new THREE.Texture();
private mesh: THREE.Mesh = new THREE.Mesh();
private animationFrameId: number = 0;
  private disposed = false;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.scene = new THREE.Scene();
    
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1000);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    const container = viewer.element;
    if (container) {
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.top = '0';
      this.renderer.domElement.style.left = '0';
      this.renderer.domElement.style.pointerEvents = 'none';
      this.renderer.domElement.style.opacity = '1';
      this.renderer.domElement.style.mixBlendMode = 'normal';
      this.renderer.domElement.style.zIndex = '2';
      container.appendChild(this.renderer.domElement);
    }

    window.addEventListener('resize', this.handleResize);
    viewer.addHandler('update-viewport', this.syncWithOSD);
    viewer.addHandler('animation', this.syncWithOSD);
    
    this.animate();
  }

  private handleResize = () => {
    if (this.disposed || !this.renderer.domElement.parentElement) return;
    
    const width = this.renderer.domElement.parentElement.clientWidth;
    const height = this.renderer.domElement.parentElement.clientHeight;
    const aspect = width / height;

    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    this.syncWithOSD();
  };

  private syncWithOSD = () => {
    if (this.disposed || !this.viewer.isOpen() || !this.mesh) return;

    const viewport = this.viewer.viewport;
    const bounds = viewport.getBounds();
    const homeBounds = viewport.getHomeBounds();
    
    if (!homeBounds) return;

    const scaleX = bounds.width / homeBounds.width;
    const scaleY = bounds.height / homeBounds.height;

    const centerX = (bounds.x + bounds.width / 2 - homeBounds.x) / homeBounds.width * 2 - 1;
    const centerY = -((bounds.y + bounds.height / 2 - homeBounds.y) / homeBounds.height * 2 - 1);

    this.mesh.position.set(centerX, centerY, 0);
    this.mesh.scale.set(scaleX, scaleY, 1);

    this.renderer.render(this.scene, this.camera);
  };

  private animate = () => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.syncWithOSD();
  };

  public setImage(imageUrl: string): void {
    // WebGL renderer is now only used for effects, not the main image
    return;
  }

  public destroy(): void {
    this.disposed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    window.removeEventListener('resize', this.handleResize);
    
    if (this.viewer) {
      this.viewer.removeHandler('update-viewport', this.syncWithOSD);
      this.viewer.removeHandler('animation', this.syncWithOSD);
    }

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }

    if (this.texture) {
      this.texture.dispose();
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.material instanceof THREE.Material) {
        this.mesh.material.dispose();
      }
    }

    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
      this.scene.remove(child);
    }

    this.renderer.dispose();
  }
}