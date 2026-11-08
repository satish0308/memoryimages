import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseDragSelectOptions {
  selectedIds: number[];
  setSelectedIds: React.Dispatch<React.SetStateAction<number[]>>;
  onInspect?: (id: number) => void;
}

export function useDragSelect({
  selectedIds,
  setSelectedIds,
  onInspect,
}: UseDragSelectOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect' | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);

  // Keep refs so global listeners and callbacks always have the freshest state
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const dragModeRef = useRef<'select' | 'deselect' | null>(null);
  dragModeRef.current = dragMode;

  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;

  const dragVisitedRef = useRef<Set<number>>(new Set());
  const hasDraggedMultipleRef = useRef(false);

  // Start drag on an item (mouse down or pointer down on checkbox / card)
  const handleItemPointerDown = useCallback(
    (id: number, e: React.PointerEvent) => {
      // Only trigger on primary mouse button (button 0)
      if (e.button !== 0) return;

      const isCurrentlySelected = selectedIdsRef.current.includes(id);
      // If item was already selected: deselect mode. If item was unselected: select mode.
      const mode = isCurrentlySelected ? 'deselect' : 'select';

      dragModeRef.current = mode;
      setDragMode(mode);
      isDraggingRef.current = true;
      setIsDragging(true);

      dragVisitedRef.current = new Set([id]);
      hasDraggedMultipleRef.current = false;

      // Apply action to the initial item immediately
      if (mode === 'select') {
        setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setLastSelectedId(id);
      } else {
        setSelectedIds((prev) => prev.filter((i) => i !== id));
      }
    },
    [setSelectedIds]
  );

  // Entering an item during mouse drag
  const handleItemPointerEnter = useCallback(
    (id: number) => {
      if (!isDraggingRef.current || !dragModeRef.current) return;
      if (dragVisitedRef.current.has(id)) return;

      dragVisitedRef.current.add(id);
      hasDraggedMultipleRef.current = true;

      const mode = dragModeRef.current;
      if (mode === 'select') {
        setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setLastSelectedId(id);
      } else {
        setSelectedIds((prev) => prev.filter((i) => i !== id));
      }
    },
    [setSelectedIds]
  );

  // Touch move support: detects items under touch finger as user swipes
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDraggingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!element) return;
      const cardEl = element.closest('[data-media-id]');
      if (cardEl) {
        const mediaId = Number(cardEl.getAttribute('data-media-id'));
        if (mediaId && !isNaN(mediaId)) {
          handleItemPointerEnter(mediaId);
        }
      }
    },
    [handleItemPointerEnter]
  );

  // Handle card click with Shift+Click range support and Lightbox fallback
  const handleItemClick = useCallback(
    (id: number, e: React.MouseEvent, visibleOrderedIds?: number[]) => {
      // If a drag stroke crossed multiple items, suppress normal click behavior
      if (hasDraggedMultipleRef.current) {
        hasDraggedMultipleRef.current = false;
        return;
      }

      // 1. Shift + Click Range Selection
      if (e.shiftKey && lastSelectedId !== null && visibleOrderedIds && visibleOrderedIds.length > 0) {
        const fromIdx = visibleOrderedIds.indexOf(lastSelectedId);
        const toIdx = visibleOrderedIds.indexOf(id);

        if (fromIdx !== -1 && toIdx !== -1) {
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          const rangeIds = visibleOrderedIds.slice(start, end + 1);

          const isTargetSelected = selectedIdsRef.current.includes(id);
          if (isTargetSelected) {
            const rangeSet = new Set(rangeIds);
            setSelectedIds((prev) => prev.filter((i) => !rangeSet.has(i)));
          } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
          }
          setLastSelectedId(id);
          return;
        }
      }

      // 2. If in selection mode or explicitly clicked checkbox
      if (selectedIdsRef.current.length > 0) {
        const isCurrentlySelected = selectedIdsRef.current.includes(id);
        if (isCurrentlySelected) {
          setSelectedIds((prev) => prev.filter((i) => i !== id));
        } else {
          setSelectedIds((prev) => [...prev, id]);
          setLastSelectedId(id);
        }
        return;
      }

      // 3. Normal single click outside selection mode: inspect photo
      if (onInspect) {
        onInspect(id);
      } else {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
        setLastSelectedId(id);
      }
    },
    [lastSelectedId, onInspect, setSelectedIds]
  );

  // Global window pointerup to conclude drag anywhere on screen
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragModeRef.current = null;
        setIsDragging(false);
        setDragMode(null);
        dragVisitedRef.current.clear();
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, []);

  return {
    isDragging,
    dragMode,
    lastSelectedId,
    handleItemPointerDown,
    handleItemPointerEnter,
    handleTouchMove,
    handleItemClick,
  };
}
