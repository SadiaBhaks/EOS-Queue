// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — useTaskActions Hook
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { CreateTaskDTO, Task } from "@/types";

interface UseTaskActionsReturn {
  createTask:  (dto: Omit<CreateTaskDTO, "task_id">) => Promise<Task | null>;
  isCreating:  boolean;
  lastError:   string | null;
  lastCreated: Task | null;
}

export function useTaskActions(): UseTaskActionsReturn {
  const [isCreating,  setIsCreating]  = useState(false);
  const [lastError,   setLastError]   = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<Task | null>(null);

  const createTask = useCallback(async (dto: Omit<CreateTaskDTO, "task_id">): Promise<Task | null> => {
    setIsCreating(true);
    setLastError(null);

    try {
      const res = await fetch("/api/tasks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...dto, task_id: uuidv4() }),
      });

      if (res.status === 409) {
        setLastError("Duplicate task: this idempotency key was already processed.");
        return null;
      }

      if (!res.ok) {
        const err = await res.json();
        setLastError(err.error || "Failed to create task");
        return null;
      }

      const { task } = await res.json();
      setLastCreated(task);
      return task as Task;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setLastError(msg);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { createTask, isCreating, lastError, lastCreated };
}