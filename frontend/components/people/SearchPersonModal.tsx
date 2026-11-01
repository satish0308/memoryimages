'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Check, 
  Users, 
  Heart, 
  Calendar, 
  Loader2, 
  UserCheck, 
  CheckCircle2,
  AlertCircle,
  ChevronDown
} from 'lucide-react';

interface MatchedPhoto {
  media_id: number;
  face_id: number;
  filename: string;
  thumbnail_url: string;
  captured_at: string | null;
  similarity: number;
  confidence_pct: number;
  current_person_id: number | null;
  current_person_name: string | null;
  box_x: number;
  box_y: number;
  box_w: number;
  box_h: number;
}

interface SearchPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  faceId?: number | null;
  customBox?: {
    mediaId: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  } | null;
  onGrouped?: (person: any) => void;
}

const RELATIONSHIPS = [
  { value: 'Family', label: '👨‍👩‍👧 Family' },
  { value: 'Friends', label: '🤝 Friends' },
  { value: 'Partner', label: '❤️ Partner' },
  { value: 'Work', label: '💼 Work / Colleague' },
  { value: 'Self', label: '👤 Self' },
  { value: 'Other', label: '🏷️ Other / Acquaintance' }
];

export const SearchPersonModal: React.FC<SearchPersonModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
  faceId,
  customBox,
  onGrouped
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryCropUrl, setQueryCropUrl] = useState<string | null>(null);
  const [queryFaceId, setQueryFaceId] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchedPhoto[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [personName, setPersonName] = useState('');
  const [relationship, setRelationship] = useState('Friends');
  const [existingPeople, setExistingPeople] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(0.38);

  // Fetch existing people for auto-complete suggestions
  useEffect(() => {
    if (isOpen) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(`${apiUrl}/api/v1/people`, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setExistingPeople(data.map((p: any) => ({ id: p.id, name: p.name }))))
        .catch((e) => console.error(e));
    }
  }, [isOpen, apiUrl]);

  // Execute Face Search
  const runFaceSearch = useCallback(async () => {
    if (!faceId && !customBox) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const payload: any = { similarity_threshold: threshold };
    if (faceId) {
      payload.face_id = faceId;
    } else if (customBox) {
      payload.media_id = customBox.mediaId;
      payload.box_x = customBox.boxX;
      payload.box_y = customBox.boxY;
      payload.box_w = customBox.boxW;
      payload.box_h = customBox.boxH;
    }

    try {
      const res = await fetch(`${apiUrl}/api/v1/people/search-by-face`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to detect or search face');
      }

      const data = await res.json();
      setQueryCropUrl(data.query_crop_url);
      setQueryFaceId(data.query_face_id);
      setMatches(data.matches || []);

      // Pre-select all matched photos
      const ids = new Set<number>();
      (data.matches || []).forEach((m: MatchedPhoto) => ids.add(m.media_id));
      setSelectedMediaIds(ids);

      // Pre-fill suggested name & relationship if recognized
      if (data.suggested_name) {
        setPersonName(data.suggested_name);
      }
      if (data.suggested_relationship) {
        setRelationship(data.suggested_relationship);
      }
    } catch (err: any) {
      console.error('Face search error:', err);
      setError(err.message || 'Face search failed');
    } finally {
      setLoading(false);
    }
  }, [faceId, customBox, threshold, apiUrl]);

  useEffect(() => {
    if (isOpen) {
      runFaceSearch();
    } else {
      setMatches([]);
      setSelectedMediaIds(new Set());
      setPersonName('');
      setQueryCropUrl(null);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, runFaceSearch]);

  const toggleSelectMedia = (id: number) => {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const ids = new Set<number>();
    matches.forEach((m) => ids.add(m.media_id));
    setSelectedMediaIds(ids);
  };

  const deselectAll = () => {
    setSelectedMediaIds(new Set());
  };

  // 1-Click Group Matched Faces
  const handleGroupFaces = async () => {
    if (!personName.trim()) {
      setError('Please provide a name for this person.');
      return;
    }
    if (selectedMediaIds.size === 0) {
      setError('Please select at least 1 photo to group.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const token = typeof window !== 'undefined' ? localStorage.getItem('memorypics_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const selectedMatches = matches.filter((m) => selectedMediaIds.has(m.media_id));
      const faceIds = selectedMatches.map((m) => m.face_id);
      const mediaIds = Array.from(selectedMediaIds);

      const res = await fetch(`${apiUrl}/api/v1/people/group-matched-faces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          person_name: personName.trim(),
          relationship_type: relationship,
          face_ids: faceIds,
          media_ids: mediaIds,
          query_face_id: queryFaceId,
          set_as_cover: true
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to group person');
      }

      const result = await res.json();
      setSuccessMessage(`Successfully grouped ${result.grouped_count} photos for "${result.person.name}"!`);
      if (onGrouped) onGrouped(result.person);

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err.message || 'Failed to group photos');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Visual Face Search & Grouping</span>
                <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                  ArcFace AI
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Instantly finds all photos across your entire library containing this person.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Query Face Banner */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-800/80 to-indigo-950/40 border border-slate-700/80">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border-2 border-indigo-500/50 shadow-md flex-shrink-0">
                {queryCropUrl ? (
                  <img
                    src={queryCropUrl.startsWith('data:') ? queryCropUrl : `${apiUrl}${queryCropUrl}`}
                    alt="Query Face"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-indigo-400">
                    <Users className="w-6 h-6 animate-pulse" />
                  </div>
                )}
                <span className="absolute bottom-0 inset-x-0 bg-indigo-600 text-[9px] font-bold text-center text-white uppercase py-0.2">
                  Target Face
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {loading ? 'Analyzing facial biometric vectors...' : `Identified ${matches.length} matching photos`}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  512-dimensional normalized cosine similarity scan across library
                </p>
              </div>
            </div>

            {/* Strictness Sensitivity Slider */}
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="text-[11px] text-slate-400">Sensitivity:</span>
              <button
                type="button"
                onClick={() => setThreshold(0.42)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  threshold === 0.42 ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                }`}
              >
                Strict (High Precision)
              </button>
              <button
                type="button"
                onClick={() => setThreshold(0.35)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  threshold === 0.35 ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                }`}
              >
                Balanced
              </button>
            </div>
          </div>

          {/* Error / Success Alerts */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Scanning 512-d ArcFace embeddings across your library...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Users className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">No other photos matched this face</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try switching sensitivity to Balanced or draw a box around another clear, front-facing shot.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toolbar: Select All & Count */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Matched Photos ({selectedMediaIds.size} of {matches.length} selected)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={deselectAll}
                    className="text-slate-400 hover:text-slate-300 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Matched Photos Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-72 overflow-y-auto p-1">
                {matches.map((item) => {
                  const isSelected = selectedMediaIds.has(item.media_id);
                  const confidenceColor =
                    item.confidence_pct >= 90
                      ? 'bg-emerald-600 text-emerald-100 border-emerald-500'
                      : item.confidence_pct >= 75
                      ? 'bg-indigo-600 text-indigo-100 border-indigo-500'
                      : 'bg-amber-600 text-amber-100 border-amber-500';

                  return (
                    <div
                      key={item.media_id}
                      onClick={() => toggleSelectMedia(item.media_id)}
                      className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all group ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/40 scale-[0.99]'
                          : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={`${apiUrl}${item.thumbnail_url}`}
                        alt={item.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />

                      {/* Selection Checkbox */}
                      <div className="absolute top-2 left-2 z-10">
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'bg-black/60 border border-white/40 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>

                      {/* Similarity Badge */}
                      <div className="absolute top-2 right-2 z-10">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border shadow-sm ${confidenceColor}`}>
                          {item.confidence_pct}% Match
                        </span>
                      </div>

                      {/* Bottom Info Bar */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-white">
                        <p className="text-[10px] truncate font-medium">
                          {item.current_person_name ? item.current_person_name : item.filename}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grouping Setup Card */}
          {matches.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Group & Name Person Collection</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Person Name Input with Autocomplete */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Person Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      placeholder="e.g. Satish, Mom, Alex..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  {/* Autocomplete Quick Pills */}
                  {existingPeople.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500">Quick Pick:</span>
                      {existingPeople.slice(0, 5).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPersonName(p.name)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Relationship Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Relationship Category
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value} className="bg-slate-900 text-white">
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Used to organize and filter your People studio tab
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || loading || selectedMediaIds.size === 0 || !personName.trim()}
            onClick={handleGroupFaces}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Grouping Photos...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>Group {selectedMediaIds.size} Photos into Person</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
