import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Headphones,
  Loader2,
  Play,
  Search,
  Smartphone,
  Tv,
  Volume2,
  X,
} from 'lucide-react';
import type {
  EpisodeItem,
  MovieCardItem,
  MovieDetailData,
  StreamSource,
} from '../types/cinema';

interface MovieDetailModalProps {
  movie: MovieCardItem | null;
  onClose: () => void;
  isInWatchlist: boolean;
  onToggleWatchlist: (movie: MovieCardItem) => void;
  onRecordWatchProgress: (
    movie: MovieCardItem,
    episode?: EpisodeItem,
    source?: StreamSource,
    seconds?: number
  ) => void;
  onOpenInAppIframe: (path: string) => void;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  movie,
  onClose,
  isInWatchlist,
  onToggleWatchlist,
  onRecordWatchProgress,
  onOpenInAppIframe,
}) => {
  const [detail, setDetail] = useState<MovieDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [epSearch, setEpSearch] = useState('');
  const [playerMode, setPlayerMode] = useState<'stream' | 'trailer'>('stream');
  const [videoError, setVideoError] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!movie) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedEpIdx(0);
    setSelectedSourceIdx(0);
    setEpSearch('');
    setPlayerMode('stream');
    setVideoError(false);

    const fetchDetail = async () => {
      try {
        const params = new URLSearchParams({
          path: movie.path || movie.url,
          title: movie.title,
        });
        const res = await fetch(`/api/details?${params.toString()}`);
        const data = await res.json();
        if (!cancelled) {
          if (data && data.ok && data.detail) {
            setDetail(data.detail);
            const firstEp = data.detail.episodes?.[0];
            const firstSrc = firstEp?.sources?.[0];
            onRecordWatchProgress(movie, firstEp, firstSrc, 0);
          } else {
            setError('এই মুভিটির বিস্তারিত তথ্য লোড করা যায়নি।');
          }
        }
      } catch {
        if (!cancelled) {
          setError('সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে।');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [movie]);

  const episodes = detail?.episodes || [];
  const activeEpisode: EpisodeItem | undefined = episodes[selectedEpIdx] || episodes[0];
  const sources = activeEpisode?.sources || [];
  const activeSource: StreamSource | undefined = sources[selectedSourceIdx] || sources[0];

  const filteredEpisodes = useMemo(() => {
    if (!epSearch.trim()) return episodes.map((ep, idx) => ({ ep, idx }));
    const q = epSearch.toLowerCase().trim();
    return episodes
      .map((ep, idx) => ({ ep, idx }))
      .filter(
        ({ ep }) =>
          ep.label.toLowerCase().includes(q) ||
          (ep.number !== null && String(ep.number).includes(q))
      );
  }, [episodes, epSearch]);

  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [selectedEpIdx, selectedSourceIdx, playbackSpeed]);

  if (!movie) return null;

  const handleSelectEpisode = (idx: number) => {
    setSelectedEpIdx(idx);
    setSelectedSourceIdx(0);
    setPlayerMode('stream');
    const ep = episodes[idx];
    const src = ep?.sources?.[0];
    onRecordWatchProgress(movie, ep, src, 0);
  };

  const handleSelectSource = (idx: number) => {
    setSelectedSourceIdx(idx);
    setPlayerMode('stream');
    const src = sources[idx];
    onRecordWatchProgress(movie, activeEpisode, src, 0);
  };

  const handleCopyStream = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // fallback
    }
  };

  const vlcUrl = activeSource?.url
    ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(activeSource.url)}`
    : '';
  const infuseUrl = activeSource?.url
    ? `infuse://x-callback-url/play?url=${encodeURIComponent(activeSource.url)}`
    : '';
  const outplayerUrl = activeSource?.url ? `outplayer://${activeSource.url}` : '';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#111621] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-[#0c1018]">
          <div className="w-10 h-1.5 rounded-full bg-slate-700" />
        </div>

        {/* Modal Top Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-[#0c1018] border-b border-white/10 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-white truncate font-display">
              {detail?.title || movie.title}
            </h2>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              <span>{movie.language}</span>
              <span aria-hidden="true"> · </span>
              <span>{movie.quality}</span>
              <span aria-hidden="true"> · </span>
              <span>{movie.typeBadge}</span>
              {detail?.releaseDate ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>{detail.releaseDate}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleWatchlist(movie)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
                isInWatchlist
                  ? 'bg-[#f47521] text-white border-[#f47521]'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
              }`}
            >
              <Bookmark className="w-4 h-4 fill-current" />
              <span>{isInWatchlist ? 'Saved' : 'Watchlist'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-rose-600/90 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* 1. Video / Trailer Player Stage */}
          <div className="rounded-2xl overflow-hidden bg-[#06080c] border border-white/10">
            {/* Player Mode Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0c1018] border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlayerMode('stream')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    playerMode === 'stream'
                      ? 'bg-[#f47521] text-white'
                      : 'text-slate-400 hover:text-white bg-white/5'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Direct Stream Player</span>
                </button>

                {detail?.youtubeTrailerId && (
                  <button
                    type="button"
                    onClick={() => setPlayerMode('trailer')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      playerMode === 'trailer'
                        ? 'bg-[#1296b0] text-white'
                        : 'text-slate-400 hover:text-white bg-white/5'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Official Trailer</span>
                  </button>
                )}
              </div>

              {/* Playback Speed Controls */}
              {playerMode === 'stream' && activeSource?.url && (
                <div className="flex items-center gap-1">
                  {[1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums transition-colors ${
                        playbackSpeed === spd
                          ? 'bg-white/20 text-white font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Video Stage */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center">
              {loading ? (
                <div className="flex flex-col items-center gap-3 text-slate-300 p-6 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#f47521]" />
                  <p className="text-xs sm:text-sm font-medium">
                    MovieLinkBD সার্ভার থেকে অ্যাড-ফ্রি স্ট্রিম ও ডাউনলোড লিংক ডিকোড হচ্ছে...
                  </p>
                </div>
              ) : playerMode === 'trailer' && detail?.youtubeTrailerId ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${detail.youtubeTrailerId}?autoplay=1&rel=0&playsinline=1`}
                  title={detail.title}
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : activeSource?.url && !videoError ? (
                <video
                  ref={videoRef}
                  key={activeSource.url}
                  src={activeSource.url}
                  poster={activeSource.screenshot || detail?.screenshots?.[0] || movie.poster}
                  controls
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(e) => {
                    const sec = Math.floor(e.currentTarget.currentTime);
                    if (sec > 5 && sec % 15 === 0) {
                      onRecordWatchProgress(movie, activeEpisode, activeSource, sec);
                    }
                  }}
                  onError={() => setVideoError(true)}
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-5 text-center bg-gradient-to-t from-black via-[#0c1018]/95 to-[#111621]/90">
                  <div className="max-w-md space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#f47521]/15 border border-[#f47521]/40 text-[#f47521] flex items-center justify-center mx-auto">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      {activeSource?.url
                        ? 'আইফোন (iOS Safari) MKV স্ট্রিম গাইড'
                        : 'সরাসরি পেজ অথবা ডাউনলোড অপশন ব্যবহার করুন'}
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activeSource?.url
                        ? 'এই ভিডিওটি High-Quality MKV (Dual Audio) ফরম্যাটে রয়েছে। আইফোনে ডাউনলোড ছাড়াই সরাসরি দেখতে নিচের "Play in VLC" বা "Infuse" বাটনে ১ ট্যাপ করুন, অথবা সরাসরি ডাউনলোড করুন।'
                        : 'নিচের ডাউনলোড বাটন অথবা ইন-অ্যাপ লাইভ ব্রাউজার দিয়ে সরাসরি স্ট্রিম করুন।'}
                    </p>
                    {activeSource?.url && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <a
                          href={vlcUrl}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#f47521] hover:bg-[#ff8533] text-white text-xs font-bold flex items-center gap-2 transition-colors"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>1-Tap Stream in VLC (iPhone)</span>
                        </a>
                        {detail?.youtubeTrailerId && (
                          <button
                            type="button"
                            onClick={() => setPlayerMode('trailer')}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                          >
                            <Film className="w-4 h-4" />
                            <span>Watch Trailer</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quality & Audio Language Switcher Bar */}
            {sources.length > 0 && (
              <div className="p-3.5 bg-[#0c1018] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Headphones className="w-4 h-4 text-[#f47521] shrink-0" />
                  <span className="font-semibold text-white">Server & Audio / Quality:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sources.map((src, idx) => {
                    const isSelected = idx === selectedSourceIdx;
                    return (
                      <button
                        key={src.id || idx}
                        type="button"
                        onClick={() => handleSelectSource(idx)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-[#f47521] text-white border-[#f47521]'
                            : 'bg-[#141b29] text-slate-300 border-white/10 hover:border-white/30'
                        }`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>
                          {src.quality}p · {src.audioLanguages.join(' + ') || src.audio}
                        </span>
                        <span className="text-[10px] opacity-80 uppercase">({src.type})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. iPhone Native App Streamers & 1-Click Direct Download Console */}
          {activeSource?.url && (
            <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    আইফোন ডিরেক্ট স্ট্রিম ও ১-ক্লিক ডাউনলোড (Ad-Free Decoded)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">
                    ফাইল: {activeSource.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyStream(activeSource.url)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Stream Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Stream URL</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                <a
                  href={activeSource.downloadUrl || activeSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1296b0] hover:bg-[#15b0ce] text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Direct Download ({activeSource.quality}p)</span>
                </a>

                <a
                  href={vlcUrl}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#f47521] hover:bg-[#ff8533] text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Tv className="w-4 h-4 shrink-0" />
                  <span>Play in VLC (iPhone)</span>
                </a>

                <a
                  href={infuseUrl}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1a2233] hover:bg-[#232d42] border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4 text-[#f47521] shrink-0" />
                  <span>Play in Infuse (iOS)</span>
                </a>

                <a
                  href={outplayerUrl}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1a2233] hover:bg-[#232d42] border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Play in Outplayer</span>
                </a>
              </div>
            </div>
          )}

          {/* 3. Episodes Selector (For Series, Anime & K-Drama) */}
          {episodes.length > 1 && (
            <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    সব এপিসোড তালিকা ({episodes.length} Episodes Available)
                  </h3>
                  <p className="text-xs text-slate-400">
                    যেকোনো এপিসোডে ট্যাপ করে সরাসরি স্ট্রিম বা ডাউনলোড করুন
                  </p>
                </div>

                {episodes.length > 8 && (
                  <div className="relative w-44">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={epSearch}
                      onChange={(e) => setEpSearch(e.target.value)}
                      placeholder="এপিসোড খুঁজুন..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#141b29] border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#f47521]"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
                {filteredEpisodes.map(({ ep, idx }) => {
                  const isActive = idx === selectedEpIdx;
                  return (
                    <button
                      key={ep.id || idx}
                      type="button"
                      onClick={() => handleSelectEpisode(idx)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-left truncate transition-colors border ${
                        isActive
                          ? 'bg-[#f47521] text-white border-[#f47521]'
                          : 'bg-[#141b29] text-slate-200 border-white/10 hover:border-[#f47521]/50'
                      }`}
                    >
                      {ep.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Additional Decoded Download Gateway Buttons (480p / 720p / 1080p) */}
          {detail?.downloadButtons && detail.downloadButtons.length > 0 && (
            <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">
                অল্টারনেটিভ ডাউনলোড সার্ভার (All Resolutions)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {detail.downloadButtons.map((btn, idx) => (
                  <a
                    key={idx}
                    href={btn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#141b29] hover:bg-[#1c2638] border border-white/10 text-xs font-semibold text-white flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">{btn.label}</span>
                    <Download className="w-4 h-4 text-[#1296b0] shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 5. Movie Info, Storyline & Action Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-4">
              {detail?.storyline && (
                <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-2">
                  <h3 className="text-sm font-bold text-white">স্টোরিলাইন (Storyline)</h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {detail.storyline}
                  </p>
                </div>
              )}

              {/* Screenshots Gallery */}
              {detail?.screenshots && detail.screenshots.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-white">স্ক্রিনশট (HD Screenshots)</h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {detail.screenshots.slice(0, 4).map((shot, idx) => (
                      <div
                        key={idx}
                        className="aspect-video rounded-xl overflow-hidden bg-[#0c1018] border border-white/10"
                      >
                        <img
                          src={shot}
                          alt={`${movie.title} screenshot ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Metadata & Original Page Bridge */}
            <div className="rounded-2xl bg-[#0c1018] border border-white/10 p-4 space-y-3 h-fit">
              <h3 className="text-sm font-bold text-white">তথ্য ও সার্ভার অপশন</h3>
              <div className="space-y-2 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Genre: </span>
                  <span className="text-white font-medium">{detail?.genre || 'Cinema'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Audio: </span>
                  <span className="text-white font-medium">{detail?.language || movie.language}</span>
                </div>
                <div>
                  <span className="text-slate-400">Resolution: </span>
                  <span className="text-white font-medium">{detail?.resolution || '1080p · 720p · 480p'}</span>
                </div>
                {detail?.communityScore && (
                  <div>
                    <span className="text-slate-400">Community Score: </span>
                    <span className="text-emerald-400 font-semibold font-mono tabular-nums">
                      {detail.communityScore.recommendedPercent}% ({detail.communityScore.totalVotes} votes)
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 space-y-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInAppIframe(movie.path || '/');
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <Tv className="w-4 h-4 text-[#1296b0]" />
                  <span>Open in In-App Live Portal</span>
                </button>

                <a
                  href={detail?.url || movie.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Original MovieLinkBD Page</span>
                </a>
              </div>
            </div>
          </div>

          {/* 6. Cast Members */}
          {detail?.cast && detail.cast.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-white">অভিনয়ে (Cast)</h3>
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                {detail.cast.map((actor, idx) => (
                  <div
                    key={idx}
                    className="w-28 shrink-0 rounded-xl bg-[#0c1018] border border-white/10 p-2.5 text-center"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden mx-auto bg-[#1a2233] mb-2">
                      <img
                        src={actor.photo}
                        alt={actor.name}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-xs font-semibold text-white truncate">{actor.name}</div>
                    {actor.role && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{actor.role}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-950/50 border border-rose-500/30 p-3 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
