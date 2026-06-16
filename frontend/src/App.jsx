import React, { useState, useRef, useEffect, useCallback } from "react";

const APP_NAME = "CareLine";
const TAGLINE = "One button. Always connected.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(ts) {
  if (!ts) return "Never";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeSince(ts) {
  if (!ts) return null;
  const secs = Math.floor(Date.now() / 1000 - ts);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Escalation overlay — full-screen red alert
// ---------------------------------------------------------------------------
function EscalationOverlay({ conversation, onClear }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-clay)]/95 alert-pulse">
      <div className="max-w-lg w-full mx-4 bg-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-2xl font-bold text-[var(--color-clay)] font-[var(--font-display)]">
            ESCALATION ALERT
          </h2>
          <p className="text-[var(--color-ink)] font-semibold">
            Check on them now
          </p>
        </div>

        {conversation.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/50">
              Last messages
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {conversation.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[var(--color-line)] text-[var(--color-ink)]"
                      : "bg-[var(--color-pine)] text-white"
                  }`}
                >
                  <span className="font-semibold capitalize">{msg.role === "user" ? "Them" : "AI"}:</span>{" "}
                  {msg.content}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClear}
          className="w-full rounded-xl bg-[var(--color-pine)] text-white py-3 font-semibold text-sm hover:bg-[var(--color-pine-light)] transition-colors"
        >
          I'm on my way — Clear Alert
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status panel (left column)
// ---------------------------------------------------------------------------
function StatusPanel({ status, onClear, tick }) {
  const { last_button_press, escalation_needed, conversation_length } = status;

  return (
    <aside className="w-72 shrink-0 border-r border-[var(--color-line)] flex flex-col gap-6 px-6 py-8">
      {/* Brand */}
      <div>
        <h1 className="font-[var(--font-display)] text-2xl text-[var(--color-pine)]">
          {APP_NAME}
        </h1>
        <p className="text-xs text-[var(--color-ink)]/50 mt-0.5">{TAGLINE}</p>
      </div>

      {/* Escalation badge */}
      <div
        className={`rounded-2xl px-4 py-4 border ${
          escalation_needed
            ? "bg-[var(--color-clay)]/10 border-[var(--color-clay)] text-[var(--color-clay)]"
            : "bg-[var(--color-line)]/50 border-[var(--color-line)] text-[var(--color-pine)]"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
          Status
        </p>
        <p className="text-lg font-bold">
          {escalation_needed ? "⚠ Needs attention" : "✓ All clear"}
        </p>
        {escalation_needed && (
          <button
            onClick={onClear}
            className="mt-3 w-full rounded-lg bg-[var(--color-clay)] text-white text-xs font-semibold py-2 hover:opacity-90 transition-opacity"
          >
            Clear Alert
          </button>
        )}
      </div>

      {/* Button press info */}
      <div className="rounded-2xl border border-[var(--color-line)] px-4 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/50">
          Last button press
        </p>
        <p className="text-sm font-medium text-[var(--color-pine)]">
          {formatTime(last_button_press)}
        </p>
        {last_button_press && (
          <p className="text-xs text-[var(--color-ink)]/40">{timeSince(last_button_press)}</p>
        )}
      </div>

      {/* Conversation stats */}
      <div className="rounded-2xl border border-[var(--color-line)] px-4 py-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/50">
          Check-in messages
        </p>
        <p className="text-2xl font-bold text-[var(--color-pine)]">{conversation_length}</p>
      </div>

      {/* Live indicator */}
      <div className="mt-auto flex items-center gap-2 text-xs text-[var(--color-ink)]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-pine-light)] pulse-soft" />
        Live — polling every 3s
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Conversation panel (right column)
// ---------------------------------------------------------------------------
function ConversationPanel({ conversation, onSendMessage }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await onSendMessage(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-[var(--color-line)] px-6 py-4 shrink-0">
        <h2 className="text-sm font-semibold text-[var(--color-pine)]">Check-in Conversation</h2>
        <p className="text-xs text-[var(--color-ink)]/40 mt-0.5">
          {conversation.length === 0
            ? "Waiting for a button press…"
            : `${conversation.length} message${conversation.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {conversation.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-[var(--color-line)] flex items-center justify-center text-3xl">
              🟢
            </div>
            <p className="text-sm text-[var(--color-ink)]/40 max-w-xs">
              No check-in active. When your loved one presses their CareLine
              button, the conversation will appear here.
            </p>
          </div>
        ) : (
          conversation.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--color-pine)] text-white"
                    : "bg-white border border-[var(--color-line)] text-[var(--color-ink)]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex items-center gap-2 text-[var(--color-pine)]/60 text-sm pl-1">
            <span className="w-2 h-2 rounded-full bg-[var(--color-pine-light)] pulse-soft" />
            AI is responding…
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--color-line)] px-6 py-4 flex gap-3 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            conversation.length === 0
              ? "Waiting for button press…"
              : "Reply on behalf of your loved one…"
          }
          disabled={conversation.length === 0 || sending}
          className="flex-1 rounded-xl border border-[var(--color-line)] bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-pine-light)] disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={conversation.length === 0 || sending || !input.trim()}
          className="rounded-xl bg-[var(--color-pine)] text-white px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-[var(--color-pine-light)] transition-colors"
        >
          Send
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
export default function App() {
  const [status, setStatus] = useState({
    last_button_press: null,
    escalation_needed: false,
    conversation_length: 0,
    conversation: [],
  });
  // Full conversation (superset of the 4 most recent from status)
  const [fullConversation, setFullConversation] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [tick, setTick] = useState(0);

  // Poll /api/status every 3 seconds
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);

      // Sync full conversation if server has more messages
      if (data.conversation_length > fullConversation.length) {
        // Fetch the full conversation by looking at what we have;
        // the status endpoint returns only the last 4, so we merge carefully.
        // We keep our local copy and append only new messages at the tail.
        setFullConversation((prev) => {
          const merged = [...prev];
          for (const msg of data.conversation) {
            const exists = merged.some(
              (m) => m.role === msg.role && m.content === msg.content
            );
            if (!exists) merged.push(msg);
          }
          return merged;
        });
      }

      if (data.escalation_needed) {
        setShowOverlay(true);
      }
    } catch {
      // backend not yet running — ignore silently
    }
  }, [fullConversation]);

  useEffect(() => {
    pollStatus();
    const id = setInterval(() => {
      pollStatus();
      setTick((t) => t + 1);
    }, 3000);
    return () => clearInterval(id);
  }, [pollStatus]);

  async function clearAlert() {
    try {
      await fetch("/api/clear-escalation", { method: "POST" });
      setStatus((s) => ({ ...s, escalation_needed: false }));
      setShowOverlay(false);
    } catch {
      // ignore
    }
  }

  async function sendMessage(text) {
    try {
      const res = await fetch("/api/checkin-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setFullConversation(data.conversation);
      setStatus((s) => ({
        ...s,
        conversation_length: data.conversation.length,
        conversation: data.conversation.slice(-4),
        escalation_needed: data.escalate || s.escalation_needed,
      }));

      if (data.escalate) setShowOverlay(true);
    } catch (err) {
      console.error("checkin-chat error:", err);
    }
  }

  return (
    <>
      {showOverlay && status.escalation_needed && (
        <EscalationOverlay conversation={status.conversation} onClear={clearAlert} />
      )}

      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1 min-h-0" style={{ height: "100vh" }}>
          <StatusPanel status={status} onClear={clearAlert} tick={tick} />
          <ConversationPanel conversation={fullConversation} onSendMessage={sendMessage} />
        </div>
      </div>
    </>
  );
}
