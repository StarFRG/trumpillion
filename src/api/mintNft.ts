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

  let result: any = {};
  try {
    result = await response.json();
  } catch {
    throw new Error('Ungültige Antwort vom Server');
  }

  if (!response.ok) {
    throw new Error(result?.error || 'NFT Minting fehlgeschlagen');
  }

  if (!result.mint || typeof result.mint !== 'string') {
    throw new Error('Mint-Adresse fehlt in Serverantwort');
  }

  return result.mint;
}