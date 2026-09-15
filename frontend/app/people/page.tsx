'use client';

import { useState, useEffect } from 'react';
import { Users, Edit2, Check, UserPlus, Image as ImageIcon } from 'lucide-react';

interface PersonItem {
  id: number;
  name: string;
  photo_count: number;
  cover_thumbnail_url: string | null;
}

export default function PeoplePage() {
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchPeople = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/people`);
      if (res.ok) setPeople(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeople();
  }, []);

  const handleSaveName = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/people/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() })
      });
      if (res.ok) {
        setPeople(prev => prev.map(p => p.id === id ? { ...p, name: editName.trim() } : p));
        setEditingId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            People & Face Recognition
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Faces are automatically detected and clustered using vector embeddings. Click any person to label them.
          </p>
        </div>
      </div>

      {people.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <UserPlus className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-800 text-sm">No People Identified Yet</h3>
          <p className="text-xs text-slate-500">
            As photos are scanned into the library, faces will be automatically detected and grouped here.
          </p>
        </div>
      )}

      {/* People Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {people.map(person => (
          <div
            key={person.id}
            className="bg-white border border-slate-200 rounded-2xl p-4 text-center space-y-3 shadow-sm hover:shadow-md transition group"
          >
            {/* Avatar Circle */}
            <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden bg-slate-100 ring-4 ring-indigo-50">
              {person.cover_thumbnail_url ? (
                <img
                  src={`${API_URL}${person.cover_thumbnail_url}`}
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Users className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Name Editor */}
            <div>
              {editingId === person.id ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-xs font-semibold text-center border border-indigo-300 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveName(person.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setEditingId(person.id);
                    setEditName(person.name);
                  }}
                  className="group/name flex items-center justify-center gap-1 cursor-pointer"
                >
                  <h4 className="font-semibold text-xs text-slate-800 truncate">
                    {person.name}
                  </h4>
                  <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition" />
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">
                {person.photo_count} photo{person.photo_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
