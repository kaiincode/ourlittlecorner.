"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Calendar, Music, Image, Heart, BookOpen, Clock, ExternalLink } from "lucide-react"
import { formatLocalDate, formatTimelineDate } from '@/lib/utils'
import { contentHasFontStyling, htmlToDisplayHtml } from "@/lib/utils"

type JournalTheme = {
  name: string
  color: string
  fontFamilyCss: string
  fontFace: string
}

const NOTE_THEMES: JournalTheme[] = [
  {
    name: "Amber Script",
    color: "#f59e0b",
    fontFamilyCss: "var(--font-handwriting), cursive",
    fontFace: "Mynerve",
  },
  {
    name: "Indigo Note",
    color: "#3b82f6",
    fontFamilyCss: "'Crimson Pro', serif",
    fontFace: "Crimson Pro",
  },
  {
    name: "Rose",
    color: "#f43f5e",
    fontFamilyCss: "'Source Serif 4', serif",
    fontFace: "Source Serif 4",
  },
  {
    name: "Emerald Classic",
    color: "#10b981",
    fontFamilyCss: "'Playfair Display', serif",
    fontFace: "Playfair Display",
  },
  {
    name: "Violet Ink",
    color: "#8b5cf6",
    fontFamilyCss: "'Cormorant Garamond', serif",
    fontFace: "Cormorant Garamond",
  },
  {
    name: "Teal Dream",
    color: "#14b8a6",
    fontFamilyCss: "'Dancing Script', cursive",
    fontFace: "Dancing Script",
  },
  {
    name: "Green Whisper",
    color: "#22c55e",
    fontFamilyCss: "'Alex Brush', cursive",
    fontFace: "Alex Brush",
  },
  {
    name: "Pink Bloom",
    color: "#fb7185",
    fontFamilyCss: "'Great Vibes', cursive",
    fontFace: "Great Vibes",
  },
  {
    name: "Cyan Light",
    color: "#06b6d4",
    fontFamilyCss: "'Pinyon Script', cursive",
    fontFace: "Pinyon Script",
  },
]

const DEFAULT_NOTE_THEME =
  NOTE_THEMES.find((t) => t.fontFace === "Mynerve") ?? NOTE_THEMES[0]!

function getThemeByColor(color: string | null | undefined): JournalTheme | null {
  if (!color) return null
  return (
    NOTE_THEMES.find((t) => t.color.toLowerCase() === color.toLowerCase()) || null
  )
}

type TimelineItem = {
  id: string
  type: 'journal' | 'photo' | 'special_day'
  title: string
  content?: string
  date: string
  image?: string
  song?: {
    name: string
    artists: string
    image: string
  }
  cover_url?: string | null
  spotify_track_id?: string | null
  folder?: string
  author_name?: string
}

export default function MemoryTimelinePage() {
  const router = useRouter()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  

  // Load all content for timeline
  useEffect(() => {
    const loadTimeline = async () => {
      setLoading(true)
      setError("")
      
      try {
        const timelineItems: TimelineItem[] = []

        // Load journals
        const { data: journals, error: journalsError } = await supabase
          .from('journals')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (journalsError) throw journalsError
        
        // Get unique author IDs
        const authorIds = [...new Set(journals?.map(j => j.author).filter(Boolean) || [])]
        
        // Fetch author names
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, username, name, full_name')
          .in('id', authorIds)
        
        // Create a map of author ID to display name (prioritize display_name, fallback to name)
        const authorMap = new Map(profiles?.map(p => [
          p.id, 
          p.display_name || p.name || p.username || p.full_name || `User ${p.id.slice(0, 8)}`
        ]) || [])
        
        journals?.forEach(journal => {
          timelineItems.push({
            id: journal.id,
            type: 'journal',
            title: journal.title || 'Untitled Note',
            content: journal.content,
            date: journal.created_at,
            image: journal.spotify_image,
            cover_url: journal.cover_url,
            spotify_track_id: journal.spotify_track_id,
            author_name: journal.author ? (authorMap.get(journal.author) || `User ${journal.author.slice(0, 8)}`) : null,
            song: journal.spotify_track_name ? {
              name: journal.spotify_track_name,
              artists: journal.spotify_artists || '',
              image: journal.spotify_image || ''
            } : undefined
          })
        })

        // Load photos
        const { data: photos, error: photosError } = await supabase
          .from('gallery_items')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (photosError) throw photosError
        
        photos?.forEach(photo => {
          timelineItems.push({
            id: photo.id,
            type: 'photo',
            title: photo.title || photo.name || 'Photo',
            date: photo.created_at,
            image: photo.url,
            folder: photo.folder
          })
        })

        // Load special days
        const { data: specialDays, error: specialDaysError } = await supabase
          .from('special_days')
          .select('*')
          .order('date', { ascending: false })
        
        if (specialDaysError) throw specialDaysError
        
        specialDays?.forEach(day => {
          timelineItems.push({
            id: day.id,
            type: 'special_day',
            title: day.title || 'Special Day',
            content: day.note,
            date: day.created_at  // Use creation time, not the special day date
          })
        })

        // Sort by date (newest first)
        timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        
        setItems(timelineItems)
      } catch (err: any) {
        setError(err.message || 'Failed to load timeline')
      } finally {
        setLoading(false)
      }
    }

    loadTimeline()
  }, [])

  // Group items by date
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: TimelineItem[] } = {}
    
    items.forEach(item => {
      let dateKey: string
      
      if (item.type === 'special_day') {
        // For special days, use the actual date of the special day
        dateKey = formatLocalDate(item.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      } else {
        // For journals and photos, use the creation date
        dateKey = formatLocalDate(item.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      }
      
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(item)
    })
    
    return groups
  }, [items])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'journal': return <BookOpen className="w-4 h-4" />
      case 'photo': return <Image className="w-4 h-4" />
      case 'special_day': return <Heart className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'journal': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'photo': return 'bg-green-100 text-green-800 border-green-200'
      case 'special_day': return 'bg-pink-100 text-pink-800 border-pink-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }


  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar currentPage="memory-timeline" />

      {/* Title Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-black">
            Memory Timeline
          </h1>
          <p className="mt-2 text-gray-600 text-base sm:text-lg font-light">
            All our precious moments in chronological order
          </p>
        </motion.div>
      </div>

      {/* Stats Cards */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 sm:mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {items.filter(item => item.type === 'journal').length}
                  </p>
                  <p className="text-sm text-gray-600">Journal Entries</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Image className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {items.filter(item => item.type === 'photo').length}
                  </p>
                  <p className="text-sm text-gray-600">Photos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                  <Heart className="w-6 h-6 text-pink-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {items.filter(item => item.type === 'special_day').length}
                  </p>
                  <p className="text-sm text-gray-600">Special Days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-12">
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <div className="space-y-3">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : Object.keys(groupedItems).length === 0 ? (
          <Card className="text-center py-20">
            <CardContent>
              <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <Calendar className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No memories yet</h3>
              <p className="text-gray-500 mb-6">Start creating journals, uploading photos, or adding special days to see them here!</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" asChild>
                  <a href="/journals">Create Journal</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/albums">Upload Photos</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/special-days">Add Special Day</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="space-y-16">
              {Object.entries(groupedItems).map(([date, dayItems], dateIndex) => (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: dateIndex * 0.1 }}
                  className="relative"
                >
                  {/* Date Header - Elegant Design */}
                  <div className="relative mb-12">
                    <div className="flex items-center gap-6">
                      <div className="flex-shrink-0">
                        <div className="w-20 h-20 bg-white rounded-2xl shadow-lg border border-gray-100 flex items-center justify-center">
                          <Calendar className="w-10 h-10 text-gray-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h2 className="text-3xl font-handwriting text-gray-900 mb-2">
                          {date}
                        </h2>
                        <div className="flex items-center gap-4">
                          <p className="text-gray-500 text-lg">
                            {dayItems.length} memor{dayItems.length === 1 ? 'y' : 'ies'}
                          </p>
                          <div className="h-px bg-gradient-to-r from-gray-200 to-transparent flex-1"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Timeline Items - Modern Card Design */}
                  <div className="space-y-8">
                    {dayItems.map((item, index) => (
                      <motion.div
                        key={`${item.id}-${index}`}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="group"
                      >
                        <Card className="border-0 shadow-sm hover:shadow-xl transition-all duration-500 bg-white/80 backdrop-blur-sm overflow-hidden">
                          <div className="flex">
                            {/* Left Side - Type Indicator */}
                            <div className="flex-shrink-0 w-20 flex flex-col items-center py-6">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${getTypeColor(item.type)}`}>
                                {getTypeIcon(item.type)}
                              </div>
                              <div className="mt-3 w-px h-8 bg-gradient-to-b from-gray-200 to-transparent"></div>
                            </div>

                            {/* Right Side - Content */}
                            <div className="flex-1 p-6">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                  <h3 className="font-handwriting text-xl text-gray-900 mb-2 group-hover:text-gray-700 transition-colors">
                                    {item.title}
                                  </h3>
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className={`text-xs font-medium ${getTypeColor(item.type)}`}>
                                      {item.type.replace('_', ' ')}
                                    </Badge>
                                    {item.folder && item.folder !== 'root' && (
                                      <Badge variant="secondary" className="text-xs">
                                        {item.folder}
                                      </Badge>
                                    )}
                                    <span className="text-xs text-gray-400">
                                      {formatTimelineDate(item.date, item.type)}
                                    </span>
                                    {item.author_name && (
                                      <>
                                        <span className="text-xs text-gray-400">•</span>
                                        <span className="text-xs text-gray-500">by {item.author_name}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Action Button: navigate to item */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 hover:bg-gray-100"
                                    onClick={() => {
                                      if (item.type === 'journal') {
                                        router.push('/journals')
                                      } else if (item.type === 'photo') {
                                        router.push('/albums')
                                      } else if (item.type === 'special_day') {
                                        router.push('/special-days')
                                      }
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {/* Content Preview */}
                              {item.content ? (
                                <div
                                  className="text-gray-600 text-sm mb-4 line-clamp-3 leading-relaxed"
                                  style={{
                                    fontFamily:
                                      contentHasFontStyling(item.content)
                                        ? undefined
                                        : item.spotify_track_id
                                            ? "var(--font-handwriting), cursive"
                                            : getThemeByColor(item.cover_url)
                                                  ?.fontFamilyCss ||
                                              DEFAULT_NOTE_THEME.fontFamilyCss,
                                  }}
                                  dangerouslySetInnerHTML={{
                                    __html: htmlToDisplayHtml(item.content),
                                  }}
                                />
                              ) : null}

                              {/* Song Info */}
                              {item.song && (
                                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50/50 to-gray-100/30 rounded-xl mb-4 border border-gray-100">
                                  <img 
                                    src={item.song.image} 
                                    alt={item.song.name}
                                    className="w-16 h-16 rounded-xl object-cover shadow-sm"
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium text-sm text-gray-900">{item.song.name}</p>
                                    <p className="text-xs text-gray-500">by {item.song.artists}</p>
                                  </div>
                                  <Music className="w-5 h-5 text-gray-400" />
                                </div>
                              )}

                              {/* Photo */}
                              {item.image && item.type === 'photo' && (
                                <div className="mb-4">
                                  <img 
                                    src={item.image} 
                                    alt={item.title}
                                    className="w-full max-w-md h-56 object-cover rounded-xl shadow-sm"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* No edit/delete UI per requirements */}

      <Footer />
    </div>
  )
}
