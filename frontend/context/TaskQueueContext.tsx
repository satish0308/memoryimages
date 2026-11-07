'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

export interface TaskItem {
  id: string;
  type: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step: number;
  total_steps: number;
  message: string;
  error?: string | null;
  payload?: Record<string, any>;
  result?: Record<string, any> | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

interface TaskQueueContextType {
  activeTasks: TaskItem[];
  recentTasks: TaskItem[];
  runningTask: TaskItem | null;
  isWsConnected: boolean;
  redisAvailable: boolean;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  dispatchTask: (taskType: string, params?: Record<string, any>, name?: string) => Promise<TaskItem | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  clearHistory: () => Promise<void>;
  refreshTasks: () => Promise<void>;
}

const TaskQueueContext = createContext<TaskQueueContextType | undefined>(undefined);

export const TaskQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [redisAvailable, setRedisAvailable] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isWsConnectedRef = useRef(false);
  isWsConnectedRef.current = isWsConnected;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/tasks/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveTasks(data.active || []);
        setRecentTasks(data.recent || []);
        setRedisAvailable(data.redis_available ?? true);
      }
    } catch (e) {
      console.warn('Failed to poll active tasks:', e);
    }
  }, [API_URL]);

  // Connect to WebSocket
  const connectWs = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const wsUrl = API_URL.replace(/^http/, 'ws') + '/api/v1/tasks/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsWsConnected(true);
        // Heartbeat ping every 25 seconds
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'init') {
            setActiveTasks(data.active || []);
            setRecentTasks(data.recent || []);
            setRedisAvailable(data.redis_available ?? true);
          } else if (data.event === 'task_queued') {
            const task: TaskItem = data.task;
            setActiveTasks((prev) => {
              const filtered = prev.filter((t) => t.id !== task.id);
              return [task, ...filtered];
            });
          } else if (data.event === 'task_update') {
            const task: TaskItem = data.task;
            if (['completed', 'failed', 'cancelled'].includes(task.status)) {
              // Move from active to recent
              setActiveTasks((prev) => prev.filter((t) => t.id !== task.id));
              setRecentTasks((prev) => {
                const filtered = prev.filter((t) => t.id !== task.id);
                return [task, ...filtered.slice(0, 19)];
              });
            } else {
              // Update in active
              setActiveTasks((prev) => {
                const exists = prev.some((t) => t.id === task.id);
                if (exists) {
                  return prev.map((t) => (t.id === task.id ? task : t));
                }
                return [task, ...prev];
              });
            }
          } else if (data.event === 'sync') {
            if (data.active) {
              setActiveTasks(data.active);
            } else {
              refreshTasks();
            }
            if (data.recent) setRecentTasks(data.recent);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        // Attempt reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        setIsWsConnected(false);
        ws.close();
      };
    } catch (e) {
      setIsWsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWs, 4000);
    }
  }, [API_URL]);

  useEffect(() => {
    refreshTasks();
    connectWs();

    // Fallback polling every 5s if WS is down
    const pollInterval = setInterval(() => {
      if (!isWsConnectedRef.current) {
        refreshTasks();
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connectWs, refreshTasks]);

  // Dispatch task to worker
  const dispatchTask = async (taskType: string, params?: Record<string, any>, name?: string): Promise<TaskItem | null> => {
    try {
      const res = await fetch(`${API_URL}/api/v1/tasks/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: taskType, params: params || {}, name }),
      });
      if (res.ok) {
        const task: TaskItem = await res.json();
        setActiveTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
        setIsDrawerOpen(true);
        return task;
      }
    } catch (e) {
      console.error('Failed to dispatch task:', e);
    }
    return null;
  };

  // Cancel task
  const cancelTask = async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/v1/tasks/${taskId}/cancel`, { method: 'POST' });
      if (res.ok) {
        setActiveTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'cancelled', message: 'Cancelled by user' } : t))
        );
        return true;
      }
    } catch (e) {
      console.error('Failed to cancel task:', e);
    }
    return false;
  };

  // Clear completed history
  const clearHistory = async () => {
    try {
      await fetch(`${API_URL}/api/v1/tasks/history`, { method: 'DELETE' });
      setRecentTasks([]);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  const runningTask = activeTasks.find((t) => t.status === 'running') || activeTasks[0] || null;

  return (
    <TaskQueueContext.Provider
      value={{
        activeTasks,
        recentTasks,
        runningTask,
        isWsConnected,
        redisAvailable,
        isDrawerOpen,
        setIsDrawerOpen,
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
        dispatchTask,
        cancelTask,
        clearHistory,
        refreshTasks,
      }}
    >
      {children}
    </TaskQueueContext.Provider>
  );
};

export const useTaskQueue = () => {
  const ctx = useContext(TaskQueueContext);
  if (!ctx) throw new Error('useTaskQueue must be used within TaskQueueProvider');
  return ctx;
};
