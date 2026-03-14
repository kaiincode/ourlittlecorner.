/**
 * Music service utility using iTunes Search API.
 * Replaces Spotify to avoid Premium account requirements and API changes.
 * Maintains compatibility with existing data structures.
 */

const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

export type MusicSearchOptions = {
  type?: string;
  limit?: number;
  market?: string;
};

/**
 * Searches for music using iTunes API.
 * Maps results to a format compatible with the application's Spotify-based structure.
 */
export async function searchMusic(query: string, options: MusicSearchOptions = {}) {
  const { limit = 10, market = 'VN' } = options;
  
  const url = new URL(ITUNES_SEARCH_API);
  url.searchParams.append('term', query);
  url.searchParams.append('entity', 'song');
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('country', market); // iTunes uses 'country' instead of 'market'

  const res = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('iTunes Search Error:', res.status, errorText);
    throw new Error(`Music search failed: ${res.status}`);
  }

  const data = await res.json();
  
  // Map iTunes results to the application's internal "Spotify-like" structure
  return {
    tracks: {
      items: data.results.map((item: any) => ({
        id: item.trackId.toString(),
        name: item.trackName,
        artists: [{ name: item.artistName }], // Match Spotify artists array structure
        preview_url: item.previewUrl,
        external_urls: { spotify: item.trackViewUrl }, // Fallback to iTunes URL
        album: {
          name: item.collectionName,
          images: [
            { url: item.artworkUrl100.replace('100x100', '600x600') }, // High res
            { url: item.artworkUrl100.replace('100x100', '300x300') }, // Med res
          ]
        }
      }))
    }
  };
}

// Backward compatibility aliases
export const searchSpotify = searchMusic;
export const getSpotifyToken = async () => ({ access_token: 'itunes_no_token_needed' });
