import { useCallback } from 'react';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Connection, Transaction } from '@solana/web3.js';
import { getWalletPublicKey, isWalletConnected, getWalletAddressSafe } from '../utils/walletUtils';
import { getRpcEndpoint } from '../lib/getRpcEndpoint';
import { monitoring } from '../services/monitoring';
import { getErrorMessage } from '../utils/errorMessages';

interface MintRequest {
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

export const useMintNft = () => {
  const mintNft = useCallback(async (
    wallet: WalletContextState,
    params: MintRequest
  ): Promise<string> => {
    try {
      if (!isWalletConnected(wallet)) {
        throw new Error('WALLET_NOT_CONNECTED');
      }

      const pubkey = getWalletPublicKey(wallet);
      if (!pubkey) {
        throw new Error('WALLET_NOT_CONNECTED');
      }

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
        const error = await response.json();
        throw new Error(error?.error || 'MINT_FAILED');
      }

      const { transaction, mint } = await response.json();
      if (!transaction || !mint) {
        throw new Error('MINT_FAILED');
      }

      const tx = Transaction.from(Buffer.from(transaction, 'base64'));
      const signed = await wallet.signTransaction?.(tx);
      if (!signed || !signed.signature) {
        throw new Error('MINT_FAILED');
      }

      const endpoint = await getRpcEndpoint();
      const connection = new Connection(endpoint, 'confirmed');

      // Serialize transaction with signature check
      const rawTx = signed.serialize();
      if (!rawTx) {
        throw new Error('MINT_FAILED');
      }

      // Get latest blockhash for transaction confirmation
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Send transaction
      const sig = await connection.sendRawTransaction(rawTx);

      // Confirm transaction with blockhash
      const confirmation = await connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error('MINT_FAILED');
      }

      return mint;
    } catch (error) {
      const message = getErrorMessage(error);
      monitoring.logErrorWithContext(error, 'useMintNft.ts:mintNft', {
        wallet: getWalletAddressSafe(wallet),
        input: params,
        error: message
      });
      throw new Error(message);
    }
  }, []);

  return { mintNft };
};