'use client';

import { useState, useEffect } from 'react';
import { 
  Heart, 
  Trash2, 
  Calendar, 
  Tag, 
  Camera, 
  X, 
  Download, 
  RefreshCw, 
  FolderOpen,
  Sparkles,
  Search,
  Compass
} from 'lucide-react';

interface MediaItem {
  id: number;
  filename: string;
  category: string;
  width: number;
  height: number;
  captured_at: string;
  is_favorite: boolean;
  is_blurry: boolean;
  expires_at: string | null;
  thumbnail_url: string;
}

interface TimelineDay {
  date: string;
  count: number;
  items: MediaItem[];
}

interface EventStory {
  title: string;
  date: string;
  photo_count: number;
  cover_id: number;
  cover_thumbnail_url: string;
  media_ids: number[];
}

export default function PhotosPage() {
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [events, setEvents] = useState<EventStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MediaItem[] | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const categoryParam = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
      const res = await fetch(`${API_URL}/api/v1/media/timeline${categoryParam}`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/search/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  const executeSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      fetchTimeline();
      fetchEvents();
    } else {
      const timeout = setTimeout(() => {
        executeSearch(searchQuery);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [activeCategory, searchQuery]);

  const toggleFavorite = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}/favorite`, { method: 'PATCH' });
      if (res.ok) {
        setTimeline(prev =>
          prev.map(group => ({
            ...group,
            items: group.items.map(item =>
              item.id === id ? { ...item, is_favorite: !item.is_favorite } : item
            )
          }))
        );
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto(prev => prev ? { ...prev, is_favorite: !prev.is_favorite } : null);
        }
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  const deletePhoto = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Move photo to trash?')) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/media/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTimeline(prev =>
          prev.map(group => ({
            ...group,
            items: group.items.filter(item => item.id !== id)
          })).filter(group => group.items.length > 0)
        );
        if (searchResults) {
          setSearchResults(prev => prev ? prev.filter(i => i.id !== id) : null);
        }
        if (selectedPhoto && selectedPhoto.id === id) {
          setSelectedPhoto(null);
        }
      }
    } catch (err) {
      console.error('Error deleting photo:', err);
    }
  };

  const categories = [
    { id: 'all', label: 'All Photos' },
    { id: 'memory', label: '📸 Memories' },
    { id: 'screenshot', label: '📱 Screenshots' },
    { id: 'document_bill', label: '🧾 Bills & Docs' },
    { id: 'meme_junk', label: '💬 Memes / Clutter' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Search Input Bar */}
      <div className="relative max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by keywords, receipts text, camera model, or location..."
          className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none shadow-sm transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Events / Highlights Stories Carousel (Google Photos Style) */}
      {!searchResults && events.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Compass className="w-4 h-4 text-indigo-600" />
            Moments & Outings
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
            {events.map((ev, idx) => (
              <div
                key={idx}
                className="relative flex-shrink-0 w-44 h-60 rounded-2xl overflow-hidden cursor-pointer group shadow-sm hover:shadow-md transition"
              >
                <img
                  src={`${API_URL}${ev.cover_thumbnail_url}`}
                  alt={ev.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 flex flex-col justify-between text-white">
                  <span className="self-end bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-medium">
                    {ev.photo_count} photos
                  </span>
                  <div>
                    <h3 className="font-bold text-xs leading-snug">{ev.title}</h3>
                    <p className="text-[10px] text-slate-300 mt-0.5">{ev.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter Pills */}
      {!searchResults && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                  activeCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchTimeline}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 p-1.5 rounded-lg border border-slate-200 bg-white"
            title="Refresh Photos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Search Results Display */}
      {searchResults !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              Search Results ({searchResults.length} matching)
            </h2>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear Search
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
              No photos found matching "{searchQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {searchResults.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedPhoto(item)}
                  className="group relative aspect-square bg-slate-200 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition"
                >
                  <img
                    src={`${API_URL}${item.thumbnail_url}`}
                    alt={item.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition p-2 flex flex-col justify-end text-white text-[10px]">
                    <span className="truncate">{item.filename}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Regular Chronological Timeline */}
      {!searchResults && (
        <div className="space-y-8">
          {timeline.map(group => (
            <section key={group.date} className="space-y-3">
              <div className="flex items-center gap-2 text-slate-700 sticky top-0 bg-slate-50/90 backdrop-blur-sm py-2 z-10">
                <Calendar className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-sm">{group.date}</h2>
                <span className="text-xs text-slate-400 font-normal">({group.count} photos)</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {group.items.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPhoto(item)}
                    className="group relative aspect-square bg-slate-200 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition"
                  >
                    <img
                      src={`${API_URL}${item.thumbnail_url}`}
                      alt={item.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />

                    <div className="absolute top-2 left-2 flex gap-1">
                      {item.category === 'screenshot' && (
                        <span className="bg-blue-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
                          Screenshot
                        </span>
                      )}
                      {item.category === 'document_bill' && (
                        <span className="bg-emerald-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
                          Bill / Doc
                        </span>
                      )}
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                      <div className="flex justify-end">
                        <button
                          onClick={(e) => toggleFavorite(item.id, e)}
                          className="p-1.5 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition"
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-red-500 text-red-500' : ''}`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-white text-[10px]">
                        <span className="truncate max-w-[90px]">{item.filename}</span>
                        <button
                          onClick={(e) => deletePhoto(item.id, e)}
                          className="p-1 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col md:flex-row bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-20 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex-1 flex items-center justify-center bg-black p-4 min-h-[350px]">
              <img
                src={`${API_URL}/api/v1/media/${selectedPhoto.id}/thumbnail?size=1080`}
                alt={selectedPhoto.filename}
                className="max-h-[80vh] max-w-full object-contain rounded"
              />
            </div>

            <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-6 text-white flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base truncate">{selectedPhoto.filename}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(selectedPhoto.captured_at).toLocaleString()}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Category</span>
                    <span className="capitalize font-medium text-indigo-400">{selectedPhoto.category.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Dimensions</span>
                    <span>{selectedPhoto.width} × {selectedPhoto.height} px</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                <a
                  href={`${API_URL}/api/v1/media/${selectedPhoto.id}/download`}
                  download
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  onClick={() => toggleFavorite(selectedPhoto.id)}
                  className={`p-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition ${
                    selectedPhoto.is_favorite ? 'text-red-500' : 'text-slate-300'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${selectedPhoto.is_favorite ? 'fill-red-500' : ''}`} />
                </button>
                <button
                  onClick={() => deletePhoto(selectedPhoto.id)}
                  className="p-2 rounded-lg border border-slate-700 hover:bg-red-950/50 hover:text-red-400 text-slate-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
