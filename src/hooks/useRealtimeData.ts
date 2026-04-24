// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — useSSE Hook
//  Phase 4.1: Real-time data from Server-Sent Events
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { QueueMetrics, Task } from "@/types";

export interface RealtimeData {
  metrics:   QueueMetrics | null;
  tasks:     Task[];
  connected: boolean;
  lastUpdate: Date | null;
}

const DEFAULT_METRICS: QueueMetrics = {
  pending: 0, claimed: 0, completed: 0, failed: 0,
  recovering: 0, dlq: 0, throughput: 0, avg_latency: 0,
  active_workers: 0, total_tasks: 0,
};

export function useRealtimeData(): RealtimeData & { refresh: () => void } {
  const [metrics,    setMetrics]    = useState<QueueMetrics | null>(null);
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [connected,  setConnected]  = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const esRef      = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource("/api/ws");
    esRef.current = es;

    es.onopen = () => {
      if (mountedRef.current) setConnected(true);
    };

    es.addEventListener("metrics", (e) => {
      if (!mountedRef.current) return;
      try {
        const { metrics: m } = JSON.parse(e.data);
        setMetrics(m);
        setLastUpdate(new Date());
      } catch (_) {}
    });

    es.addEventListener("tasks", (e) => {
      if (!mountedRef.current) return;
      try {
        const { tasks: t } = JSON.parse(e.data);
        setTasks(t);
      } catch (_) {}
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      // Reconnect after 3s
      setTimeout(() => {
        if (mountedRef.current) connect();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
    };
  }, [connect]);

  const refresh = useCallback(() => connect(), [connect]);

  return { metrics: metrics ?? DEFAULT_METRICS, tasks, connected, lastUpdate, refresh };
}