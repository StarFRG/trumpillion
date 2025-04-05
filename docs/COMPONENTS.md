# Component Documentation

## Core Components

### PixelGrid
The main visualization component for the Trump mosaic.

**Props**
```typescript
interface PixelGridProps {
  onPixelClick: (pixel: PixelData) => void;
}
```

### PixelModal
Modal for uploading images and minting NFTs.

**Props**
```typescript
interface PixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: PixelData | null;
  setSelectedPixel: (pixel: PixelData | null) => void;
  fromButton: boolean;
}
```

### ShareModal
Modal for sharing pixel content.

**Props**
```typescript
interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pixel: PixelData | null;
}
```

## Wallet Components

### WalletButton
Button for connecting to Solana wallets.

**Props**
```typescript
interface WalletButtonProps {
  minimal?: boolean;
}
```

### WalletProvider
Context provider for wallet functionality.

## Error Handling

### ErrorBoundary
React error boundary for graceful error handling.

**Props**
```typescript
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}
```