"""
CareLine — Unified Flask backend
---------------------------------
Handles both the caregiver chat frontend (React) and hardware button events
(ESP32). A single button press triggers an AI-powered check-in conversation;
the AI assesses whether the person needs help and sets an escalation flag
visible to the caregiver dashboard.

Routes
------
  GET  /api/health           -> liveness check
  POST /api/chat             -> general RAG chat (original template)
  POST /api/documents        -> upload .txt/.md files to the RAG knowledge base
  POST /api/button           -> ESP32 button press -> starts check-in conversation
  POST /api/checkin-chat     -> continue the check-in conversation
  GET  /api/status           -> current escalation state + recent messages
  POST /api/clear-escalation -> caregiver acknowledges the alert

Works with OpenAI, Groq, or any OpenAI-compatible endpoint (set OPENAI_BASE_URL).
"""

import os
import json
import math
import time as _time
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
CORS(app)  # allow the Vite dev server (localhost:5173) to call this API

# ---------------------------------------------------------------------------
# Client setup — works with OpenAI, Groq, or any OpenAI-compatible API
# ---------------------------------------------------------------------------
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    base_url=os.environ.get("OPENAI_BASE_URL") or None,
)
MODEL = os.environ.get("MODEL_NAME", "gpt-4o-mini")
EMBED_MODEL = os.environ.get("EMBED_MODEL_NAME", "text-embedding-3-small")

# ---------------------------------------------------------------------------
# General assistant system prompt (used by /api/chat)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = os.environ.get(
    "SYSTEM_PROMPT",
    "You are CareLine, a warm and helpful assistant for elderly individuals and "
    "their caregivers. Keep answers concise, reassuring, and accessible.",
)

# ---------------------------------------------------------------------------
# Check-in prompt (used by /api/button and /api/checkin-chat)
# ---------------------------------------------------------------------------
CHECKIN_SYSTEM_PROMPT = """You are responding to someone who just pressed a physical check-in button.
They may want to talk, or may have pressed it by accident. Start warm and low-pressure.
After hearing their response, assess whether they need help.
End EVERY response with exactly one of these on its own line:
ESCALATE: true   (if they describe a medical emergency, express that they need help, or seem in crisis)
ESCALATE: false  (for all other cases)"""

# ---------------------------------------------------------------------------
# Active check-in state (in-memory; fine for a hackathon demo)
# ---------------------------------------------------------------------------
_active_conversation: list = []   # list of {role, content} dicts
_escalation_needed: bool = False
_last_button_press: float | None = None

# ---------------------------------------------------------------------------
# Lightweight RAG helpers
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
INDEX_PATH = DATA_DIR / "_embeddings.json"


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return [c.strip() for c in chunks if c.strip()]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def build_index():
    """Re-embeds every .txt/.md file in ./data and saves to _embeddings.json."""
    records = []
    for path in DATA_DIR.glob("*.*"):
        if path.suffix.lower() not in (".txt", ".md"):
            continue
        text = path.read_text(errors="ignore")
        for chunk in chunk_text(text):
            records.append({"source": path.name, "text": chunk})

    if not records:
        INDEX_PATH.write_text(json.dumps([]))
        return []

    resp = client.embeddings.create(model=EMBED_MODEL, input=[r["text"] for r in records])
    for r, e in zip(records, resp.data):
        r["embedding"] = e.embedding

    INDEX_PATH.write_text(json.dumps(records))
    return records


def load_index():
    if INDEX_PATH.exists():
        return json.loads(INDEX_PATH.read_text())
    return []


def retrieve(query: str, top_k: int = 3):
    """Return the top_k most relevant chunks for `query`. Empty list if no docs."""
    records = load_index()
    if not records:
        return []
    q_emb = client.embeddings.create(model=EMBED_MODEL, input=[query]).data[0].embedding
    scored = sorted(records, key=lambda r: cosine(q_emb, r["embedding"]), reverse=True)
    return scored[:top_k]


# ---------------------------------------------------------------------------
# Escalation parser
# ---------------------------------------------------------------------------
def parse_escalation(text: str) -> tuple[str, bool]:
    """Strip the ESCALATE directive from the AI reply and return (clean_text, bool)."""
    lines = text.strip().split("\n")
    escalate = False
    clean_lines = []
    for line in lines:
        if line.strip().startswith("ESCALATE:"):
            escalate = "true" in line.lower()
        else:
            clean_lines.append(line)
    return "\n".join(clean_lines).strip(), escalate


# ---------------------------------------------------------------------------
# Routes — general
# ---------------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "model": MODEL})


@app.route("/api/documents", methods=["POST"])
def add_document():
    """Upload a text/markdown file to add it to the RAG knowledge base.

    Send as multipart/form-data with field name 'file'.
    """
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400

    f = request.files["file"]
    save_path = DATA_DIR / f.filename
    f.save(save_path)

    records = build_index()
    return jsonify({"status": "indexed", "chunks": len(records)})


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    General RAG chat endpoint.
    Body: { "messages": [{"role": "user"|"assistant", "content": "..."}, ...] }
    Returns: { "reply": "...", "sources": [...] }
    """
    body = request.get_json(force=True)
    messages = body.get("messages", [])
    if not messages:
        return jsonify({"error": "messages required"}), 400

    last_user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")

    context_chunks = retrieve(last_user_msg)
    sources = sorted({c["source"] for c in context_chunks})

    chat_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context_chunks:
        context_text = "\n\n---\n\n".join(c["text"] for c in context_chunks)
        chat_messages.append({
            "role": "system",
            "content": f"Relevant context from uploaded documents:\n\n{context_text}",
        })
    chat_messages.extend(messages)

    completion = client.chat.completions.create(
        model=MODEL,
        messages=chat_messages,
        temperature=0.7,
    )
    reply = completion.choices[0].message.content

    return jsonify({"reply": reply, "sources": sources})


# ---------------------------------------------------------------------------
# Routes — check-in / escalation (CareLine-specific)
# ---------------------------------------------------------------------------
@app.route("/api/button", methods=["POST"])
def button_press():
    """
    Called by the ESP32 when the physical button is pressed.
    Starts a warm check-in conversation and returns the opening AI message.
    Body: { "event": "button_pressed", "source": "physical_button" }
    """
    global _active_conversation, _escalation_needed, _last_button_press

    _last_button_press = _time.time()
    _escalation_needed = False

    # Generate the opening check-in message
    opening_msg = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": CHECKIN_SYSTEM_PROMPT},
            {"role": "user", "content": "I just pressed my CareLine button."},
        ],
        temperature=0.7,
    )
    reply = opening_msg.choices[0].message.content
    clean_reply, escalate = parse_escalation(reply)

    _active_conversation = [
        {"role": "user", "content": "I just pressed my CareLine button."},
        {"role": "assistant", "content": clean_reply},
    ]

    if escalate:
        _escalation_needed = True

    return jsonify({
        "status": "check_in_started",
        "message": clean_reply,
        "escalate": escalate,
    })


@app.route("/api/checkin-chat", methods=["POST"])
def checkin_chat():
    """
    Continue the active check-in conversation.
    Body: { "message": "I feel fine, just wanted to say hello." }
    Returns: { "reply": "...", "escalate": bool, "conversation": [...] }
    """
    global _active_conversation, _escalation_needed

    body = request.get_json(force=True)
    user_msg = body.get("message", "").strip()
    if not user_msg:
        return jsonify({"error": "message required"}), 400

    _active_conversation.append({"role": "user", "content": user_msg})

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": CHECKIN_SYSTEM_PROMPT}] + _active_conversation,
        temperature=0.7,
    )
    reply = completion.choices[0].message.content
    clean_reply, escalate = parse_escalation(reply)

    if escalate:
        _escalation_needed = True

    _active_conversation.append({"role": "assistant", "content": clean_reply})

    return jsonify({
        "reply": clean_reply,
        "escalate": escalate,
        "conversation": _active_conversation,
    })


@app.route("/api/status")
def status():
    """
    Polled by the caregiver dashboard every few seconds.
    Returns escalation state, last button press timestamp, and recent messages.
    """
    return jsonify({
        "last_button_press": _last_button_press,
        "escalation_needed": _escalation_needed,
        "conversation_length": len(_active_conversation),
        "conversation": _active_conversation[-4:] if _active_conversation else [],
    })


@app.route("/api/clear-escalation", methods=["POST"])
def clear_escalation():
    """Caregiver acknowledges the alert — clears the escalation flag."""
    global _escalation_needed
    _escalation_needed = False
    return jsonify({"status": "cleared"})


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # host="0.0.0.0" so the ESP32 on the local network can reach this server
    app.run(host="0.0.0.0", debug=True, port=5000)
