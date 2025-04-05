import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NFTService } from '../nft';
import { PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

vi.mock('@solana/web3.js', () => ({
  PublicKey: vi.fn(),
  Connection: vi.fn()
}));

vi.mock('@metaplex-foundation/js', () => ({
  Metaplex: {
    make: vi.fn().mockReturnValue({
      use: vi.fn().mockReturnThis(),
      nfts: vi.fn().mockReturnValue({
        uploadMetadata: vi.fn(),
        create: vi.fn(),
        verifyCollection: vi.fn()
      })
    })
  },
  bundlrStorage: vi.fn()
}));

describe('NFTService', () => {
  let nftService: NFTService;
  let mockWallet: PublicKey;

  beforeEach(() => {
    nftService = new NFTService();
    mockWallet = new PublicKey('test');
    vi.clearAllMocks();
  });

  describe('mintNFT', () => {
    it('should upload metadata and mint NFT successfully', async () => {
      const mockUri = 'test-uri';
      const mockNftAddress = 'test-nft-address';

      const metaplex = Metaplex.make();
      metaplex.nfts().uploadMetadata.mockResolvedValue({ uri: mockUri });
      metaplex.nfts().create.mockResolvedValue({
        nft: { address: mockNftAddress }
      });

      const result = await nftService.mintNFT(
        mockWallet,
        'Test NFT',
        'Test Description',
        'test.jpg',
        100,
        100
      );

      expect(result).toBe(mockNftAddress);
      expect(metaplex.nfts().uploadMetadata).toHaveBeenCalled();
      expect(metaplex.nfts().create).toHaveBeenCalled();
      expect(metaplex.nfts().verifyCollection).toHaveBeenCalled();
    });

    it('should handle errors during minting', async () => {
      const metaplex = Metaplex.make();
      metaplex.nfts().uploadMetadata.mockRejectedValue(new Error('Upload failed'));

      await expect(nftService.mintNFT(
        mockWallet,
        'Test NFT',
        'Test Description',
        'test.jpg',
        100,
        100
      )).rejects.toThrow();
    });
  });
});