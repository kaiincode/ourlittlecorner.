import { NextRequest, NextResponse } from 'next/server'
import { searchSpotify } from '@/lib/api/spotify'

// Love song search terms for variety
const loveSongQueries = [
  'love song',
  'romantic ballad',
  'classic love song',
  'acoustic love',
  'indie love song',
  'pop love song',
  'R&B love song',
  'country love song',
  'jazz love song',
  'folk love song'
]

export async function GET(req: NextRequest) {
  try {
    // Use date to get consistent daily results
    const today = new Date()
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    const queryIndex = dayOfYear % loveSongQueries.length
    const query = loveSongQueries[queryIndex]
    
    // Search for love songs using shared utility
    const data = await searchSpotify(query, { 
      limit: 50,
      market: 'VN'
    })
    
    const tracks = data?.tracks?.items || []
    
    if (tracks.length === 0) {
      return NextResponse.json({ error: 'No tracks found' }, { status: 404 })
    }
    
    // Use day of year to select a consistent track for the day
    const selectedTrack = tracks[dayOfYear % tracks.length]
    
    const song = {
      id: selectedTrack.id,
      name: selectedTrack.name,
      artists: selectedTrack.artists?.map((a: any) => a.name)?.join(', '),
      preview_url: selectedTrack.preview_url,
      external_url: selectedTrack.external_urls?.spotify,
      image: selectedTrack.album?.images?.[1]?.url || selectedTrack.album?.images?.[0]?.url || '',
      album_name: selectedTrack.album?.name,
      duration_ms: selectedTrack.duration_ms,
      popularity: selectedTrack.popularity,
      date: today.toISOString().split('T')[0] // YYYY-MM-DD format
    }
    
    return NextResponse.json({ song })
  } catch (e: any) {
    console.error('Daily love song route error:', e)
    return NextResponse.json(
      { 
        error: 'Failed to fetch daily song', 
        detail: e?.message || 'Unexpected error' 
      }, 
      { status: 500 }
    )
  }
}

