export interface MintNftParams {
  wallet: string;
  reference: string;
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
      'Accept': 'application/json',
      'x-application-name': 'trumpillion',
      'wallet': data.wallet
    },
    body: JSON.stringify(data)
  });

  let result: any = {};
  try {
    result = await response.json();
  } catch {
    throw new Error('INVALID_RESPONSE');
  }

  if (!response.ok) {
    throw new Error(result?.error || 'MINT_FAILED');
  }

  if (!result.mint || typeof result.mint !== 'string') {
    throw new Error('INVALID_MINT_ADDRESS');
  }

  return result.mint;
}