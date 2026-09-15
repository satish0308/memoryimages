'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

interface CategoryFilterBarProps {
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

const CATEGORIES = [
  { id: 'all', label: 'All Photos' },
  { id: 'memory', label: '📸 Memories' },
  { id: 'screenshot', label: '📱 Screenshots' },
  { id: 'document_bill', label: '🧾 Bills & Docs' },
  { id: 'meme_junk', label: '💬 Memes / Clutter' },
];

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  activeCategory,
  onSelectCategory,
  onRefresh,
  loading,
}) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
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
        onClick={onRefresh}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 p-1.5 rounded-lg border border-slate-200 bg-white shadow-sm transition"
        title="Refresh Photos"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        <span>Refresh</span>
      </button>
    </div>
  );
};
