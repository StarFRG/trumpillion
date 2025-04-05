export async function mintNftFromServer(data: {
  wallet: string
  name: string
  description: string
  imageUrl: string
  x: number
  y: number
}) {
  const res = await fetch('/.netlify/functions/mint-nft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Minting fehlgeschlagen')

  return result.mint
}