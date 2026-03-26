"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { supabase } from "@/lib/supabase/supabaseClient"
import { useAuth } from "@/app/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Calendar, Heart, Gift, Star, Trash2, Plus, Search, Filter, SortAsc, SortDesc, Grid, List, Eye, EyeOff } from "lucide-react"
import { formatLocalDate } from '@/lib/utils'

type SpecialDay = {
  id: string
  user_id: string | null
  user_name?: string | null
  date: string // YYYY-MM-DD
  title: string | null
  note: string | null
  created_at?: string
  kind?: 'birthday' | 'anniversary' | 'other'
}

function formatDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function SpecialDaysPage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState(() => new Date())
  const [items, setItems] = useState<SpecialDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDate, setEditDate] = useState<string>("")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [kind, setKind] = useState<'birthday' | 'anniversary' | 'other'>("other")
  
  // Filtering and pagination states
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'author' | 'kind'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [kindFilter, setKindFilter] = useState<'all' | 'birthday' | 'anniversary' | 'other'>('all')
  const [authorFilter, setAuthorFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  // Track dates explicitly cleared this session to suppress yearly fallback badges
  const [suppressedDates, setSuppressedDates] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  const year = current.getFullYear()
  const month = current.getMonth() // 0-based
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay() // 0 Sun - 6 Sat
  const daysInMonth = lastDay.getDate()

  const byDate = useMemo(() => {
    const map = new Map<string, SpecialDay[]>()
    for (const it of items) {
      const arr = map.get(it.date) || []
      arr.push(it)
      map.set(it.date, arr)
    }
    return map
  }, [items])

  // Get unique authors for filter dropdown
  const uniqueAuthors = useMemo(() => {
    const authors = items
      .map(item => ({ id: item.user_id, name: item.user_name }))
      .filter((author, index, self) => 
        author.id && self.findIndex(a => a.id === author.id) === index
      )
    return authors
  }, [items])

  // Filter and sort items for list view
  const filteredItems = useMemo(() => {
    let filtered = items

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        (item.title?.toLowerCase().includes(query)) ||
        (item.note?.toLowerCase().includes(query)) ||
        (item.user_name?.toLowerCase().includes(query))
      )
    }

    // Author filter
    if (authorFilter !== 'all') {
      filtered = filtered.filter(item => item.user_id === authorFilter)
    }

    // Kind filter
    if (kindFilter !== 'all') {
      filtered = filtered.filter(item => item.kind === kindFilter)
    }

    // Date range filter
    if (startDate) {
      const sd = new Date(startDate).getTime()
      filtered = filtered.filter(item => 
        item.date ? new Date(item.date).getTime() >= sd : false
      )
    }
    if (endDate) {
      const ed = new Date(endDate).getTime()
      filtered = filtered.filter(item => 
        item.date ? new Date(item.date).getTime() <= ed : false
      )
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'date':
          const dateA = new Date(a.date || 0).getTime()
          const dateB = new Date(b.date || 0).getTime()
          comparison = dateA - dateB
          break
        case 'title':
          const titleA = (a.title || '').toLowerCase()
          const titleB = (b.title || '').toLowerCase()
          comparison = titleA.localeCompare(titleB)
          break
        case 'author':
          const authorA = (a.user_name || '').toLowerCase()
          const authorB = (b.user_name || '').toLowerCase()
          comparison = authorA.localeCompare(authorB)
          break
        case 'kind':
          const kindA = (a.kind || '').toLowerCase()
          const kindB = (b.kind || '').toLowerCase()
          comparison = kindA.localeCompare(kindB)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [items, searchQuery, sortBy, sortOrder, kindFilter, authorFilter, startDate, endDate])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  const [recurring, setRecurring] = useState<Map<string, SpecialDay[]>>(new Map()) // key: MM-DD

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        console.log('Loading special days for user:', user?.id)
        console.log('Loading for month:', year, month + 1)
        
        const start = `${year}-${String(month + 1).padStart(2,'0')}-01`
        const end = `${year}-${String(month + 1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
        console.log('Date range:', start, 'to', end)
        
        const { data, error } = await supabase
          .from('special_days')
          .select('*')
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: true })
        
        console.log('Special days query result:', { data, error })
        
        if (error) {
          console.error('Supabase error:', error)
          throw error
        }

        // Get unique user IDs and fetch author names
        const userIds = [...new Set((data || []).map(item => item.user_id).filter(Boolean))]
        
        let authorMap = new Map()
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, username, name, full_name')
            .in('id', userIds)
          
          authorMap = new Map(profiles?.map(p => [
            p.id, 
            p.display_name || p.name || p.username || p.full_name || `User ${p.id.slice(0, 8)}`
          ]) || [])
        }

        // Map author names to items
        const itemsWithAuthors = (data || []).map(item => ({
          ...item,
          user_name: item.user_id ? (authorMap.get(item.user_id) || `User ${item.user_id.slice(0, 8)}`) : null
        }))

        setItems(itemsWithAuthors as any)

        // Recurring: fetch a wider range and filter client-side by month for yearly events
        // To avoid large scans, fetch last 20 years for this month window
        const startPast = `${year - 20}-${String(month + 1).padStart(2,'0')}-01`
        const endFuture = `${year + 1}-${String(month + 1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
        const { data: wide, error: wideErr } = await supabase
          .from('special_days')
          .select('*')
          .gte('date', startPast)
          .lte('date', endFuture)
        if (wideErr) throw wideErr
        const mm = month + 1
        const map = new Map<string, SpecialDay[]>()
        for (const it of (wide || []) as SpecialDay[]) {
          if (!(it.kind === 'birthday' || it.kind === 'anniversary')) continue
          const parts = (it.date || '').split('-')
          if (parts.length !== 3) continue
          const m = parseInt(parts[1], 10)
          const d = parts[2]
          if (m === mm) {
            const key = `${String(m).padStart(2,'0')}-${d}`
            const arr = map.get(key) || []
            arr.push(it)
            map.set(key, arr)
          }
        }
        setRecurring(map)
      } catch (e: any) {
        setError(e.message || 'Failed to load days')
        setItems([])
        setRecurring(new Map())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, month, daysInMonth])

  const openEditor = (dateKey: string) => {
    const existing = byDate.get(dateKey)?.[0]
    setEditDate(dateKey)
    setTitle(existing?.title || "")
    setNote(existing?.note || "")
    setKind((existing?.kind as any) || 'other')
    setDialogOpen(true)
  }

  const save = async () => {
    if (!editDate) return
    try {
      const payload: any = { date: editDate, title: title.trim() || null, note: note.trim() || null, kind }
      const existing = byDate.get(editDate)?.[0]
      if (existing) {
        const { error } = await supabase.from('special_days').update(payload).eq('id', existing.id)
        if (error) throw error
        setItems(prev => prev.map(x => x.id === existing.id ? { ...x, ...payload } as any : x))
      } else {
        const { data, error } = await supabase.from('special_days').insert(payload).select('*').single()
        if (error) throw error
        setItems(prev => [data as any, ...prev])
      }
      setDialogOpen(false)
      setEditDate("")
      setTitle("")
      setNote("")
      setKind('other')
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    }
  }

  const remove = async () => {
    if (!editDate) return
    const existing = byDate.get(editDate)?.[0]
    if (!existing) {
      setDialogOpen(false)
      return
    }
    try {
      const { error } = await supabase.from('special_days').delete().eq('id', existing.id)
      if (error) throw error
      setItems(prev => prev.filter(x => x.id !== existing.id))
      // Mark this date as suppressed so we don't show a fallback yearly badge
      setSuppressedDates(prev => new Set([...Array.from(prev), editDate]))
      setDialogOpen(false)
      setEditDate("")
      setTitle("")
      setNote("")
      setKind('other')
    } catch (e: any) {
      setError(e.message || 'Failed to delete')
    }
  }

  const days: Array<{ key: string; dateNum: number | null }> = []
  for (let i = 0; i < startWeekday; i++) days.push({ key: `blank-${i}`, dateNum: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    days.push({ key: dateKey, dateNum: d })
  }

  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(current)
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const years = useMemo(()=>{
    const arr: number[] = []
    const base = new Date().getFullYear()
    for (let y = base - 50; y <= base + 50; y++) arr.push(y)
    return arr
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar currentPage="special-days" />

      {/* Title Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-black">
            Special Days
          </h1>
          <p className="mt-2 text-gray-600 text-base sm:text-lg font-light">
            Celebrate life's precious moments
          </p>
        </motion.div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-12">
        {/* View Mode Toggle */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
          <motion.div 
            className="text-xl sm:text-2xl font-medium text-gray-900"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {viewMode === 'calendar' ? monthLabel : 'Special Days'}
          </motion.div>
          
          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-lg">
              <Button
                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('calendar')}
                className="rounded-r-none"
              >
                <Calendar className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-l-none"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>

            {/* Calendar Controls (only show in calendar view) */}
            {viewMode === 'calendar' && (
              <>
                <Select value={month.toString()} onValueChange={(value) => setCurrent(new Date(year, Number(value), 1))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((monthName, i) => (
                      <SelectItem key={monthName} value={i.toString()}>
                        {monthName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={year.toString()} onValueChange={(value) => setCurrent(new Date(Number(value), month, 1))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* List View Controls */}
        {viewMode === 'list' && (
          <div className="mb-8 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search special days..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                    className="pl-10 font-handwriting w-full"
                  />
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2 w-full md:w-auto"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Sort by:</span>
                  <Select value={sortBy} onValueChange={(value: 'date' | 'title' | 'author' | 'kind') => { setSortBy(value); setPage(1) }}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="author">Author</SelectItem>
                      <SelectItem value="kind">Type</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); setPage(1) }}
                    className="h-9 w-9 p-0"
                  >
                    {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Page Size */}
                <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(parseInt(value)); setPage(1) }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[6, 12, 24, 48].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Author Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Author:</label>
                    <Select value={authorFilter} onValueChange={(value) => { setAuthorFilter(value); setPage(1) }}>
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Authors</SelectItem>
                        {uniqueAuthors.map((author) => (
                          <SelectItem key={author.id} value={author.id || ''}>
                            {author.name || `User ${author.id?.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Kind Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Type:</label>
                    <Select value={kindFilter} onValueChange={(value: 'all' | 'birthday' | 'anniversary' | 'other') => { setKindFilter(value); setPage(1) }}>
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="birthday">Birthday</SelectItem>
                        <SelectItem value="anniversary">Anniversary</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Range Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Date Range:</label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                        className="w-40"
                      />
                      <span className="text-gray-500 text-sm">to</span>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                        className="w-40"
                      />
                      {(startDate || endDate) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setStartDate(''); setEndDate(''); setPage(1) }}
                          className="text-gray-500"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Results Summary */}
            {(searchQuery || kindFilter !== 'all' || authorFilter !== 'all' || startDate || endDate) && (
              <p className="text-sm text-gray-600">
                Found {filteredItems.length} special day{filteredItems.length !== 1 ? 's' : ''}
                {searchQuery && ` matching "${searchQuery}"`}
                {kindFilter !== 'all' && ` of type ${kindFilter}`}
                {authorFilter !== 'all' && ` by ${uniqueAuthors.find(a => a.id === authorFilter)?.name || 'selected author'}`}
              </p>
            )}
          </div>
        )}

        {!user && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            <strong>Viewing public special days.</strong> Sign in to add and manage your own special days.
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <strong>Error:</strong> {error}
            {error.includes('relation "special_days" does not exist') && (
              <div className="mt-2 text-xs">
                <p>The database table hasn't been set up yet. Please run the SQL setup script in your Supabase dashboard.</p>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            Loading special days...
          </div>
        )}

        {/* No Data Message */}
        {!loading && items.length === 0 && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm">
            <p>No special days found for {monthLabel}. {user ? 'Click on any date to add a special day!' : 'Sign in to add special days.'}</p>
          </div>
        )}

        {/* Calendar Grid */}
        {viewMode === 'calendar' && (
          <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Calendar Header */}
            <div className="grid grid-cols-7 border-b">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => (
                <div key={day} className="p-3 text-center text-sm font-medium text-gray-600 bg-gray-50">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar Days */}
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const dateKey = d.dateNum ? `${year}-${String(month + 1).padStart(2,'0')}-${String(d.dateNum).padStart(2,'0')}` : ""
                const isToday = d.dateNum ? formatDateKey(new Date()) === dateKey : false
                const mmdd = d.dateNum ? `${String(month + 1).padStart(2,'0')}-${String(d.dateNum).padStart(2,'0')}` : ""
                const recurringItems = d.dateNum ? (recurring.get(mmdd) || []) : []
                const has = d.dateNum ? (byDate.get(dateKey)?.[0] || recurringItems[0] || null) : null
                
                return (
                  <motion.div
                    key={d.key}
                    className={`min-h-24 border-r border-b last:border-r-0 p-2 ${
                      d.dateNum && user ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50'
                    } ${isToday ? 'bg-blue-50 border-blue-200' : ''}`}
                    onClick={() => d.dateNum && user && openEditor(dateKey)}
                    whileHover={d.dateNum && user ? { scale: 1.02 } : {}}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex flex-col h-full">
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                        {d.dateNum || ''}
                      </div>
                      
                      {(byDate.get(dateKey)?.[0]) && (
                        <div className="flex-1 space-y-1">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Compact type chip on mobile; full badge on >=sm */}
                            <div className={`inline-flex items-center justify-center w-5 h-5 rounded-full sm:hidden ${
                              byDate.get(dateKey)?.[0]?.kind === 'birthday' ? 'bg-pink-200' :
                              byDate.get(dateKey)?.[0]?.kind === 'anniversary' ? 'bg-red-200' :
                              'bg-gray-200'
                            }`}>
                              {byDate.get(dateKey)?.[0]?.kind === 'birthday' && <Gift className="w-3 h-3 text-pink-700" />}
                              {byDate.get(dateKey)?.[0]?.kind === 'anniversary' && <Heart className="w-3 h-3 text-red-700" />}
                              {byDate.get(dateKey)?.[0]?.kind === 'other' && <Star className="w-3 h-3 text-yellow-600" />}
                            </div>
                            <Badge 
                              variant="secondary" 
                              className={`hidden sm:inline-flex text-[10px] ${
                                byDate.get(dateKey)?.[0]?.kind === 'birthday' ? 'bg-pink-100 text-pink-800' :
                                byDate.get(dateKey)?.[0]?.kind === 'anniversary' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {byDate.get(dateKey)?.[0]?.kind || 'other'}
                            </Badge>
                          </div>
                          <div className="text-[11px] sm:text-xs text-gray-900 font-medium truncate">
                            {byDate.get(dateKey)?.[0]?.title || 'Special Day'}
                          </div>
                          {byDate.get(dateKey)?.[0]?.note && (
                            <div className="hidden sm:block text-xs text-gray-600 line-clamp-2">
                              {byDate.get(dateKey)?.[0]?.note}
                            </div>
                          )}
                          {byDate.get(dateKey)?.[0]?.user_name && (
                            <div className="hidden sm:block text-xs text-gray-500">
                              by {byDate.get(dateKey)?.[0]?.user_name}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {(!byDate.get(dateKey)?.[0] && recurringItems.length > 0 && !suppressedDates.has(dateKey)) && (
                        <div className="flex-1 space-y-1">
                          <div className="inline-flex items-center gap-1.5">
                            <div className="inline-flex items-center justify-center w-5 h-5 rounded-full sm:hidden bg-indigo-200">
                              <Star className="w-3 h-3 text-indigo-700" />
                            </div>
                            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                              <Star className="w-3 h-3 mr-1" />
                              yearly
                            </Badge>
                          </div>
                          <div className="text-[11px] sm:text-xs text-gray-900 font-medium truncate">
                            {recurringItems[0]?.title || 'Special Day'}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="h-28 sm:h-32 bg-gray-200 animate-pulse" />
                    <CardContent className="p-3 sm:p-4 space-y-2">
                      <div className="h-3 sm:h-4 bg-gray-200 rounded animate-pulse" />
                      <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                  <Calendar className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No special days found</h3>
                <p className="text-gray-500 mb-6">Try adjusting your filters or add a new special day</p>
                {user && (
                  <Button onClick={() => setDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Special Day
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {paginatedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Card 
                      className="group overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer bg-white border-0 shadow-md"
                      onClick={() => openEditor(item.date)}
                    >
                      {/* Header with type indicator */}
                      <div className="relative h-20 sm:h-24 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                          {item.kind === 'birthday' && <Gift className="w-5 h-5 text-pink-500" />}
                          {item.kind === 'anniversary' && <Heart className="w-5 h-5 text-red-500" />}
                          {item.kind === 'other' && <Star className="w-5 h-5 text-yellow-500" />}
                          <Badge variant="secondary" className="text-xs">
                            {item.kind || 'other'}
                          </Badge>
                        </div>
                        <div className="absolute bottom-3 right-3 text-xs text-gray-500">
                          {formatLocalDate(item.date)}
                        </div>
                      </div>
                      
                      {/* Content */}
                      <CardContent className="p-3 sm:p-4">
                        <div className="font-handwriting text-base sm:text-lg text-gray-800 mb-2 line-clamp-1">
                          {item.title || 'Untitled'}
                        </div>
                        <div className="font-handwriting text-sm text-gray-600 line-clamp-2 leading-relaxed">
                          {item.note || 'No description...'}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[11px] sm:text-xs text-gray-400">
                            {item.created_at ? formatLocalDate(item.created_at) : ''}
                          </div>
                          {item.user_name && (
                            <div className="text-xs text-gray-500">
                              by {item.user_name}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {filteredItems.length > 0 && (
              <div className="mt-8">
                <Separator className="mb-6" />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs sm:text-sm text-gray-600">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} special days
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = i + 1
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-pink-100 border border-pink-300" />
            <span>Birthday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
            <span>Anniversary</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300" />
            <span>Yearly recurring</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
            <span>Today</span>
          </div>
        </div>

        {/* Editor Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {editDate ? `Edit ${editDate}` : 'Add Special Day'}
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="sr-only">Create or edit a special day with a title, note, and type.</DialogDescription>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Anniversary, Birthday, ..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Write a memory or plan..."
                  rows={4}
                />
              </div>

              <div className="space-y-3">
                <Label>Type</Label>
                <RadioGroup value={kind} onValueChange={(value: 'birthday' | 'anniversary' | 'other') => setKind(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="other" />
                    <Label htmlFor="other" className="text-sm">Other</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="birthday" id="birthday" />
                    <Label htmlFor="birthday" className="text-sm flex items-center gap-1">
                      <Gift className="w-4 h-4" />
                      Birthday (repeats yearly)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="anniversary" id="anniversary" />
                    <Label htmlFor="anniversary" className="text-sm flex items-center gap-1">
                      <Heart className="w-4 h-4" />
                      Anniversary (repeats yearly)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="flex justify-between">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={remove}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Footer />
    </div>
  )
}


