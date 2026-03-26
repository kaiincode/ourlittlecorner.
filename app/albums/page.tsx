"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { supabase } from "@/lib/supabase/supabaseClient"
import { useAuth } from "@/app/contexts/AuthContext"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Search, Calendar, Grid, List, Folder, Plus, FolderPlus, GripVertical, Trash2, Download } from "lucide-react"
import { formatLocalDate } from '@/lib/utils'
import { ScrollArea } from "@/components/ui/scroll-area"

type FilterPreset = 'none' | 'vintage' | 'warm' | 'cool' | 'bright' | 'soft' | 'dramatic' | 'blackwhite'

type FrameData = {
  type: string
  frameColor: string
  frameWidth: number
  filterPreset?: FilterPreset
  imageFilters?: {
    brightness: number
    contrast: number
    saturation: number
    sepia: number
    blur: number
  }
}

const FILTER_PRESETS: { value: FilterPreset; label: string; filter: string }[] = [
  { value: 'none', label: 'None', filter: 'none' },
  { value: 'vintage', label: 'Vintage', filter: 'sepia(30%) contrast(110%) brightness(95%)' },
  { value: 'warm', label: 'Warm', filter: 'sepia(20%) saturate(120%) brightness(105%)' },
  { value: 'cool', label: 'Cool', filter: 'hue-rotate(180deg) saturate(80%) brightness(100%)' },
  { value: 'bright', label: 'Bright', filter: 'brightness(120%) contrast(110%) saturate(110%)' },
  { value: 'soft', label: 'Soft', filter: 'brightness(105%) contrast(95%) saturate(90%) blur(0.5px)' },
  { value: 'dramatic', label: 'Dramatic', filter: 'contrast(130%) brightness(90%) saturate(120%)' },
  { value: 'blackwhite', label: 'B&W', filter: 'grayscale(100%) contrast(110%)' },
]

type GalleryItem = {
  id: string
  name: string
  folder: string
  url: string
  path?: string
  owner?: string | null
  created_at?: string
  frame_data?: FrameData | null
}

export default function AlbumsPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState<string>("root")
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [title, setTitle] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogFolder, setDialogFolder] = useState("")
  const [dialogTitle, setDialogTitle] = useState("")
  const [dialogFile, setDialogFile] = useState<File | null>(null)
  const [openFolderFor, setOpenFolderFor] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [draggedItem, setDraggedItem] = useState<GalleryItem | null>(null)

  // Create new folder
  const createFolder = async () => {
    if (!newFolderName.trim()) return
    
    try {
      const { error } = await supabase
        .from('gallery_items')
        .insert({
          name: newFolderName.trim(),
          folder: newFolderName.trim(),
          path: `folders/${newFolderName.trim()}`,
          bucket: 'gallery'
        })
      
      if (error) throw error
      
      setNewFolderName("")
      setShowCreateFolder(false)
      // Refresh the folders list
      const { data: updatedData } = await supabase
        .from('gallery_items')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (updatedData) {
        const mapped: GalleryItem[] = updatedData.map((row: any) => ({
          id: row.id,
          name: row.title || (row.path?.split('/')?.pop() || 'image'),
          folder: row.folder || 'root',
          url: row.url,
          path: row.path,
          owner: row.owner || null,
          created_at: row.created_at,
        }))
        setItems(mapped)
        const setF = new Set<string>(["root", ...mapped.map((m) => m.folder || 'root')])
        setFolders(Array.from(setF))
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to create folder')
    }
  }

  // Move item to folder
  const moveToFolder = async (item: GalleryItem, targetFolder: string) => {
    try {
      const { error } = await supabase
        .from('gallery_items')
        .update({ folder: targetFolder })
        .eq('id', item.id)
      
      if (error) throw error
      
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, folder: targetFolder } : i
      ))
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to move item')
    }
  }

  // Handle drag and drop
  const handleDragStart = (e: React.DragEvent, item: GalleryItem) => {
    setDraggedItem(item)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    if (draggedItem && draggedItem.folder !== targetFolder) {
      moveToFolder(draggedItem, targetFolder)
    }
    setDraggedItem(null)
  }

  const filteredItems = useMemo(() => {
    let base = activeFolder === "root" ? items : items.filter((i) => i.folder === activeFolder)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      base = base.filter(i => (i.name || '').toLowerCase().includes(q))
    }
    if (startDate) {
      const sd = new Date(startDate).getTime()
      base = base.filter(i => i.created_at ? new Date(i.created_at).getTime() >= sd : true)
    }
    if (endDate) {
      const ed = new Date(endDate).getTime()
      base = base.filter(i => i.created_at ? new Date(i.created_at).getTime() <= ed : true)
    }
    return base
  }, [activeFolder, items, query, startDate, endDate])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setErrorMessage("")
      try {
        const { data, error } = await supabase
          .from('gallery_items')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error
        let mapped: GalleryItem[] = (data || []).map((row: any) => ({
          id: row.id,
          name: row.title || (row.path?.split('/')?.pop() || 'image'),
          folder: row.folder || 'root',
          url: row.url,
          path: row.path,
          owner: row.owner || null,
          created_at: row.created_at,
          frame_data: row.frame_data || null,
        }))
        // Validate existence in storage and purge stale metadata
        const checks = await Promise.allSettled(
          mapped.map(async (m) => {
            const res = await supabase.storage.from('gallery').createSignedUrl(m.path || '', 1)
            if ((res as any).error) {
              // Delete stale metadata
              await supabase.from('gallery_items').delete().eq('id', m.id)
              return null
            }
            return m
          })
        )
        mapped = checks
          .map((c) => (c.status === 'fulfilled' ? c.value : null))
          .filter(Boolean) as GalleryItem[]
        setItems(mapped)
        const set = new Set<string>(["root", ...mapped.map((m) => m.folder || 'root')])
        setFolders(Array.from(set))
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to load gallery")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const deleteImage = async (item: GalleryItem) => {
    try {
      setDeletingId(item.id)
      const path = item.path || ""
      if (path) {
        await supabase.storage.from('gallery').remove([path])
      }
      await supabase.from('gallery_items').delete().eq('id', item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      if (selectedImage && selectedImage.id === item.id) {
        setSelectedImage(null)
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to delete image')
    } finally {
      setDeletingId(null)
    }
  }

  const onUpload = async (file: File, folderInput?: string, titleInput?: string) => {
    if (!file) return
    setIsUploading(true)
    setErrorMessage("")
    try {
      const folder = (folderInput ?? dialogFolder)?.trim() || "root"
      const path = `${folder}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from("gallery").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type })
      if (upErr) throw upErr
      // Save metadata row
      const publicUrl = supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl
      await supabase.from('gallery_items').upsert({ path, title: (titleInput ?? dialogTitle) || file.name, folder, owner: user?.id ?? null, url: publicUrl }, { onConflict: 'path' })
      // Refresh listing from metadata
      const { data, error } = await supabase
        .from('gallery_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
        const mapped: GalleryItem[] = (data || []).map((row: any) => ({
          id: row.id,
          name: row.title || (row.path?.split('/')?.pop() || 'image'),
          folder: row.folder || 'root',
          url: row.url,
          path: row.path,
          owner: row.owner || null,
          created_at: row.created_at,
          frame_data: row.frame_data || null,
        }))
      setItems(mapped)
      const setF = new Set<string>(["root", ...mapped.map((m) => m.folder || 'root')])
      setFolders(Array.from(setF))
      setActiveFolder(folder === "root" ? "root" : folder)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to upload")
    } finally {
      setIsUploading(false)
      setDialogFile(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar currentPage="albums" />

      {/* Title Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-black">
            Our Albums
          </h1>
          <p className="mt-2 text-gray-600 text-base sm:text-lg font-light">
            Cherished moments captured in time
          </p>
        </motion.div>
      </div>

      {/* Controls Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="space-y-6">
          {/* Folders: horizontal chips with scroll */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-medium text-gray-900">Folders</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateFolder(true)}
                className="gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </Button>
            </div>

            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 py-2 pr-2">
                {folders.map((folder) => (
                  <Button
                    key={folder}
                    variant={activeFolder === folder ? 'default' : 'secondary'}
                    size="sm"
                    className="text-xs flex items-center gap-1"
                    onClick={() => setActiveFolder(folder)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, folder)}
                  >
                    <Folder className="w-3 h-3" />
                    {folder}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Create Folder Dialog */}
          {showCreateFolder && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-lg font-medium mb-4">Create New Folder</h3>
                <Input
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="mb-4"
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowCreateFolder(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createFolder} disabled={!newFolderName.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search albums..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                  className="pl-10 w-full md:w-64"
                />
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Calendar className="w-4 h-4 text-gray-400" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                  className="w-full md:w-40"
                />
                <span className="text-gray-500 text-sm">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                  className="w-full md:w-40"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(parseInt(value)); setPage(1) }}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[12, 24, 36, 48].map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 w-full md:w-auto">
                    <Plus className="w-4 h-4" />
                    Upload
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Gallery Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-12">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="w-full h-40 sm:h-48" />
                <CardContent className="p-3 sm:p-4 space-y-2">
                  <Skeleton className="h-3 sm:h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <Grid className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No albums yet</h3>
            <p className="text-gray-500 mb-6">Start building your collection by uploading your first photo</p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Upload First Photo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {paginatedItems.map((item) => (
              <motion.div
                key={item.id || item.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card 
                  className="group overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer"
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                >
                  <div 
                    className="relative aspect-square overflow-hidden"
                    onClick={() => setSelectedImage(item)}
                  >
                    <img 
                      src={item.url} 
                      alt={item.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button
                        className="text-white bg-black/50 rounded p-1 hover:bg-black/70"
                        title="Drag to move"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <button
                        className="text-white bg-blue-600/70 rounded p-1 hover:bg-blue-600"
                        title="Download image"
                        onClick={(e) => { 
                          e.stopPropagation()
                          const link = document.createElement('a')
                          link.href = item.url
                          link.download = item.name || 'image'
                          link.click()
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        className="text-white bg-red-600/70 rounded p-1 hover:bg-red-600 disabled:opacity-50"
                        title="Delete image"
                        disabled={deletingId === item.id}
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete this image?')) deleteImage(item) }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <CardContent className="p-3 sm:p-4">
                    <div className="space-y-2">
                      <h3 className="font-medium text-gray-900 truncate text-sm sm:text-base">{item.name}</h3>
                      <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
                        <span>{item.created_at ? formatLocalDate(item.created_at) : ''}</span>
                        <Badge variant="secondary" className="text-xs">
                          {item.folder}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredItems.length > 0 && (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-8">
          <Separator className="mb-6" />
          <div className="flex items-center justify-between">
            <div className="text-xs sm:text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} items
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
                  const pageNum = i + 1;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
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

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload to Albums
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="sr-only">Upload an image to your albums and optionally choose or create a folder.</DialogDescription>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Folder</label>
              <div className="flex items-center gap-2">
                <Select value={dialogFolder || 'root'} onValueChange={setDialogFolder}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select folder" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(['root', ...folders.filter(f => f !== 'root')])].map((folder) => (
                      <SelectItem key={folder} value={folder}>
                        {folder}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-gray-500">or</span>
                <Input
                  value={dialogFolder}
                  onChange={(e) => setDialogFolder(e.target.value)}
                  placeholder="Create new"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={dialogTitle}
                onChange={(e) => setDialogTitle(e.target.value)}
                placeholder="Image title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Image</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="file-upload"
                  onChange={(e) => setDialogFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {dialogFile ? dialogFile.name : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
                </label>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!dialogFile || isUploading}
              onClick={async () => {
                if (!dialogFile) return
                await onUpload(dialogFile, dialogFolder, dialogTitle)
                setDialogOpen(false)
                setDialogFile(null)
                setDialogFolder("")
                setDialogTitle("")
              }}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Viewer Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
          >
            {/* Blurred Dark Background */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            
            {/* Image Container */}
            <motion.div
              className="relative w-[92vw] sm:w-auto max-w-7xl mx-4 flex items-center justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxHeight: '90vh',
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2 backdrop-blur-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Image */}
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />

              {/* Image Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 rounded-b-lg">
                <h3 className="text-white text-xl font-medium mb-1">{selectedImage.name}</h3>
                <div className="flex items-center justify-between text-white/80 text-sm">
                  <span>{selectedImage.created_at ? formatLocalDate(selectedImage.created_at) : ''}</span>
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    {selectedImage.folder}
                  </Badge>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white/20 text-white border-white/30 hover:bg-white/30"
                    onClick={(e) => {
                      e.stopPropagation()
                      const link = document.createElement('a')
                      link.href = selectedImage.url
                      link.download = selectedImage.name || 'image'
                      link.click()
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={!!deletingId}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (selectedImage) deleteImage(selectedImage)
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  )
}


