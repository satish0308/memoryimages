import { useState, useRef, useEffect, useCallback } from 'react';

export interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UseDragSelectOptions {
  selectedIds: number[];
  setSelectedIds: React.Dispatch<React.SetStateAction<number[]>>;
  orderedIds?: number[];
  onOpenLightbox?: (id: number) => void;
}

export function useDragSelect({
  selectedIds,
  setSelectedIds,
  orderedIds = [],
  onOpenLightbox,
}: UseDragSelectOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);

  // References to keep event listeners always up-to-date without stale closures
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const orderedIdsRef = useRef(orderedIds);
  orderedIdsRef.current = orderedIds;

  const startPosRef = useRef<{ clientX: number; clientY: number; pageX: number; pageY: number } | null>(null);
  const lastPointerPosRef = useRef<{ clientX: number; clientY: number; pageX: number; pageY: number } | null>(null);
  const startIdRef = useRef<number | null>(null);
  const initialSelectedSetRef = useRef<Set<number>>(new Set());
  const isDraggingRef = useRef(false);
  const justFinishedDragRef = useRef(false);
  const lastSelectedIdRef = useRef<number | null>(null);
  const lastToggledSelectionRef = useRef<{ id: number; action: 'added' | 'removed' } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  // Clean up animation frames on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  // Update marquee box & selection calculation
  const updateSelection = useCallback((mode: 'select' | 'deselect') => {
    if (!startPosRef.current || !lastPointerPosRef.current || !isDraggingRef.current) return;

    const start = startPosRef.current;
    const cur = lastPointerPosRef.current;

    // Viewport-relative box coordinates for CSS fixed overlay & getBoundingClientRect matching
    const boxLeft = Math.min(start.pageX, cur.pageX) - window.scrollX;
    const boxTop = Math.min(start.pageY, cur.pageY) - window.scrollY;
    const boxWidth = Math.abs(cur.pageX - start.pageX);
    const boxHeight = Math.abs(cur.pageY - start.pageY);

    const box: MarqueeBox = {
      left: boxLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
    };
    setMarqueeBox(box);

    // Bounding Box with slight padding for ultra-responsive row and column sweeps
    const pad = 6;
    const testLeft = boxLeft - pad;
    const testTop = boxTop - pad;
    const testRight = boxLeft + boxWidth + pad;
    const testBottom = boxTop + boxHeight + pad;

    const cards = document.querySelectorAll<HTMLElement>('[data-media-id]');
    const enclosedIds = new Set<number>();

    cards.forEach((card) => {
      const mediaId = Number(card.getAttribute('data-media-id'));
      if (isNaN(mediaId)) return;

      const rect = card.getBoundingClientRect();

      // Check if card intersects the 2D drag rectangle (covers fast sweeps, row sweeps, column sweeps, and boxes)
      const intersects = !(
        rect.right < testLeft ||
        rect.left > testRight ||
        rect.bottom < testTop ||
        rect.top > testBottom
      );

      if (intersects) {
        enclosedIds.add(mediaId);
      }
    });

    // Also check current element directly under pointer as fallback
    const curEl = document.elementFromPoint(cur.clientX, cur.clientY)?.closest('[data-media-id]');
    let curId: number | null = null;
    if (curEl) {
      const parsed = Number(curEl.getAttribute('data-media-id'));
      if (!isNaN(parsed)) {
        curId = parsed;
        enclosedIds.add(parsed);
      }
    }

    // Line / Row Sweep Support: If dragged along a row line or between two items in reading order
    if (startIdRef.current !== null && curId !== null && startIdRef.current !== curId) {
      const itemsList = orderedIdsRef.current;
      if (itemsList && itemsList.length > 0) {
        const fromIdx = itemsList.indexOf(startIdRef.current);
        const toIdx = itemsList.indexOf(curId);
        if (fromIdx !== -1 && toIdx !== -1) {
          // If the user swept horizontally across a row line (boxWidth >= boxHeight * 0.9)
          // or swept across consecutive items, auto-select all items in the row range
          if (boxWidth >= boxHeight * 0.9 || Math.abs(fromIdx - toIdx) <= 12) {
            const minIdx = Math.min(fromIdx, toIdx);
            const maxIdx = Math.max(fromIdx, toIdx);
            for (let i = minIdx; i <= maxIdx; i++) {
              enclosedIds.add(itemsList[i]);
            }
          }
        }
      }
    }

    // Apply selection/deselection based on drag mode
    if (mode === 'select') {
      const newSelection = new Set([
        ...Array.from(initialSelectedSetRef.current),
        ...Array.from(enclosedIds),
      ]);
      setSelectedIds(Array.from(newSelection));
    } else {
      const newSelection = Array.from(initialSelectedSetRef.current).filter(
        (item) => !enclosedIds.has(item)
      );
      setSelectedIds(newSelection);
    }
  }, [setSelectedIds]);

  // Start pointer tracking on container or card
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, cardId?: number) => {
      // Only handle primary left button
      if (e.button !== 0) return;

      // Don't start drag if clicking interactive buttons / inputs / links
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[data-no-drag]')
      ) {
        return;
      }

      startPosRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
      };
      lastPointerPosRef.current = { ...startPosRef.current };
      initialSelectedSetRef.current = new Set(selectedIdsRef.current);
      isDraggingRef.current = false;

      // Determine starting card ID if provided or from DOM
      let id = cardId;
      if (id === undefined) {
        const cardEl = target.closest('[data-media-id]');
        if (cardEl) {
          const parsed = Number(cardEl.getAttribute('data-media-id'));
          if (!isNaN(parsed)) id = parsed;
        }
      }
      startIdRef.current = id ?? null;

      // If clicked on an already-selected card, enter DESELECT mode; otherwise SELECT mode
      const mode = id !== undefined && initialSelectedSetRef.current.has(id) ? 'deselect' : 'select';
      setDragMode(mode);

      // Auto-scroll loop when near top or bottom edges
      const checkAutoScroll = () => {
        if (!isDraggingRef.current || !lastPointerPosRef.current) return;
        const curY = lastPointerPosRef.current.clientY;
        const EDGE_THRESHOLD = 60;
        const MAX_SPEED = 18;

        if (curY < EDGE_THRESHOLD) {
          const ratio = (EDGE_THRESHOLD - curY) / EDGE_THRESHOLD;
          window.scrollBy(0, -MAX_SPEED * ratio);
          updateSelection(mode);
        } else if (curY > window.innerHeight - EDGE_THRESHOLD) {
          const ratio = (curY - (window.innerHeight - EDGE_THRESHOLD)) / EDGE_THRESHOLD;
          window.scrollBy(0, MAX_SPEED * ratio);
          updateSelection(mode);
        }

        autoScrollRafRef.current = requestAnimationFrame(checkAutoScroll);
      };

      // Prevent native browser image ghost-drag during pointer movement
      const onWindowDragStart = (dragEvent: DragEvent) => {
        if (isDraggingRef.current) {
          dragEvent.preventDefault();
        }
      };

      // Window pointermove handler for high-frequency coordinate tracking
      const onWindowPointerMove = (moveEvent: PointerEvent) => {
        if (!startPosRef.current) return;

        const dx = moveEvent.pageX - startPosRef.current.pageX;
        const dy = moveEvent.pageY - startPosRef.current.pageY;
        const dist = Math.hypot(dx, dy);

        // Engage drag after 10px threshold (prevents micro-movements on double-click from starting a drag)
        if (!isDraggingRef.current && dist > 10) {
          isDraggingRef.current = true;
          setIsDragging(true);
          document.body.style.userSelect = 'none';
          autoScrollRafRef.current = requestAnimationFrame(checkAutoScroll);
        }

        if (isDraggingRef.current) {
          lastPointerPosRef.current = {
            clientX: moveEvent.clientX,
            clientY: moveEvent.clientY,
            pageX: moveEvent.pageX,
            pageY: moveEvent.pageY,
          };

          // Synchronously run updateSelection so fast drags never lag or miss items
          updateSelection(mode);
        }
      };

      const onWindowPointerUp = () => {
        if (isDraggingRef.current) {
          // Immediately flush the final selection update synchronously so fast mouse releases never drop items
          updateSelection(mode);

          justFinishedDragRef.current = true;
          setTimeout(() => {
            justFinishedDragRef.current = false;
          }, 200);
        }

        if (autoScrollRafRef.current) {
          cancelAnimationFrame(autoScrollRafRef.current);
          autoScrollRafRef.current = null;
        }
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        isDraggingRef.current = false;
        setIsDragging(false);
        setMarqueeBox(null);
        startPosRef.current = null;
        lastPointerPosRef.current = null;
        startIdRef.current = null;
        document.body.style.userSelect = '';

        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerUp);
        window.removeEventListener('dragstart', onWindowDragStart);
      };

      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
      window.addEventListener('dragstart', onWindowDragStart);
    },
    [setSelectedIds, updateSelection]
  );

  // Single Click: Toggles Selection (Supports Shift+Click for contiguous range)
  const handleItemClick = useCallback(
    (id: number, e: React.MouseEvent, visibleIds?: number[]) => {
      // If user was dragging, ignore the click event on release
      if (justFinishedDragRef.current || isDraggingRef.current) {
        return;
      }

      // If this is the second click of a double-click, ignore to prevent unselecting while opening lightbox
      if (e.detail > 1) {
        return;
      }

      // Shift + Click Range Selection
      const itemsList = visibleIds || orderedIdsRef.current;
      if (e.shiftKey && lastSelectedIdRef.current !== null && itemsList.length > 0) {
        const fromIdx = itemsList.indexOf(lastSelectedIdRef.current);
        const toIdx = itemsList.indexOf(id);

        if (fromIdx !== -1 && toIdx !== -1) {
          const start = Math.min(fromIdx, toIdx);
          const end = Math.max(fromIdx, toIdx);
          const rangeIds = itemsList.slice(start, end + 1);

          const isTargetSelected = selectedIdsRef.current.includes(id);
          if (isTargetSelected) {
            const rangeSet = new Set(rangeIds);
            setSelectedIds((prev) => prev.filter((i) => !rangeSet.has(i)));
          } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
          }
          lastSelectedIdRef.current = id;
          return;
        }
      }

      // Track the toggle action so double-click can revert it
      const wasSelected = selectedIdsRef.current.includes(id);
      lastToggledSelectionRef.current = { id, action: wasSelected ? 'removed' : 'added' };

      // Normal single click: toggle selection
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
      lastSelectedIdRef.current = id;
    },
    [setSelectedIds]
  );

  // Double Click: Open Big View / Full Image Lightbox with all details
  const handleItemDoubleClick = useCallback(
    (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // If the photo was just toggled by the first click of this double-click sequence, revert it!
      if (lastToggledSelectionRef.current && lastToggledSelectionRef.current.id === id) {
        const { action } = lastToggledSelectionRef.current;
        setSelectedIds((prev) =>
          action === 'added' ? prev.filter((i) => i !== id) : [...prev, id]
        );
        lastToggledSelectionRef.current = null;
      }

      if (onOpenLightbox) {
        onOpenLightbox(id);
      }
    },
    [onOpenLightbox, setSelectedIds]
  );

  return {
    isDragging,
    dragMode,
    marqueeBox,
    handlePointerDown,
    handleItemClick,
    handleItemDoubleClick,
  };
}
