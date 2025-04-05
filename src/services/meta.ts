export class MetaService {
  private originalMetaTags: Map<string, string> = new Map();
  private hasStoredOriginalTags = false;

  private storeOriginalMetaTags() {
    if (this.hasStoredOriginalTags || typeof document === 'undefined') return;
    
    const metaTags = document.querySelectorAll('meta[name], meta[property]');
    metaTags.forEach((tag) => {
      const name = tag.getAttribute('name') || tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (name && content) {
        this.originalMetaTags.set(name, content);
      }
    });
    
    this.hasStoredOriginalTags = true;
  }

  private setMeta(nameOrProp: string, content: string) {
    if (typeof document === 'undefined') return;

    let tag = document.querySelector(`meta[name="${nameOrProp}"], meta[property="${nameOrProp}"]`);
    
    if (!tag) {
      tag = document.createElement('meta');
      if (nameOrProp.startsWith('og:')) {
        tag.setAttribute('property', nameOrProp);
      } else {
        tag.setAttribute('name', nameOrProp);
      }
      document.head.appendChild(tag);
    }
    
    tag.setAttribute('content', content);
  }

  updateShareMetaTags(data: {
    title: string;
    description: string;
    imageUrl: string;
    url: string;
  }) {
    if (typeof document === 'undefined') return;

    // Store original meta tags before first update
    this.storeOriginalMetaTags();

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const fullImageUrl = data.imageUrl.startsWith('http') ? data.imageUrl : `${baseUrl}${data.imageUrl}`;
    const fullUrl = data.url.startsWith('http') ? data.url : `${baseUrl}${data.url}`;

    // Primary Meta Tags
    if (typeof document !== 'undefined') {
      document.title = data.title;
    }
    this.setMeta('title', data.title);
    this.setMeta('description', data.description);

    // Open Graph / Facebook
    this.setMeta('og:title', data.title);
    this.setMeta('og:description', data.description);
    this.setMeta('og:image', fullImageUrl);
    this.setMeta('og:url', fullUrl);

    // Twitter
    this.setMeta('twitter:title', data.title);
    this.setMeta('twitter:description', data.description);
    this.setMeta('twitter:image', fullImageUrl);
    this.setMeta('twitter:url', fullUrl);
  }

  resetMetaTags() {
    if (typeof document === 'undefined' || !this.hasStoredOriginalTags) return;

    this.originalMetaTags.forEach((content, name) => {
      this.setMeta(name, content);
    });

    // Reset document title
    if (typeof document !== 'undefined') {
      document.title = this.originalMetaTags.get('title') || 'Trumpillion - Be a Part of History';
    }
  }
}

export const metaService = new MetaService();