import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Film,
  Flame,
  Globe,
  Grid,
  History,
  Home,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Tv,
  Unlock,
  WifiOff,
  X,
} from 'lucide-react';
import { ALL_CATEGORIES, INITIAL_FALLBACK_MOVIES } from './data/categories';
import type {
  CategoryOption,
  EpisodeItem,
  MovieCardItem,
  StreamSource,
  WatchProgressItem,
} from './types/cinema';
import { usePWAInstall } from './hooks/usePWAInstall';
import { MovieDetailModal } from './components/MovieDetailModal';
import { PWAInstallModal } from './components/PWAInstallModal';

const WATCHLIST_STORAGE_KEY = 'mlbd_iphone_watchlist_v1';
const CONTINUE_STORAGE_KEY = 'mlbd_iphone_continue_v1';
const SAFE_MODE_STORAGE_KEY = 'mlbd_iphone_safemode_v1';

export default function App() {
  const { isInstallable, isInstalled, isIOS, isOnline, install } = usePWAInstall();

  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState<'browse' | 'categories' | 'watchlist' | 'liveIframe'>('browse');
  const [currentCategory, setCurrentCategory] = useState<CategoryOption>(ALL_CATEGORIES[0]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [maxPage, setMaxPage] = useState<number>(520);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submittedSearch, setSubmittedSearch] = useState<string>('');
  const [audioFilter, setAudioFilter] = useState<'ALL' | 'BANGLA' | 'HINDI' | 'DUAL' | 'SUB'>('ALL');

  // Safe Mode (18+ Toggle)
  const [safeMode, setSafeMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SAFE_MODE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Catalog Items State
  const [items, setItems] = useState<MovieCardItem[]>(INITIAL_FALLBACK_MOVIES['/']);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Selected Movie Modal & PWA Modal
  const [selectedMovie, setSelectedMovie] = useState<MovieCardItem | null>(null);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Live Iframe Mode State
  const [iframePath, setIframePath] = useState<string>('/');
  const [iframeMode, setIframeMode] = useState<'cleanProxy' | 'directRaw'>('cleanProxy');
  const [iframeKey, setIframeKey] = useState<number>(1);

  // Watchlist & Continue Watching Persistence
  const [watchlist, setWatchlist] = useState<MovieCardItem[]>(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>(() => {
    try {
      const raw = localStorage.getItem(CONTINUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    } catch {
      // ignore
    }
  }, [watchlist]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(continueWatching));
    } catch {
      // ignore
    }
  }, [continueWatching]);

  useEffect(() => {
    try {
      localStorage.setItem(SAFE_MODE_STORAGE_KEY, safeMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [safeMode]);

  // Fetch Live Catalog from Express Server (with client CORS fallback)
  const fetchCatalog = useCallback(
    async (path: string, page: number, query: string, hideAdult: boolean) => {
      setLoadingCatalog(true);
      try {
        const params = new URLSearchParams({
          path,
          page: String(page),
          q: query,
          adult: hideAdult ? '0' : '1',
        });
        const res = await fetch(`/api/catalog?${params.toString()}`);
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          setItems(data.items);
          if (data.maxPage) setMaxPage(data.maxPage);
          setLoadingCatalog(false);
          return;
        }
      } catch {
        // Ignore and keep fallback
      } finally {
        setLoadingCatalog(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCatalog(currentCategory.path, currentPage, submittedSearch, safeMode);
  }, [currentCategory.path, currentPage, submittedSearch, safeMode, fetchCatalog]);

  const handleSelectCategory = (cat: CategoryOption) => {
    if (cat.isAdult && safeMode) {
      setSafeMode(false);
    }
    setCurrentCategory(cat);
    setCurrentPage(1);
    setSubmittedSearch('');
    setSearchQuery('');
    setAudioFilter('ALL');
    setActiveTab('browse');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    setSubmittedSearch(trimmed);
    setCurrentPage(1);
    setActiveTab('browse');
  };

  const handlePageChange = (newPage: number) => {
    const clamped = Math.max(1, Math.min(maxPage, newPage));
    setCurrentPage(clamped);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpPageInput, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      handlePageChange(parsed);
      setJumpPageInput('');
    }
  };

  const handleToggleWatchlist = useCallback((movie: MovieCardItem) => {
    setWatchlist((prev) => {
      const exists = prev.some((m) => m.path === movie.path || m.title === movie.title);
      if (exists) {
        return prev.filter((m) => m.path !== movie.path && m.title !== movie.title);
      }
      return [movie, ...prev];
    });
  }, []);

  const handleRecordWatchProgress = useCallback(
    (movie: MovieCardItem, episode?: EpisodeItem, source?: StreamSource, seconds?: number) => {
      setContinueWatching((prev) => {
        const filtered = prev.filter((p) => p.movie.path !== movie.path && p.movie.title !== movie.title);
        const entry: WatchProgressItem = {
          movie,
          episodeId: episode?.id,
          episodeLabel: episode?.label,
          quality: source?.quality,
          audio: source?.audio,
          updatedAt: Date.now(),
          progressSeconds: seconds || 0,
        };
        return [entry, ...filtered].slice(0, 16);
      });
    },
    []
  );

  const visibleCategories = useMemo(
    () => (safeMode ? ALL_CATEGORIES.filter((c) => !c.isAdult) : ALL_CATEGORIES),
    [safeMode]
  );

  const displayedItems = useMemo(() => {
    let list = safeMode ? items.filter((i) => !i.isAdult) : items;
    if (audioFilter !== 'ALL') {
      list = list.filter((i) => {
        const lang = (i.language + ' ' + i.title).toUpperCase();
        if (audioFilter === 'BANGLA') return lang.includes('BANGLA') || lang.includes('BENGALI');
        if (audioFilter === 'HINDI') return lang.includes('HINDI');
        if (audioFilter === 'DUAL') return lang.includes('DUAL') || lang.includes('MULTI');
        if (audioFilter === 'SUB') return lang.includes('SUB') || lang.includes('JAP') || lang.includes('KOR');
        return true;
      });
    }
    return list;
  }, [items, safeMode, audioFilter]);

  const spotlightItem = useMemo(() => {
    return displayedItems.find((i) => !i.isAdult && i.poster) || displayedItems[0] || INITIAL_FALLBACK_MOVIES['/'][0];
  }, [displayedItems]);

  const isMovieInWatchlist = useCallback(
    (movie: MovieCardItem | null) => {
      if (!movie) return false;
      return watchlist.some((m) => m.path === movie.path || m.title === movie.title);
    },
    [watchlist]
  );

  const openInAppIframe = (path: string) => {
    setIframePath(path || '/');
    setActiveTab('liveIframe');
  };

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col pb-20 md:pb-12">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline Mode — ক্যাশ করা মুভি তালিকা এবং আপনার ওয়াচলিস্ট দেখানো হচ্ছে</span>
        </div>
      )}

      {/* Strictly Compliant 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#090b10]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectCategory(ALL_CATEGORIES[0]);
            }}
            className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-display whitespace-nowrap shrink-0"
          >
            MOVIELINKBD
          </a>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => handleSelectCategory(ALL_CATEGORIES[0])}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'browse' && currentCategory.path === '/' ? 'text-[#f47521] font-semibold' : ''
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => handleSelectCategory(ALL_CATEGORIES[1])}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'browse' && currentCategory.path === '/anime' ? 'text-[#f47521] font-semibold' : ''
              }`}
            >
              Anime Zone
            </button>
            <button
              type="button"
              onClick={() => handleSelectCategory(ALL_CATEGORIES[3])}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'browse' && currentCategory.path === '/drama' ? 'text-[#f47521] font-semibold' : ''
              }`}
            >
              K-Drama
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'categories' ? 'text-[#f47521] font-semibold' : ''
              }`}
            >
              Categories
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('liveIframe')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'liveIframe' ? 'text-[#f47521] font-semibold' : ''
              }`}
            >
              Live Portal
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#f47521] hover:bg-[#ff8533] rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Install iPhone App
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Viewport Container (375px iPhone -> 1440px max-w-7xl Desktop) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 pt-5 space-y-6">
        {/* Top Search & Utility Toolbar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5">
          {/* Live Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Movie, Anime বা Series-এর English নাম লিখুন (যেমন: Bohurupi, One Piece, Mirzapur)..."
                className="w-full min-h-[46px] pl-11 pr-10 py-2.5 rounded-2xl bg-[#111621] border border-white/10 focus:border-[#f47521] text-sm text-white placeholder-slate-400 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSubmittedSearch('');
                  }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-[#1296b0] hover:bg-[#15b0ce] text-white font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0"
            >
              Search
            </button>
          </form>

          {/* Workspace Mode & Safe-Mode Controls */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'categories'
                  ? 'bg-[#1296b0] text-white border-[#1296b0]'
                  : 'bg-[#111621] text-slate-200 border-white/10 hover:border-white/25'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>সব ক্যাটাগরি (55+)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('watchlist')}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'watchlist'
                  ? 'bg-[#f47521] text-white border-[#f47521]'
                  : 'bg-[#111621] text-slate-200 border-white/10 hover:border-white/25'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>Watchlist ({watchlist.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSafeMode((s) => !s)}
              title="Toggle 18+ Adult Content Visibility"
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                safeMode
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                  : 'bg-[#111621] text-slate-300 border-white/10 hover:border-white/25'
              }`}
            >
              {safeMode ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>18+ Hidden (Safe)</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-amber-400" />
                  <span>All Content (18+ On)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Horizontal Quick Category Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {visibleCategories.slice(0, 18).map((cat) => {
            const isSelected = activeTab === 'browse' && currentCategory.path === cat.path && !submittedSearch;
            return (
              <button
                key={cat.path}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors border whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-[#f47521] text-white border-[#f47521]'
                    : 'bg-[#111621] text-slate-300 border-white/10 hover:border-[#f47521]/50 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* VIEW 1: ALL 55+ CATEGORIES DIRECTORY */}
        {activeTab === 'categories' && (
          <section className="rounded-3xl bg-[#111621] border border-white/10 p-5 sm:p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white font-display">
                  সব ক্যাটাগরি, ভাষা, জনরা এবং কালেকশন
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  MovieLinkBD-এর সব ৫২০+ পেজের কন্টেন্ট দেখতে যেকোনো ক্যাটাগরিতে ট্যাপ করুন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
              >
                Back to Movies
              </button>
            </div>

            {(
              [
                { group: 'zone', title: 'Featured Zones (জনপ্রিয় জোন)' },
                { group: 'language', title: 'Languages & Dubbed (ভাষা ও ডাবিং)' },
                { group: 'genre', title: 'Movie & Anime Genres (জনরা)' },
                { group: 'collection', title: 'Franchises & Curated Collections (কালেকশন)' },
              ] as const
            ).map((section) => {
              const groupItems = visibleCategories.filter((c) => c.group === section.group);
              if (groupItems.length === 0) return null;
              return (
                <div key={section.group} className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-200">{section.title}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                    {groupItems.map((cat) => (
                      <button
                        key={cat.path}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        className={`min-h-[52px] px-3.5 py-2.5 rounded-2xl text-left transition-colors border flex flex-col justify-center ${
                          currentCategory.path === cat.path
                            ? 'bg-[#f47521] text-white border-[#f47521]'
                            : 'bg-[#0c1018] text-slate-200 border-white/10 hover:border-[#1296b0]'
                        }`}
                      >
                        <span className="text-xs font-bold truncate">{cat.label}</span>
                        <span
                          className={`text-[11px] truncate mt-0.5 ${
                            currentCategory.path === cat.path ? 'text-white/90' : 'text-slate-400'
                          }`}
                        >
                          {cat.bnLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* VIEW 2: WATCHLIST & CONTINUE WATCHING */}
        {activeTab === 'watchlist' && (
          <section className="space-y-6">
            {/* Continue Watching Section */}
            <div className="rounded-3xl bg-[#111621] border border-white/10 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white font-display">
                    Continue Watching ({continueWatching.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    আপনি সর্বশেষ যে মুভি, অ্যানিমে বা এপিসোড দেখেছেন
                  </p>
                </div>
                {continueWatching.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setContinueWatching([])}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-950/60 text-xs font-semibold text-slate-300 hover:text-rose-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {continueWatching.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">
                  এখনো কোনো মুভি বা অ্যানিমে প্লে করা হয়নি। যেকোনো মুভিতে ট্যাপ করলেই এখানে অটো সেভ থাকবে।
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {continueWatching.map((entry) => (
                    <div
                      key={entry.movie.path}
                      onClick={() => setSelectedMovie(entry.movie)}
                      className="group rounded-2xl overflow-hidden bg-[#0c1018] border border-white/10 hover:border-[#f47521]/60 transition-colors cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#141b29] overflow-hidden">
                        <img
                          src={entry.movie.poster}
                          alt={entry.movie.title}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex items-end p-3">
                          <div className="w-full">
                            <div className="text-[11px] font-semibold text-[#f47521] truncate">
                              {entry.episodeLabel || 'Resume Stream'}
                              {entry.quality ? ` · ${entry.quality}p` : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                          {entry.movie.title}
                        </h3>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Watchlist Section */}
            <div className="rounded-3xl bg-[#111621] border border-white/10 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white font-display">
                    My Saved Watchlist ({watchlist.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    আপনার পছন্দের সেভ করা মুভি ও অ্যানিমে তালিকা
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
                >
                  Browse All Movies
                </button>
              </div>

              {watchlist.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <Bookmark className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm text-slate-300 font-medium">
                    আপনার ওয়াচলিস্টে এখনো কোনো মুভি বা অ্যানিমে যোগ করা হয়নি
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('browse')}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-[#f47521] text-white text-xs font-bold"
                  >
                    Explore Movies & Anime
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {watchlist.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => setSelectedMovie(item)}
                      className="group rounded-2xl overflow-hidden bg-[#0c1018] border border-white/10 hover:border-[#f47521]/60 transition-colors cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#141b29] overflow-hidden">
                        <img
                          src={item.poster}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="text-[11px] text-slate-400 truncate">
                          <span>{item.language}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{item.quality}</span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                          {item.title}
                        </h3>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 3: IN-APP LIVE PORTAL (IFRAME) MODE */}
        {activeTab === 'liveIframe' && (
          <section className="rounded-3xl bg-[#111621] border border-white/10 overflow-hidden flex flex-col">
            {/* Iframe Control Bar */}
            <div className="p-3.5 sm:px-5 bg-[#0c1018] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#1296b0] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  Live MovieLinkBD Portal View
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Switch between Cleaned iOS Proxy vs Direct Original Iframe */}
                <div className="flex items-center p-1 rounded-xl bg-[#141b29] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setIframeMode('cleanProxy')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      iframeMode === 'cleanProxy'
                        ? 'bg-[#1296b0] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ad-Free iPhone Proxy
                  </button>
                  <button
                    type="button"
                    onClick={() => setIframeMode('directRaw')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      iframeMode === 'directRaw'
                        ? 'bg-[#f47521] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Direct 4yer8f.movielinkbd.at
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIframeKey((k) => k + 1)}
                  aria-label="Reload Live Portal"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload</span>
                </button>

                <a
                  href={`https://4yer8f.movielinkbd.at${iframePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>New Tab</span>
                </a>
              </div>
            </div>

            {/* Full-Viewport Dynamic Height Iframe (No Double Scroll Trap) */}
            <div className="w-full h-[78dvh] bg-[#090b10]">
              {iframeMode === 'cleanProxy' ? (
                <iframe
                  key={`proxy-${iframeKey}-${iframePath}`}
                  src={`/api/proxy-page?clean=1&path=${encodeURIComponent(iframePath)}`}
                  title="MovieLinkBD Clean iPhone Portal"
                  className="w-full h-full border-0 bg-[#090b10]"
                  allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                />
              ) : (
                <iframe
                  key={`raw-${iframeKey}-${iframePath}`}
                  src={`https://4yer8f.movielinkbd.at${iframePath}`}
                  title="MovieLinkBD Direct Portal"
                  className="w-full h-full border-0 bg-[#1b222c]"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  referrerPolicy="no-referrer"
                  allow="fullscreen"
                />
              )}
            </div>
          </section>
        )}

        {/* VIEW 4: MAIN BROWSE VIEW (SPOTLIGHT + ZONES + 520-PAGE CATALOG) */}
        {activeTab === 'browse' && (
          <>
            {/* Featured Hero Spotlight (When on page 1 and not searching) */}
            {!submittedSearch && currentPage === 1 && spotlightItem && (
              <section className="relative rounded-3xl overflow-hidden bg-[#111621] border border-white/10">
                <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
                  <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between space-y-5 z-10">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-[#f47521] tracking-wide">
                        <span>Featured Spotlight</span>
                        <span aria-hidden="true"> · </span>
                        <span>{currentCategory.label}</span>
                        <span aria-hidden="true"> · </span>
                        <span>Ad-Free iPhone Stream</span>
                      </div>

                      <h1
                        className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight font-display"
                        style={{ textWrap: 'balance' }}
                      >
                        {spotlightItem.title}
                      </h1>

                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-300">
                        <span className="font-semibold text-emerald-400">{spotlightItem.language}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-cyan-300">{spotlightItem.quality}</span>
                        <span aria-hidden="true">·</span>
                        <span>{spotlightItem.typeBadge}</span>
                        {spotlightItem.episodePill && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300 font-medium">{spotlightItem.episodePill}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{spotlightItem.views} views</span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                        সরাসরি অ্যাপের ভেতরেই 1080p, 720p ও 480p কোয়ালিটিতে স্ট্রিম করুন, অথবা আইফোনে VLC / Infuse দিয়ে ১ ট্যাপে Dual Audio সহ দেখুন ও ডাউনলোড করুন।
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedMovie(spotlightItem)}
                        className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#f47521] hover:bg-[#ff8533] text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Watch & Download Now</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleWatchlist(spotlightItem)}
                        className="min-h-[48px] px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Bookmark className="w-4 h-4" />
                        <span>
                          {isMovieInWatchlist(spotlightItem) ? 'In Watchlist' : 'Save to Watchlist'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Right Visual Artwork Frame */}
                  <div className="lg:col-span-5 relative min-h-[240px] sm:min-h-[300px] bg-[#0c1018] overflow-hidden">
                    {spotlightItem.poster && !brokenImages[spotlightItem.id] ? (
                      <img
                        src={spotlightItem.poster}
                        alt={spotlightItem.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenImages((prev) => ({ ...prev, [spotlightItem.id]: true }))
                        }
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#141b29] to-[#090b10]">
                        <Film className="w-12 h-12 text-slate-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#111621] via-[#111621]/60 to-transparent" />
                  </div>
                </div>
              </section>
            )}

            {/* Quick Zone Cards (6 Signature Zones from User Specification) */}
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { cat: ALL_CATEGORIES[1], title: 'Anime Zone', sub: 'Dual Audio & Sub', accent: 'hover:border-[#f47521]' },
                { cat: ALL_CATEGORIES[2], title: 'Ongoing Series', sub: 'Daily New Episodes', accent: 'hover:border-amber-500' },
                { cat: ALL_CATEGORIES[3], title: 'K/J/C-Drama', sub: 'Korean & Chinese', accent: 'hover:border-cyan-400' },
                { cat: ALL_CATEGORIES[4], title: 'South Indian', sub: 'Hindi & Bangla Dub', accent: 'hover:border-emerald-400' },
                { cat: ALL_CATEGORIES[5], title: 'Animation', sub: 'Movies & Cartoons', accent: 'hover:border-purple-400' },
                {
                  cat: safeMode ? ALL_CATEGORIES[8] : ALL_CATEGORIES[6],
                  title: safeMode ? 'Bangla Dubbed' : '18+ Adult Zone',
                  sub: safeMode ? 'Popular Dubbed' : 'Uncensored Hub',
                  accent: 'hover:border-rose-500',
                },
              ].map((z) => {
                const active = currentCategory.path === z.cat.path && !submittedSearch;
                return (
                  <button
                    key={z.cat.path}
                    type="button"
                    onClick={() => handleSelectCategory(z.cat)}
                    className={`min-h-[60px] p-3.5 rounded-2xl text-left transition-colors border flex flex-col justify-between ${
                      active
                        ? 'bg-[#182030] border-[#f47521] text-white'
                        : `bg-[#111621] border-white/10 text-slate-200 ${z.accent}`
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold text-white truncate font-display">
                      {z.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-1">{z.sub}</div>
                  </button>
                );
              })}
            </section>

            {/* Continue Watching Strip (If user has history) */}
            {continueWatching.length > 0 && !submittedSearch && currentPage === 1 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-bold text-white font-display">
                    Continue Watching (আগের দেখা মুভি ও পর্ব)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('watchlist')}
                    className="text-xs text-[#f47521] hover:underline font-semibold"
                  >
                    View All ({continueWatching.length})
                  </button>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                  {continueWatching.slice(0, 8).map((entry) => (
                    <button
                      key={entry.movie.path}
                      type="button"
                      onClick={() => setSelectedMovie(entry.movie)}
                      className="w-64 shrink-0 rounded-2xl bg-[#111621] border border-white/10 hover:border-[#f47521]/60 p-2.5 flex items-center gap-3 text-left transition-colors"
                    >
                      <div className="w-12 h-16 rounded-xl overflow-hidden bg-[#0c1018] shrink-0">
                        <img
                          src={entry.movie.poster}
                          alt={entry.movie.title}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">
                          {entry.movie.title}
                        </div>
                        <div className="text-[11px] text-[#f47521] font-medium truncate mt-0.5">
                          {entry.episodeLabel || 'Movie'}
                          {entry.quality ? ` · ${entry.quality}p` : ''}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          Tap to resume stream
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Catalog Section Header + Audio Filter + Top Pagination */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
              <div>
                <h2 className="text-base sm:text-xl font-bold text-white font-display">
                  {submittedSearch
                    ? `Search Results: "${submittedSearch}"`
                    : `${currentCategory.label} — ${currentCategory.bnLabel}`}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                  <span>Showing {displayedItems.length} titles</span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    Page {currentPage} of {maxPage}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>Live MovieLinkBD Feed</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Interactive Client Audio Filter */}
                <div className="flex items-center p-1 rounded-xl bg-[#111621] border border-white/10">
                  {(
                    [
                      { id: 'ALL', label: 'All Audio' },
                      { id: 'BANGLA', label: 'Bangla' },
                      { id: 'HINDI', label: 'Hindi' },
                      { id: 'DUAL', label: 'Dual Audio' },
                      { id: 'SUB', label: 'Sub/Jap/Kor' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAudioFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        audioFilter === f.id
                          ? 'bg-[#f47521] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Compact Page Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1 || loadingCatalog}
                    onClick={() => handlePageChange(currentPage - 1)}
                    aria-label="Previous page"
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-[#111621] hover:bg-[#1a2233] disabled:opacity-40 border border-white/10 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2.5 text-xs font-bold font-mono tabular-nums text-white">
                    {currentPage} / {maxPage}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= maxPage || loadingCatalog}
                    onClick={() => handlePageChange(currentPage + 1)}
                    aria-label="Next page"
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-[#111621] hover:bg-[#1a2233] disabled:opacity-40 border border-white/10 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Loading Indicator Banner */}
            {loadingCatalog && (
              <div className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-[#111621] border border-white/10 text-xs text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin text-[#f47521]" />
                <span>লাইভ MovieLinkBD সার্ভার থেকে পেজ {currentPage}-এর কন্টেন্ট লোড হচ্ছে...</span>
              </div>
            )}

            {/* Movies & Anime Grid (2 cols on iPhone, up to 5 cols on 1440px Desktop) */}
            {displayedItems.length === 0 ? (
              <div className="rounded-3xl bg-[#111621] border border-white/10 p-10 text-center space-y-3">
                <Film className="w-10 h-10 text-slate-500 mx-auto" />
                <h3 className="text-base font-bold text-white">কোনো মুভি বা সিরিজ পাওয়া যায়নি</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  অন্য কোনো নাম দিয়ে সার্চ করুন অথবা Audio Filter "All Audio"-তে পরিবর্তন করুন।
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAudioFilter('ALL');
                    setSubmittedSearch('');
                    setSearchQuery('');
                  }}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#f47521] text-white text-xs font-bold"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
                {displayedItems.map((item) => {
                  const isSaved = isMovieInWatchlist(item);
                  const hasBrokenImg = brokenImages[item.id] || !item.poster;

                  return (
                    <article
                      key={item.path + item.title}
                      onClick={() => setSelectedMovie(item)}
                      className="group rounded-2xl overflow-hidden bg-[#111621] border border-white/10 hover:border-[#f47521]/60 transition-colors flex flex-col cursor-pointer"
                    >
                      {/* Poster Container with Resilient Fallback */}
                      <div className="relative aspect-[2/3] w-full bg-[#0c1018] overflow-hidden">
                        {!hasBrokenImg ? (
                          <img
                            src={item.poster}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-[#161f30] to-[#090b10]">
                            <Film className="w-8 h-8 text-[#f47521] mb-2 opacity-80" />
                            <span className="text-xs font-bold text-slate-200 line-clamp-3">
                              {item.title}
                            </span>
                          </div>
                        )}

                        {/* Subtle Gradient Scrim at Bottom of Poster */}
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

                        {/* Bookmark Action Button (44x44px Hitbox) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleWatchlist(item);
                          }}
                          aria-label={isSaved ? 'Remove from watchlist' : 'Add to watchlist'}
                          className={`absolute top-2 right-2 min-h-[40px] min-w-[40px] rounded-xl backdrop-blur-md flex items-center justify-center transition-colors ${
                            isSaved
                              ? 'bg-[#f47521] text-white'
                              : 'bg-black/60 text-white/80 hover:bg-black/80 hover:text-white'
                          }`}
                        >
                          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                        </button>

                        {/* Clean Bottom Overlay Text inside Poster */}
                        <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between text-[11px] font-semibold text-slate-200">
                          <span className="text-emerald-400 truncate max-w-[65%]">
                            {item.language}
                          </span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {item.quality}
                          </span>
                        </div>
                      </div>

                      {/* Card Body with Zero-Pill Clean Typography */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                        <div className="space-y-1">
                          {/* Clean Unboxed Metadata Line */}
                          <div className="text-[11px] text-slate-400 truncate">
                            <span>{item.typeBadge}</span>
                            {item.episodePill ? (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="text-cyan-400 font-medium">{item.episodePill}</span>
                              </>
                            ) : null}
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">{item.views}</span>
                          </div>

                          <h3 className="text-xs sm:text-sm font-bold text-white leading-snug line-clamp-2 group-hover:text-[#f47521] transition-colors">
                            {item.title}
                          </h3>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
                          <span>{item.timeAgo}</span>
                          <span className="text-[#f47521] font-semibold">Watch →</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Full 520-Page Bottom Pagination & Direct Page Jumper */}
            <div className="rounded-3xl bg-[#111621] border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0c1018] hover:bg-[#1a2233] disabled:opacity-40 border border-white/10 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                {Array.from({ length: 5 }, (_, idx) => {
                  const start = Math.max(1, Math.min(currentPage - 2, maxPage - 4));
                  const pageNum = start + idx;
                  if (pageNum < 1 || pageNum > maxPage) return null;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => handlePageChange(pageNum)}
                      className={`min-h-[42px] min-w-[42px] px-3 py-2 rounded-xl text-xs font-bold font-mono tabular-nums transition-colors border ${
                        currentPage === pageNum
                          ? 'bg-[#f47521] text-white border-[#f47521]'
                          : 'bg-[#0c1018] text-slate-300 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {currentPage + 2 < maxPage && (
                  <>
                    <span className="text-slate-500 px-1">...</span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(maxPage)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-[#0c1018] text-slate-300 border border-white/10 hover:border-white/30 text-xs font-bold font-mono tabular-nums"
                    >
                      {maxPage}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={currentPage >= maxPage}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0c1018] hover:bg-[#1a2233] disabled:opacity-40 border border-white/10 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Jump to Any Page (1 - 520) */}
              <form onSubmit={handleJumpPage} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={maxPage}
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  placeholder={`Page (1-${maxPage})`}
                  className="w-32 min-h-[42px] px-3 py-2 rounded-xl bg-[#0c1018] border border-white/10 text-xs text-white placeholder-slate-400 font-mono tabular-nums focus:outline-none focus:border-[#f47521]"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1296b0] hover:bg-[#15b0ce] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  Go to Page
                </button>
              </form>
            </div>
          </>
        )}
      </main>

      {/* Fixed iPhone Frosted Glass Bottom Navigation Bar (Mobile / Touch Ergonomics) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090b10]/90 backdrop-blur-md border-t border-white/10 pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => handleSelectCategory(ALL_CATEGORIES[0])}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'browse' && currentCategory.path === '/'
                ? 'text-[#f47521]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
              Home
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory(ALL_CATEGORIES[1])}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'browse' && currentCategory.path === '/anime'
                ? 'text-[#f47521]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
              Anime
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'categories' ? 'text-[#f47521]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
              Categories
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('watchlist')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'watchlist' ? 'text-[#f47521]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
              Watchlist
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('liveIframe')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'liveIframe' ? 'text-[#1296b0]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">
              Live Site
            </span>
          </button>
        </div>
      </nav>

      {/* Movie / Anime Stream & Download Modal */}
      <MovieDetailModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        isInWatchlist={isMovieInWatchlist(selectedMovie)}
        onToggleWatchlist={handleToggleWatchlist}
        onRecordWatchProgress={handleRecordWatchProgress}
        onOpenInAppIframe={openInAppIframe}
      />

      {/* iPhone PWA Install Guide Modal */}
      <PWAInstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        isInstallable={isInstallable}
        isInstalled={isInstalled}
        isIOS={isIOS}
        onTriggerInstall={install}
      />
    </div>
  );
}
