import { NextRequest, NextResponse } from 'next/server'
import { searchSpotify } from '@/lib/api/spotify'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    
    if (!q) return NextResponse.json({ items: [] })

    // Use shared utility which handles token, market, and user-agent
    const data = await searchSpotify(q, { 
      limit: 10,
      market: 'VN' // Default to VN as requested/relevant
    })

    const items = (data?.tracks?.items || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artists: t.artists?.map((a: any) => a.name)?.join(', '),
      // Note: preview_url is deprecated by Spotify (Nov 2024). 
      // It may return null for most tracks now.
      preview_url: t.preview_url, 
      external_url: t.external_urls?.spotify,
      image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
    }))

    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('Search route error:', e)
    return NextResponse.json(
      { 
        error: 'Search failed', 
        detail: e?.message || 'Unexpected error' 
      }, 
      { status: 500 }
    )
  }
}



