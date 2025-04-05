# Trumpillion API Documentation

## Overview

The Trumpillion API provides endpoints for managing pixels in the Trump mosaic and handling NFT minting operations.

## Authentication

All authenticated endpoints require a valid Solana wallet connection. The wallet's public key is used for authentication.

## Endpoints

### Pixels

#### GET /api/pixels
Retrieves all pixels in the mosaic.

**Response**
```json
{
  "pixels": [
    {
      "x": 0,
      "y": 0,
      "owner": "wallet_address",
      "imageUrl": "https://...",
      "nftUrl": "https://..."
    }
  ]
}
```

#### POST /api/pixels
Creates a new pixel entry.

**Request Body**
```json
{
  "x": 0,
  "y": 0,
  "imageUrl": "https://..."
}
```

### NFTs

#### POST /api/nfts/mint
Mints a new NFT for a pixel.

**Request Body**
```json
{
  "x": 0,
  "y": 0,
  "title": "My Trump Moment",
  "description": "Description"
}
```

## Error Handling

All endpoints return standard HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests
- 500: Internal Server Error

## Rate Limiting

API requests are limited to 100 requests per IP address per 15 minutes.