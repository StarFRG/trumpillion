import { useCallback } from 'react';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { getWalletPublicKey, isWalletConnected } from '../utils/walletUtils';

interface MintRequest {
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

export const useMintNft = () => {
  const mintNft = useCallback(async (wallet: WalletContextState, params: MintRequest): Promise<string> => {
    if (!isWalletConnected(wallet)) throw new Error('Wallet nicht verbunden');
    const pubkey = getWalletPublicKey(wallet);
    if (!pubkey) throw new Error('Wallet-Adresse fehlt');

    const response = await fetch('/.netlify/functions/mint-nft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: pubkey.toBase58(), ...params })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Minting fehlgeschlagen');
    }

    const { transaction, mint } = await response.json();
    const tx = Transaction.from(Buffer.from(transaction, 'base64'));
    const signed = await wallet.signTransaction?.(tx);
    if (!signed) throw new Error('Signatur fehlgeschlagen');

    const connection = wallet.wallet?.adapter?.connection;
    if (!connection) throw new Error('Solana Verbindung fehlt');

    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, 'confirmed');

    return mint;
  }, []);

  return { mintNft };
};