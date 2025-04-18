import { useCallback } from 'react';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Transaction, Connection, Keypair } from '@solana/web3.js';
import { getWalletPublicKey, isWalletConnected } from '../utils/walletUtils';
import { monitoring } from '../services/monitoring';
import { getRpcEndpoint } from '../lib/getRpcEndpoint';

interface MintRequest {
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

export const useMintNft = () => {
  const mintNft = useCallback(async (wallet: WalletContextState, params: MintRequest): Promise<string> => {
    // Check for both adapter.signTransaction and direct signTransaction
    const hasSignTransaction =
      typeof wallet.adapter?.signTransaction === 'function' ||
      typeof (wallet as any).signTransaction === 'function';

    if (!wallet.connected || !wallet.publicKey || !hasSignTransaction) {
      console.error('signTransaction fehlt:', wallet);
      throw new Error('Wallet nicht korrekt verbunden');
    }

    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('WALLET_NOT_CONNECTED');

    // Generate Mint-Signer in Frontend
    const mintKeypair = Keypair.generate();
    const mintPublicKey = mintKeypair.publicKey.toBase58();

    try {
      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          wallet: pubkey.toBase58(),
          mint: mintPublicKey,
          ...params
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Fehler beim Holen der Transaktion');
      }

      const { transaction } = await response.json();
      const tx = Transaction.from(Buffer.from(transaction, 'base64'));

      // Try both signature methods
      let signedTx: Transaction | undefined;
      if (wallet.adapter?.signTransaction) {
        signedTx = await wallet.adapter.signTransaction(tx);
      } else if (typeof (wallet as any).signTransaction === 'function') {
        signedTx = await (wallet as any).signTransaction(tx);
      }

      if (!signedTx) {
        throw new Error('Signatur fehlgeschlagen');
      }

      const endpoint = await getRpcEndpoint();
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
      });

      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });

      const confirmation = await connection.confirmTransaction(sig, 'confirmed');
      if (confirmation.value.err) {
        monitoring.logError({
          error: new Error('Transaction confirmation failed'),
          context: {
            action: 'mint_nft_confirmation',
            signature: sig,
            error: confirmation.value.err,
            mint: mintPublicKey
          }
        });
        throw new Error('Transaction failed');
      }

      return mintPublicKey;
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('NFT Minting fehlgeschlagen'),
        context: { 
          action: 'mint_nft',
          wallet: pubkey.toBase58(),
          mint: mintPublicKey,
          error: error instanceof Error ? error.message : 'Unknown error',
          hasAdapterSignTransaction: !!wallet.adapter?.signTransaction,
          hasDirectSignTransaction: typeof (wallet as any).signTransaction === 'function'
        }
      });
      throw new Error('NFT konnte nicht erstellt werden');
    }
  }, []);

  return { mintNft };
};
