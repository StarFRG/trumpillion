export interface MintNftParams {
  wallet: string;
  name: string;
  description: string;
  imageUrl: string;
  x: number;
  y: number;
}

export async function mintNftFromServer(data: MintNftParams): Promise<string> {
  const response = await fetch('/.netlify/functions/mint-nft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'NFT Minting fehlgeschlagen' }));
    throw new Error(error.error || 'NFT Minting fehlgeschlagen');
  }

  const result = await response.json();
  return result.mint;
}