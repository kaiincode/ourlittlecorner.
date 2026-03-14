"use client"

import { useEffect, useRef, useState } from "react"

type SongPreviewProps = {
  trackId?: string | null
  name?: string | null
  artists?: string | null
  image?: string | null
  previewUrl?: string | null
  hideControls?: boolean
}

export default function SongPreview({ trackId, name, artists, image, previewUrl, hideControls }: SongPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('ended', onEnded)
    return () => { audio.removeEventListener('ended', onEnded) }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setIsPlaying(false)
  }, [previewUrl])

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white/80">
      {/* Cover */}
      <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="cover" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
      </div>
      {/* Meta */}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-900 truncate">{name || 'Track'}</div>
        <div className="text-[11px] text-gray-600 truncate">{artists}</div>
        {!hideControls && (
          <div className="mt-1 flex items-center gap-2">
            <div className="flex flex-col">
              <button
                disabled={!previewUrl}
                onClick={async (e)=>{
                  e.stopPropagation()
                const audio = audioRef.current
                if (!audio || !previewUrl) return
                if (isPlaying) {
                  audio.pause()
                  setIsPlaying(false)
                } else {
                  try {
                    await audio.play()
                    setIsPlaying(true)
                  } catch {}
                }
                }}
                className="px-3 py-1.5 text-xs rounded-full border border-gray-900 text-gray-900 bg-white disabled:opacity-30 disabled:border-gray-300 disabled:text-gray-400"
              >
                {isPlaying ? 'Pause' : 'Play preview'}
              </button>
              {!previewUrl && (
                <span className="text-[9px] text-gray-400 mt-0.5 ml-1">Preview unavailable</span>
              )}
            </div>
            {trackId && (
              <a href={`https://open.spotify.com/track/${trackId}`} target="_blank" rel="noreferrer" className="text-[11px] text-gray-700 underline h-fit" onClick={(e)=> e.stopPropagation()}>Open in Spotify</a>
            )}
          </div>
        )}

      </div>
      <audio ref={audioRef} src={previewUrl || undefined} preload="none" />
    </div>
  )
}


