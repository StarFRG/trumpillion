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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || 'NFT Minting fehlgeschlagen');
  }

  return result.mint;
}