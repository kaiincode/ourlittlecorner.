"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import SongPreview from "@/components/song-preview";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useAuth } from "@/app/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import RichTextEditor from "@/components/rich-text-editor";
import {
  contentHasFontStyling,
  htmlToDisplayHtml,
  sanitizeRichTextHtml,
  stripHtml,
} from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit,
  Trash2,
  Music,
  BookOpen,
  Calendar,
  X,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Grid,
  List,
  Eye,
  EyeOff,
} from "lucide-react";
import { formatLocalDate } from '@/lib/utils';

type Journal = {
  id: string;
  author: string | null;
  author_name?: string | null;
  title: string | null;
  content: string | null;
  cover_url: string | null;
  spotify_track_id: string | null;
  spotify_track_name: string | null;
  spotify_artists: string | null;
  spotify_image: string | null;
  spotify_preview_url: string | null;
  created_at?: string;
};

type TrackLite = {
  id: string;
  name: string;
  artists: string;
  image?: string;
  preview_url?: string | null;
};

type JournalTheme = {
  name: string;
  color: string; // stored in `cover_url` when no song is selected
  fontFamilyCss: string; // applied to note content
  fontFace: string; // used by the editor font dropdown
};

const NOTE_THEMES: JournalTheme[] = [
  {
    name: "Default Handwriting",
    color: "#f59e0b",
    fontFamilyCss: "var(--font-handwriting), 'Mynerve', cursive",
    fontFace: "Mynerve",
  },
  {
    name: "Elegant Serif",
    color: "#f43f5e",
    fontFamilyCss: "'Playfair Display', serif",
    fontFace: "Playfair Display",
  },
  {
    name: "Modern Sans",
    color: "#f97316",
    fontFamilyCss: "'Montserrat', sans-serif",
    fontFace: "Montserrat",
  },
  {
    name: "Romantic Script",
    color: "#0ea5e9",
    fontFamilyCss: "'Satisfy', cursive",
    fontFace: "Satisfy",
  },
  {
    name: "Bold Display",
    color: "#a855f7",
    fontFamilyCss: "'Pacifico', cursive",
    fontFace: "Pacifico",
  },
  {
    name: "Logic Mono",
    color: "#10b981",
    fontFamilyCss: "'JetBrains Mono', monospace",
    fontFace: "JetBrains Mono",
  },
];

function pickRandomTheme(): JournalTheme {
  return NOTE_THEMES[Math.floor(Math.random() * NOTE_THEMES.length)];
}

function getThemeByColor(color: string | null | undefined): JournalTheme | null {
  if (!color) return null;
  return NOTE_THEMES.find((t) => t.color.toLowerCase() === color.toLowerCase()) || null;
}

const DEFAULT_NOTE_THEME: JournalTheme =
  NOTE_THEMES.find((t) => t.fontFace === "Mynerve") ?? NOTE_THEMES[0]!;

function isHexColor(value: string | null | undefined) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export default function JournalsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "title" | "author" | "song">(
    "date"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "week" | "month" | "year"
  >("all");
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Get unique authors for filter dropdown
  const uniqueAuthors = useMemo(() => {
    const authors = items
      .map((item) => ({ id: item.author, name: item.author_name }))
      .filter(
        (author, index, self) =>
          author.id && self.findIndex((a) => a.id === author.id) === index
      );
    return authors;
  }, [items]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title?.toLowerCase().includes(query) ||
          item.content?.toLowerCase().includes(query) ||
          item.spotify_track_name?.toLowerCase().includes(query) ||
          item.spotify_artists?.toLowerCase().includes(query) ||
          item.author_name?.toLowerCase().includes(query)
      );
    }

    // Author filter
    if (authorFilter !== "all") {
      filtered = filtered.filter((item) => item.author === authorFilter);
    }

    // Date range filter
    if (startDate) {
      const sd = new Date(startDate).getTime();
      filtered = filtered.filter((item) =>
        item.created_at ? new Date(item.created_at).getTime() >= sd : false
      );
    }
    if (endDate) {
      const ed = new Date(endDate).getTime();
      filtered = filtered.filter((item) =>
        item.created_at ? new Date(item.created_at).getTime() <= ed : false
      );
    }

    // Date filter (quick filters)
    if (dateFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter((item) => {
        if (!item.created_at) return false;
        const itemDate = new Date(item.created_at);
        
        switch (dateFilter) {
          case "today":
            return itemDate >= today;
          case "week":
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return itemDate >= weekAgo;
          case "month":
            const monthAgo = new Date(
              today.getTime() - 30 * 24 * 60 * 60 * 1000
            );
            return itemDate >= monthAgo;
          case "year":
            const yearAgo = new Date(
              today.getTime() - 365 * 24 * 60 * 60 * 1000
            );
            return itemDate >= yearAgo;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "date":
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          comparison = dateA - dateB;
          break;
        case "title":
          const titleA = (a.title || "").toLowerCase();
          const titleB = (b.title || "").toLowerCase();
          comparison = titleA.localeCompare(titleB);
          break;
        case "author":
          const authorA = (a.author_name || "").toLowerCase();
          const authorB = (b.author_name || "").toLowerCase();
          comparison = authorA.localeCompare(authorB);
          break;
        case "song":
          const songA = (a.spotify_track_name || "").toLowerCase();
          const songB = (b.spotify_track_name || "").toLowerCase();
          comparison = songA.localeCompare(songB);
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [
    items,
    searchQuery,
    sortBy,
    sortOrder,
    dateFilter,
    startDate,
    endDate,
    authorFilter,
  ]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResults, setTrackResults] = useState<TrackLite[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackLite | null>(null);
  const [noteTheme, setNoteTheme] = useState<JournalTheme>(pickRandomTheme());

  const [viewOpen, setViewOpen] = useState<Journal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Open edit dialog when editId is set
  useEffect(() => {
    if (editId) {
      const journal = items.find((j) => j.id === editId);
      if (journal) {
        setTitle(journal.title || "");
        setContent(journal.content || "");
        if (journal.spotify_track_id) {
          setSelectedTrack({
            id: journal.spotify_track_id || "",
            name: journal.spotify_track_name || "",
            artists: journal.spotify_artists || "",
            image: journal.spotify_image || "",
            preview_url: journal.spotify_preview_url,
          });
        } else {
          setSelectedTrack(null);
        }
        setNoteTheme(getThemeByColor(journal.cover_url) ?? pickRandomTheme());
        setDialogOpen(true);
      }
    }
  }, [editId, items]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabase
          .from("journals")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        
        // Get unique author IDs
        const authorIds = [
          ...new Set(data?.map((j) => j.author).filter(Boolean) || []),
        ];
        
        // Fetch author names
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, username, name, full_name")
          .in("id", authorIds);
        
        // Create a map of author ID to display name (prioritize display_name, fallback to name)
        const authorMap = new Map(
          profiles?.map((p) => [
          p.id, 
            p.display_name ||
              p.name ||
              p.username ||
              p.full_name ||
              `User ${p.id.slice(0, 8)}`,
          ]) || []
        );
        
        const list = ((data || []) as any[])
          .map((item) => ({
          ...item,
            author_name: item.author
              ? authorMap.get(item.author) || `User ${item.author.slice(0, 8)}`
              : null,
          }))
          .filter(
            (j) =>
              (j.title && j.title.trim()) || (j.content && j.content.trim())
          ) as Journal[];
        setItems(list);
      } catch (e: any) {
        setError(e.message || "Failed to load journals");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const searchTrack = async () => {
    if (!trackQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(trackQuery.trim())}`
      );
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.detail || json.error || "Search failed");
      }

      const arr = (json.items || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        artists: t.artists,
        image: t.image,
        preview_url: t.preview_url,
      })) as TrackLite[];
      
      if (arr.length === 0) {
        setError("No songs found matching your search. Try a different query.");
      }
      
      setTrackResults(arr);
    } catch (e: any) {
      console.error("Spotify search error:", e);
      setError(e.message || "Failed to search Spotify. Please try again later.");
    } finally {
      setLoading(false);
    }
  };


  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setTitle("");
    setContent("");
    setTrackQuery("");
    setTrackResults([]);
    setSelectedTrack(null);
    setNoteTheme(pickRandomTheme());
  };

  const openCreateDialog = () => {
    setEditId(null);
    setTitle("");
    setContent("");
    setTrackQuery("");
    setTrackResults([]);
    setSelectedTrack(null);
    setNoteTheme(pickRandomTheme());
    setDialogOpen(true);
  };

  const saveJournal = async () => {
    try {
      const contentText = stripHtml(content || "");
      if (!(title.trim() || contentText))
        throw new Error("Please add a title or some content");

      const sanitizedContent = contentText ? sanitizeRichTextHtml(content || "") : null;
      const hasSong = !!selectedTrack?.id;

      const payload: Partial<Journal> = {
        title: title.trim() || null,
        content: sanitizedContent,
        cover_url: hasSong ? selectedTrack?.image || null : noteTheme.color,
        spotify_track_id: hasSong ? selectedTrack?.id || null : null,
        spotify_track_name: hasSong ? selectedTrack?.name || null : null,
        spotify_artists: hasSong ? selectedTrack?.artists || null : null,
        spotify_image: hasSong ? selectedTrack?.image || null : null,
        spotify_preview_url: hasSong ? selectedTrack?.preview_url || null : null,
      };
      if (editId) {
        const { data, error } = await supabase
          .from("journals")
          .update(payload)
          .eq("id", editId)
          .select("*")
          .single();
        if (error) throw error;
        setItems((prev) =>
          prev.map((j) => (j.id === editId ? (data as any) : j))
        );
      } else {
        const { data, error } = await supabase
          .from("journals")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        setItems((prev) => [data as any, ...prev]);
      }
      closeDialog();
    } catch (e: any) {
      setError(e.message || "Failed to save note");
    }
  };

  const deleteJournal = async (id: string) => {
    try {
      setDeleting(true);
      const { error } = await supabase.from("journals").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((x) => x.id !== id));
      setViewOpen(null);
    } catch (e: any) {
      setError(e.message || "Failed to delete note");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar currentPage="journals" />

      {/* Title Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-black">
            Journals
          </h1>
          <p className="mt-2 text-gray-600 text-base sm:text-lg font-light">
            Capture your thoughts with music
          </p>
        </motion.div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-12">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3 flex-wrap">
          <motion.div 
            className="text-xl sm:text-2xl font-medium text-gray-900"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Your Notes
          </motion.div>
          <Button
            onClick={openCreateDialog}
            className="gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            New Note
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search notes, songs, or artists..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10 w-full"
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
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                >
                  <Grid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>

              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Sort by:</span>
                <Select
                  value={sortBy}
                  onValueChange={(
                    value: "date" | "title" | "author" | "song"
                  ) => {
                    setSortBy(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="author">Author</SelectItem>
                    <SelectItem value="song">Song</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                    setPage(1);
                  }}
                  className="h-9 w-9 p-0"
                >
                  {sortOrder === "asc" ? (
                    <SortAsc className="w-4 h-4" />
                  ) : (
                    <SortDesc className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Page Size */}
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(parseInt(value));
                  setPage(1);
                }}
              >
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
                  <label className="text-sm font-medium text-gray-700">
                    Author:
                  </label>
                  <Select
                    value={authorFilter}
                    onValueChange={(value) => {
                      setAuthorFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Authors</SelectItem>
                      {uniqueAuthors.map((author) => (
                        <SelectItem key={author.id} value={author.id || ""}>
                          {author.name || `User ${author.id?.slice(0, 8)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Date Range:
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setPage(1);
                      }}
                      className="w-40"
                    />
                    <span className="text-gray-500 text-sm">to</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setPage(1);
                      }}
                      className="w-40"
                    />
                    {(startDate || endDate) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                          setPage(1);
                        }}
                        className="text-gray-500"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
        </div>

                {/* Quick Date Filters */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Quick Filters:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "All time" },
                      { value: "today", label: "Today" },
                      { value: "week", label: "This week" },
                      { value: "month", label: "This month" },
                      { value: "year", label: "This year" },
                    ].map((option) => (
                      <Button
                        key={option.value}
                        variant={
                          dateFilter === option.value ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setDateFilter(option.value as any);
                          setPage(1);
                        }}
                        className="text-xs"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Results Summary */}
          {(searchQuery ||
            dateFilter !== "all" ||
            authorFilter !== "all" ||
            startDate ||
            endDate) && (
            <p className="text-sm text-gray-600">
              Found {filteredItems.length} note
              {filteredItems.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
              {dateFilter !== "all" &&
                ` from ${
                  dateFilter === "today" ? "today" : `this ${dateFilter}`
                }`}
              {authorFilter !== "all" &&
                ` by ${
                  uniqueAuthors.find((a) => a.id === authorFilter)?.name ||
                  "selected author"
                }`}
            </p>
          )}
        </div>

        {/* Journal Grid/List - Song-themed cards */}
        {loading ? (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6"
                : "space-y-4"
            }
          >
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
        ) : paginatedItems.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <BookOpen className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? "No notes found" : "No notes yet"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery
                ? `No notes match "${searchQuery}"`
                : "Start capturing your thoughts with music"}
            </p>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Note
            </Button>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6"
                : "space-y-4"
            }
          >
            {paginatedItems.map((journal) => (
              <motion.div
                key={journal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card 
                  className={`group overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer bg-white border-0 shadow-md ${
                    viewMode === "list" ? "flex flex-row" : ""
                  }`}
                  onClick={() => setViewOpen(journal)}
                >
                  {/* Song-themed header */}
                  <div
                    className={`relative overflow-hidden ${
                      viewMode === "list"
                        ? "w-28 sm:w-32 h-24 flex-shrink-0"
                        : "h-28 sm:h-32"
                    }`}
                  >
                    {journal.spotify_image ? (
                      <div className="relative w-full h-full">
                        <img 
                          src={journal.spotify_image} 
                          alt={journal.spotify_track_name || "Song"} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                        <div className="absolute bottom-2 left-2 right-2">
                          <div className="text-white text-xs font-medium truncate">
                            {journal.spotify_track_name}
                          </div>
                          <div className="text-white/80 text-xs truncate">
                            {journal.spotify_artists}
                          </div>
                        </div>
                      </div>
                    ) : (
                      isHexColor(journal.cover_url) ? (
                        <div
                          className="relative w-full h-full flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${
                              journal.cover_url
                            }33 0%, rgba(255,255,255,0.25) 100%)`,
                          }}
                        >
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="text-white text-xs font-medium truncate">
                              {getThemeByColor(journal.cover_url)?.name ||
                                DEFAULT_NOTE_THEME.name}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="text-white text-xs font-medium truncate">
                              {DEFAULT_NOTE_THEME.name}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                    
                    {/* Edit/Delete buttons */}
                    {user && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 bg-white/90 hover:bg-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditId(journal.id);
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 bg-white/90 hover:bg-white text-red-500 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteJournal(journal.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Note preview */}
                  <CardContent
                    className={`p-3 sm:p-4 ${
                      viewMode === "list" ? "flex-1" : ""
                    }`}
                  >
                    <div className="font-handwriting text-lg sm:text-xl text-gray-800 mb-2 line-clamp-1">
                      {journal.title || "Untitled"}
                    </div>
                    {journal.content ? (
                      <div
                        className={`text-sm sm:text-base text-gray-600 leading-relaxed ${
                          viewMode === "list" ? "line-clamp-3" : "line-clamp-2"
                        }`}
                        style={{
                          fontFamily: contentHasFontStyling(journal.content)
                            ? undefined
                            : journal.spotify_track_id
                                ? "var(--font-handwriting), cursive"
                                : getThemeByColor(journal.cover_url)
                                    ?.fontFamilyCss ||
                                  DEFAULT_NOTE_THEME.fontFamilyCss,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: htmlToDisplayHtml(journal.content),
                        }}
                      />
                    ) : (
                      <div
                        className={`text-sm sm:text-base text-gray-600 leading-relaxed ${
                          viewMode === "list" ? "line-clamp-3" : "line-clamp-2"
                        }`}
                        style={{
                          fontFamily: undefined,
                        }}
                      >
                        No content...
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-[11px] sm:text-xs text-gray-400">
                        {journal.created_at
                          ? formatLocalDate(journal.created_at)
                          : ""}
                      </div>
                      {viewMode === "list" && (
                        <div className="text-xs text-gray-500">
                          by {journal.author_name || "anonymous"}
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
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filteredItems.length)} of{" "}
                {filteredItems.length} notes
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
                        variant={
                          currentPage === pageNum ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className="w-8 h-8 p-0"
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
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {editId ? "Edit Note" : "Create New Note"}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="sr-only">
            {editId
              ? "Edit your journal note with optional song details."
              : "Create a new journal note and optionally attach a song."}
          </DialogDescription>
          
          {/* Custom header with close button */}
          <div className="p-6 pb-0 flex flex-row items-center justify-between">
            <h2 className="text-2xl text-gray-800">
              {editId ? "Edit Note" : "Create New Note"}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeDialog}
              className="p-2 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Song Selection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Choose a song (optional)</span>
            </div>
              
              <div className="flex items-center gap-2">
                <Input
                  value={trackQuery}
                  onChange={(e) => setTrackQuery(e.target.value)}
                  placeholder="Search songs..."
                  className="flex-1"
                />
                <Button onClick={searchTrack} variant="outline">
                  Search
                </Button>
              </div>

              {selectedTrack && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <SongPreview
                    trackId={selectedTrack.id}
                    name={selectedTrack.name}
                    artists={selectedTrack.artists}
                    image={selectedTrack.image}
                    previewUrl={selectedTrack.preview_url}
                  />
                </div>
              )}

              {!selectedTrack && trackResults.length === 0 && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-lg border border-gray-200 shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, ${noteTheme.color} 0%, rgba(255,255,255,0.18) 100%)`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {noteTheme.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        Theme for this note
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!selectedTrack && trackResults.length > 0 && (
                <div className="max-h-48 overflow-auto space-y-2">
                  {trackResults.map((track) => (
                    <div 
                      key={track.id} 
                      onClick={() => setSelectedTrack(track)} 
                      className="cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <SongPreview 
                        trackId={track.id} 
                        name={track.name} 
                        artists={track.artists} 
                        image={track.image} 
                        previewUrl={track.preview_url} 
                />
              </div>
            ))}
          </div>
        )}
      </div>

            {/* Note content */}
            <div className="space-y-4">
              <Input
                    value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
                className="text-lg"
              />

              <RichTextEditor
                value={content}
                onChange={(nextHtml) => setContent(nextHtml)}
                placeholder="Write your thoughts..."
                baseFontFace={
                  selectedTrack
                    ? "Mynerve"
                    : noteTheme.fontFace || DEFAULT_NOTE_THEME.fontFace
                }
                baseFontFamilyCss={
                  selectedTrack
                    ? "var(--font-handwriting), cursive"
                    : noteTheme.fontFamilyCss || DEFAULT_NOTE_THEME.fontFamilyCss
                }
              />
              </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button 
                onClick={saveJournal} 
                disabled={!(title.trim() || stripHtml(content || "").trim())}
              >
                {editId ? "Save Changes" : "Create Note"}
              </Button>
              </div>
                </div>
        </DialogContent>
      </Dialog>

       {/* View Dialog - Enhanced Paper-style note */}
       <Dialog open={!!viewOpen} onOpenChange={() => setViewOpen(null)}>
         <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden p-0 bg-gradient-to-b from-amber-50/30 to-white [&>button]:hidden">
           <DialogHeader className="sr-only">
             <DialogTitle>{viewOpen?.title || 'Untitled Note'}</DialogTitle>
           </DialogHeader>
           
          {/* Enhanced song theme header (album art or random theme color) */}
          {(viewOpen?.spotify_image || isHexColor(viewOpen?.cover_url)) && (
             <div className="relative h-48 overflow-hidden">
               {/* Full album art background with overlay */}
               <div className="absolute inset-0">
                {viewOpen?.spotify_image ? (
                  <img
                    src={viewOpen.spotify_image}
                    alt={viewOpen.spotify_track_name || "Song"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(135deg, ${
                        isHexColor(viewOpen?.cover_url)
                          ? viewOpen?.cover_url
                          : "#f59e0b"
                      } 0%, rgba(255,255,255,0.18) 100%)`,
                    }}
                  />
                )}
                 <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-white" />
                      </div>

               {/* Action buttons - Top right corner */}
               <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
               {user?.id && viewOpen?.author === user.id && (
                 <>
                   <Button
                       variant="ghost"
                     size="sm"
                     onClick={() => {
                    setDialogOpen(true)
                    setEditId(viewOpen.id)
                    setTitle(viewOpen.title || '')
                    setContent(viewOpen.content || '')
                      setSelectedTrack(
                        viewOpen.spotify_track_id
                          ? {
                              id: viewOpen.spotify_track_id || "",
                              name: viewOpen.spotify_track_name || "",
                              artists: viewOpen.spotify_artists || "",
                              image: viewOpen.spotify_image || "",
                              preview_url:
                                viewOpen.spotify_preview_url || null,
                            }
                          : null
                      )
                      setNoteTheme(
                        getThemeByColor(viewOpen?.cover_url) ?? DEFAULT_NOTE_THEME
                      )
                       setViewOpen(null)
                     }}
                       className="h-9 w-9 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                   >
                       <Edit className="w-4 h-4 text-gray-700" />
                   </Button>
                   <Button
                       variant="ghost"
                     size="sm"
                     disabled={deleting}
                     onClick={() => deleteJournal(viewOpen.id)}
                       className="h-9 w-9 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                   >
                       <Trash2 className="w-4 h-4 text-red-600" />
                   </Button>
                </>
              )}
               
               <Button
                 variant="ghost"
                 size="sm"
                 onClick={() => setViewOpen(null)}
                   className="h-9 w-9 p-0 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
               >
                   <X className="w-4 h-4 text-gray-700" />
               </Button>
             </div>
               
               {/* Song info - bottom aligned with elegant card */}
               <div className="absolute bottom-0 left-0 right-0 p-6">
                 <div className="flex items-end gap-4">
                  <div className="relative">
                    {viewOpen?.spotify_image ? (
                      <img
                        src={viewOpen.spotify_image}
                        alt={viewOpen.spotify_track_name || "Song"}
                        className="w-24 h-24 rounded-lg object-cover shadow-2xl border-2 border-white/80"
                      />
                    ) : (
                      <div
                        className="w-24 h-24 rounded-lg shadow-2xl border-2 border-white/80"
                        style={{
                          background: `linear-gradient(135deg, ${
                            isHexColor(viewOpen?.cover_url)
                              ? viewOpen?.cover_url
                              : "#f59e0b"
                          } 0%, rgba(255,255,255,0.25) 100%)`,
                        }}
                      />
                    )}
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/20 to-transparent" />
                    {!viewOpen?.spotify_image && (
                      null
                    )}
                  </div>
                   <div className="flex-1 pb-1 min-w-0">
                    {viewOpen?.spotify_track_name ? (
                      <>
                        <div className="font-handwriting text-3xl text-white drop-shadow-lg truncate mb-1">
                          {viewOpen.spotify_track_name}
                        </div>
                        <div className="font-handwriting text-lg text-white/95 drop-shadow truncate">
                          {viewOpen.spotify_artists}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-handwriting text-3xl text-white drop-shadow-lg truncate mb-1">
                          {getThemeByColor(viewOpen?.cover_url)?.name ||
                            DEFAULT_NOTE_THEME.name}
                        </div>
                        <div className="font-handwriting text-lg text-white/95 drop-shadow truncate">
                          Your journal
                        </div>
                      </>
                    )}
                   </div>
                 </div>
               </div>
             </div>
           )}
           
          {/* Paper content - scrollable */}
          <div
            className="relative p-8 min-h-[400px] max-h-[60vh] overflow-y-auto"
            style={{
              backgroundImage: [
                "repeating-linear-gradient(transparent, transparent 27px, #d1d5db 27px, #d1d5db 28px)",
                "linear-gradient(to bottom, transparent, transparent)",
                "linear-gradient(to right, rgba(252, 165, 165, 0.6) 0, rgba(252, 165, 165, 0.6) 2px, transparent 2px)",
              ].join(", "),
              backgroundSize: "100% 28px, 100% 100%, 2px 100%",
              backgroundRepeat: "repeat, no-repeat, no-repeat",
              backgroundPosition: "0 0, 0 0, 5rem 0",
            }}
          >
            {/* Note title - much bigger */}
            <div className="relative mb-8 pl-24">
              <h1 className="font-handwriting text-5xl sm:text-6xl md:text-7xl text-gray-800 leading-relaxed">
                {viewOpen?.title || "Untitled Note"}
              </h1>
              <div className="mt-4 flex items-center gap-4 font-handwriting text-lg text-gray-500">
                <span>
                  {viewOpen?.created_at
                    ? formatLocalDate(viewOpen.created_at)
                    : ""}
                </span>
                <span>•</span>
                <span>by {viewOpen?.author_name || "anonymous"}</span>
            </div>
              </div>

            {/* Note content - much bigger text */}
            <div className="relative pl-24 pr-8">
              <div
                className="text-2xl sm:text-3xl md:text-4xl text-gray-800 leading-relaxed min-h-[300px]"
                style={{
                  fontFamily:
                    viewOpen?.content && contentHasFontStyling(viewOpen.content)
                      ? undefined
                      : viewOpen?.spotify_track_id
                          ? "var(--font-handwriting), cursive"
                          : getThemeByColor(viewOpen?.cover_url)
                                ?.fontFamilyCss || DEFAULT_NOTE_THEME.fontFamilyCss,
                }}
              >
                {viewOpen?.content ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: htmlToDisplayHtml(viewOpen.content),
                    }}
                  />
                ) : (
                  "No content available."
                )}
              </div>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
