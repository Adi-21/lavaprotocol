import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const assets = searchParams.get('assets') ?? 'BTCUSD,BITCOINUSD'

    const token = process.env.NEXT_PUBLIC_STORK_API_TOKEN || process.env.STORK_API_TOKEN
    const upstreamUrl = `https://rest.jp.stork-oracle.network/v1/prices/latest?assets=${encodeURIComponent(assets)}`

    const res = await fetch(upstreamUrl, {
      headers: token ? { Authorization: `Basic ${token}` } : undefined,
      // Ensure no caching and always fresh
      cache: 'no-store',
    })

    const text = await res.text()

    // Pass through status and content type, disable caching
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to fetch Stork latest price' },
      { status: 500 }
    )
  }
}


