// ─────────────────────────────────────────────────────────────────────────────
//  EOS Queue — CreateTaskModal
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useTaskActions } from "@/hooks/useTaskActions";
import type { PriorityLevel } from "@/types";

interface CreateTaskModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  onSuccess?: () => void;
}

const SAMPLE_PAYLOADS = [
  { name: "send-email",       payload: { to: "user@example.com", subject: "Welcome!", template: "onboarding" } },
  { name: "process-payment",  payload: { amount: 9900, currency: "USD", customer_id: "cus_abc123" } },
  { name: "resize-image",     payload: { image_url: "https://example.com/photo.jpg", sizes: [128, 256, 512] } },
  { name: "generate-report",  payload: { report_type: "monthly", month: "2025-06", format: "pdf" } },
  { name: "sync-inventory",   payload: { warehouse_id: "WH-01", sku_list: ["SKU-A", "SKU-B"] } },
];

export default function CreateTaskModal({ isOpen, onClose, onSuccess }: CreateTaskModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef   = useRef<HTMLDivElement>(null);

  const { createTask, isCreating, lastError } = useTaskActions();

  const [name,           setName]           = useState("");
  const [payloadStr,     setPayloadStr]      = useState("{}");
  const [priority,       setPriority]       = useState<PriorityLevel>(3);
  const [maxRetries,     setMaxRetries]      = useState(5);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [jsonError,      setJsonError]      = useState("");
  const [success,        setSuccess]        = useState(false);

  // GSAP entrance/exit
  useEffect(() => {
    if (!overlayRef.current || !modalRef.current) return;
    if (isOpen) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(modalRef.current,
        { opacity: 0, y: 40, scale: 0.95 },
        { opacity: 1, y: 0,  scale: 1, duration: 0.3, ease: "back.out(1.4)" }
      );
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!overlayRef.current || !modalRef.current) return onClose();
    gsap.to(modalRef.current,   { opacity: 0, y: 20, scale: 0.97, duration: 0.2, onComplete: onClose });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2 });
  };

  const loadSample = (idx: number) => {
    const s = SAMPLE_PAYLOADS[idx];
    setName(s.name);
    setPayloadStr(JSON.stringify(s.payload, null, 2));
    setJsonError("");
  };

  const validateJson = (str: string) => {
    try { JSON.parse(str); setJsonError(""); }
    catch { setJsonError("Invalid JSON"); }
  };

  const handleSubmit = async () => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      setJsonError("Invalid JSON payload");
      return;
    }

    const task = await createTask({
      name,
      payload:         parsedPayload,
      priority_level:  priority,
      max_retries:     maxRetries,
      idempotency_key: idempotencyKey || undefined,
    });

    if (task) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setName(""); setPayloadStr("{}"); setPriority(3); setMaxRetries(5); setIdempotencyKey("");
        onSuccess?.();
        handleClose();
      }, 1200);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(8,11,20,0.85)", backdropFilter: "blur(8px)" }}>
      <div ref={modalRef} className="w-full max-w-2xl card-elevated rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-text-primary font-display font-semibold text-lg">Enqueue Task</h2>
            <p className="text-text-muted text-xs font-mono mt-0.5">Producer → Queue → Worker</p>
          </div>
          <button onClick={handleClose} className="text-text-muted hover:text-text-primary transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Sample payloads */}
          <div>
            <p className="text-text-muted text-xs font-mono mb-2 uppercase tracking-wider">Quick Templates</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PAYLOADS.map((s, i) => (
                <button key={i} onClick={() => loadSample(i)}
                  className="px-3 py-1 text-xs font-mono bg-bg-surface border border-border-subtle rounded-lg text-text-secondary hover:border-accent-yellow/40 hover:text-accent-yellow transition-colors">
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Task name */}
          <div>
            <label className="text-text-secondary text-xs font-mono uppercase tracking-wider block mb-1.5">
              Task Name <span className="text-accent-red">*</span>
            </label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. send-email, process-payment"
              className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-yellow/50 transition-colors"
            />
          </div>

          {/* Payload */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-text-secondary text-xs font-mono uppercase tracking-wider">
                Payload (JSON) <span className="text-accent-red">*</span>
              </label>
              {jsonError && <span className="text-accent-red text-xs font-mono">{jsonError}</span>}
            </div>
            <textarea
              value={payloadStr}
              onChange={(e) => { setPayloadStr(e.target.value); validateJson(e.target.value); }}
              rows={6}
              className={`w-full bg-bg-surface border rounded-lg px-4 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none transition-colors resize-none ${jsonError ? "border-accent-red/50" : "border-border-subtle focus:border-accent-yellow/50"}`}
            />
          </div>

          {/* Priority + Retries */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-text-secondary text-xs font-mono uppercase tracking-wider block mb-1.5">Priority</label>
              <div className="flex gap-1.5">
                {([1,2,3,4,5] as PriorityLevel[]).map((p) => (
                  <button key={p} onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold border transition-all ${priority === p ? "bg-accent-yellow/15 border-accent-yellow text-accent-yellow" : "bg-bg-surface border-border-subtle text-text-muted hover:border-border-normal"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-text-secondary text-xs font-mono uppercase tracking-wider block mb-1.5">Max Retries</label>
              <input
                type="number" min={0} max={10} value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-yellow/50 transition-colors"
              />
            </div>
          </div>

          {/* Idempotency Key */}
          <div>
            <label className="text-text-secondary text-xs font-mono uppercase tracking-wider block mb-1.5">
              Idempotency Key <span className="text-text-muted">(optional — UUID generated if blank)</span>
            </label>
            <input
              value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)}
              placeholder="my-unique-operation-key"
              className="w-full bg-bg-surface border border-border-subtle rounded-lg px-4 py-2.5 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-yellow/50 transition-colors"
            />
          </div>

          {lastError && (
            <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg px-4 py-3 text-accent-red text-sm font-mono">
              {lastError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 text-sm font-mono text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isCreating || !name || !!jsonError || success}
            className={`px-6 py-2 rounded-lg text-sm font-mono font-semibold transition-all ${
              success
                ? "bg-accent-green/20 border border-accent-green text-accent-green"
                : "bg-accent-yellow text-bg-primary hover:bg-accent-amber disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {success ? "✓ Enqueued!" : isCreating ? "Enqueueing..." : "Enqueue Task"}
          </button>
        </div>
      </div>
    </div>
  );
}