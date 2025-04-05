import { describe, it, expect, beforeEach, vi } from 'vitest';
import { solanaService } from '../solana';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(),
  PublicKey: vi.fn(),
  Transaction: vi.fn(),
  SystemProgram: {
    transfer: vi.fn()
  }
}));

describe('SolanaService', () => {
  let mockWallet: WalletContextState;

  beforeEach(() => {
    mockWallet = {
      publicKey: new PublicKey('test'),
      connected: true,
      signTransaction: vi.fn(),
      signAllTransactions: vi.fn(),
      signMessage: vi.fn(),
    };

    vi.clearAllMocks();
  });

  describe('processPayment', () => {
    it('should throw error if wallet not connected', async () => {
      mockWallet.connected = false;
      await expect(solanaService.processPayment(mockWallet))
        .rejects
        .toThrow('Wallet nicht verbunden');
    });

    it('should process payment successfully', async () => {
      const mockTxId = 'test-tx-id';
      mockWallet.signTransaction.mockResolvedValue(new Transaction());
      
      const connection = new Connection('');
      connection.getBalance = vi.fn().mockResolvedValue(2000000000);
      connection.getLatestBlockhash = vi.fn().mockResolvedValue({
        blockhash: 'test',
        lastValidBlockHeight: 1234
      });
      connection.sendRawTransaction = vi.fn().mockResolvedValue(mockTxId);
      connection.confirmTransaction = vi.fn().mockResolvedValue({
        value: { err: null }
      });

      const result = await solanaService.processPayment(mockWallet);
      expect(result).toBe(mockTxId);
    });
  });

  describe('mintNFT', () => {
    it('should throw error if wallet not connected', async () => {
      mockWallet.connected = false;
      await expect(solanaService.mintNFT(
        mockWallet,
        'test',
        'test',
        'test.jpg'
      )).rejects.toThrow('Wallet nicht verbunden');
    });

    it('should mint NFT successfully', async () => {
      const mockNftAddress = 'test-nft-address';
      const nftService = {
        mintNFT: vi.fn().mockResolvedValue({
          address: { toString: () => mockNftAddress }
        })
      };

      const result = await solanaService.mintNFT(
        mockWallet,
        'test',
        'test',
        'test.jpg'
      );
      expect(result).toBe(mockNftAddress);
    });
  });
});