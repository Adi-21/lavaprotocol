export type StorkLatestPrice = {
  symbol: string
  price: bigint // 18 decimals
  timestampNs: bigint
}

function parseBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'string') return BigInt(value)
    if (typeof value === 'number') return BigInt(Math.trunc(value))
    return null
  } catch {
    return null
  }
}

/**
 * Fetch latest price from Stork REST. Tries both BTCUSD and BITCOINUSD symbols.
 * Returns 18-decimal price as bigint and timestamp (ns).
 */
export async function fetchStorkLatestPrice(): Promise<StorkLatestPrice | null> {
  // Call our server route to avoid CORS
  const url = '/api/stork/latest?assets=BTCUSD,BITCOINUSD'

  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Basic ${token}` } : undefined,
      cache: 'no-store',
    })

    if (!res.ok) return null

    const json = await res.json()
    // Prefer BITCOINUSD if present; otherwise BTCUSD
    const preferOrder: Array<'BITCOINUSD' | 'BTCUSD'> = ['BITCOINUSD', 'BTCUSD']
    for (const symbol of preferOrder) {
      const entry = json?.[symbol]
      if (entry?.price) {
        const price = parseBigInt(entry.price)
        const ts = parseBigInt(entry.timestamp)
        if (price !== null && ts !== null) {
          return { symbol, price, timestampNs: ts }
        }
      }
    }
    return null
  } catch {
    return null
  }
}


