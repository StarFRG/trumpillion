import { useCallback } from 'react';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Transaction, Connection } from '@solana/web3.js';
import { getWalletPublicKey, isWalletConnected, getWalletAddressSafe } from '../utils/walletUtils';
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
    if (!isWalletConnected(wallet)) {
      throw new Error('WALLET_NOT_CONNECTED');
    }

    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('WALLET_NOT_CONNECTED');

    try {
      const response = await fetch('/.netlify/functions/mint-nft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          wallet: pubkey.toBase58(),
          ...params
        })
      });

      if (!response.ok) {
        let errMsg = 'Minting fehlgeschlagen';
        try {
          const err = await response.json();
          errMsg = err.error || errMsg;

          monitoring.logError({
            error: new Error(errMsg),
            context: {
              action: 'mint_nft_response_error',
              responseStatus: response.status,
              responseBody: err,
              wallet: getWalletAddressSafe(wallet),
              params
            }
          });
        } catch {
          // Fallback wenn response kein valides JSON enthält
          monitoring.logError({
            error: new Error('Invalid JSON response'),
            context: {
              action: 'mint_nft_parse_error',
              responseStatus: response.status,
              wallet: getWalletAddressSafe(wallet),
              params
            }
          });
        }
        throw new Error(errMsg);
      }

      const { transaction, mint } = await response.json();
      const tx = Transaction.from(Buffer.from(transaction, 'base64'));
      const signed = await wallet.signTransaction?.(tx);
      if (!signed) throw new Error('Signatur fehlgeschlagen');

      // Use QuickNode endpoint instead of wallet adapter connection
      const endpoint = await getRpcEndpoint();
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000
      });

      const sig = await connection.sendRawTransaction(signed.serialize(), {
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
            wallet: getWalletAddressSafe(wallet),
            params
          }
        });
        throw new Error('Transaction failed');
      }

      return mint;
    } catch (error) {
      console.error('NFT Minting fehlgeschlagen:', error);
      monitoring.logError({
        error: error instanceof Error ? error : new Error('NFT Minting fehlgeschlagen'),
        context: { 
          action: 'mint_nft',
          wallet: getWalletAddressSafe(wallet),
          name: params.name,
          x: params.x,
          y: params.y,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      throw new Error('NFT konnte nicht erstellt werden');
    }
  }, []);

  return { mintNft };
};
