'use client';

import React from 'react';
import { RefreshCw, Users, Mountain, LayoutGrid } from 'lucide-react';

interface CategoryFilterBarProps {
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
  peopleFilter?: 'all' | 'with_people' | 'without_people';
  onSelectPeopleFilter?: (filter: 'all' | 'with_people' | 'without_people') => void;
  peopleCounts?: { all: number; withPeople: number; withoutPeople: number };
  groupByPeople?: boolean;
  onToggleGroupByPeople?: () => void;
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
  peopleFilter = 'all',
  onSelectPeopleFilter,
  peopleCounts,
  groupByPeople = false,
  onToggleGroupByPeople,
  onRefresh,
  loading,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Top Row: Category Pills + Group Toggle + Refresh */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-sm ${
                activeCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-slate-900/20 dark:bg-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onToggleGroupByPeople && (
            <button
              onClick={onToggleGroupByPeople}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all shadow-sm ${
                groupByPeople
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-600/20'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Separate photos into 'With People' and 'Without People' sub-groups"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {groupByPeople ? 'Sub-Grouped: People' : 'Group by People'}
              </span>
              <span className="sm:hidden">Group</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition"
            title="Refresh Photos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Second Row: People Presence Sub-Group Filter Pills */}
      {onSelectPeopleFilter && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-2">
          <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-0.5 scrollbar-none">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1 shrink-0">
              <Users className="w-3 h-3" />
              <span>People:</span>
            </span>

            <button
              onClick={() => onSelectPeopleFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                peopleFilter === 'all'
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All {peopleCounts ? `(${peopleCounts.all})` : ''}
            </button>

            <button
              onClick={() => onSelectPeopleFilter('with_people')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                peopleFilter === 'with_people'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>With People</span>
              {peopleCounts ? <span className="text-[10px] opacity-80">({peopleCounts.withPeople})</span> : null}
            </button>

            <button
              onClick={() => onSelectPeopleFilter('without_people')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                peopleFilter === 'without_people'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              <span>Without People (Nature / Scenery)</span>
              {peopleCounts ? <span className="text-[10px] opacity-80">({peopleCounts.withoutPeople})</span> : null}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
