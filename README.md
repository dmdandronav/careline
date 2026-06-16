# CareLine

> **One button. Always connected.**

CareLine is a physical check-in system for elderly individuals living independently. Pressing a single button on an ESP32 starts a warm AI conversation and automatically alerts a caregiver if the AI detects something is wrong — no app required on the user's end.

---

## The Problem

Phone calls and apps require the person who needs help to navigate technology at exactly the moment they may be most distressed. A physical button is frictionless: one press, and the conversation begins. Caregivers get a dashboard that updates in real time without needing to be on the call.

---

## Hardware

| Part | Notes |
|------|-------|
| ESP32 dev board | Any standard dev board works |
| Pushbutton | Or just use the built-in **BOOT button** on GPIO 0 — perfect for demos |
| LED | Built-in LED on GPIO 2 — blinks to confirm WiFi + button press |
| WiFi | 2.4 GHz network shared with the laptop running the Flask server |

**Wiring:**
- Button: one leg → GPIO 0, other leg → GND (uses `INPUT_PULLUP`)
- LED: GPIO 2 (built-in on most ESP32 dev boards)

---

## Architecture

```
[Physical Button]
      │
      │ press
      ▼
[ESP32 (button_node.ino)]
      │
      │ POST /api/button  {"event":"button_pressed"}
      ▼
[Flask Backend (backend/app.py)]  ◄──── polls every 3s ────►  [React Frontend]
      │                                                              │
      │ LLM check-in conversation                         Caregiver Dashboard
      │ tracks ESCALATE: true/false                       • Last press time
      │                                                   • Escalation status
      └──────────────────────────────────────────────────► Full conversation view
                                                           • Full-screen alert overlay
```

---

## Escalation Detection

Every AI reply ends with a hidden directive parsed by the backend:

```
ESCALATE: true   — medical emergency, expressed need for help, or crisis language
ESCALATE: false  — all other cases (normal conversation, accidental press, etc.)
```

The `parse_escalation()` function strips this line before showing the message to the user. If any message in the conversation sets `ESCALATE: true`, the backend flips `_escalation_needed = True`. The React dashboard polls `/api/status` every 3 seconds and shows a full-screen red overlay when escalation is detected.

The caregiver clicks **"I'm on my way — Clear Alert"** to acknowledge, which calls `/api/clear-escalation` and resets the flag.

---

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — add your OPENAI_API_KEY (or Groq/Gemini key)
python app.py
```

The server starts on `http://0.0.0.0:5000` so ESP32 devices on the same WiFi can reach it.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the Vite proxy forwards `/api` calls to Flask on port 5000.

### Firmware

1. Open `firmware/button_node.ino` in the Arduino IDE.
2. Install board support: **Arduino IDE → Boards Manager → "ESP32 by Espressif"**
3. Edit the three constants at the top of the file:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_NAME";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_URL    = "http://<YOUR_LAPTOP_IP>:5000/api/button";
   ```
   Find your laptop's local IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux).
4. Flash to your ESP32. The built-in LED blinks 3 times when connected.

---

## Demo Script

1. Start the Flask backend and the React frontend.
2. Open the caregiver dashboard at `http://localhost:5173`.
3. Press the ESP32 BOOT button (or the wired button on GPIO 0).
4. The dashboard shows the AI's opening check-in message immediately.
5. Type a reply in the conversation panel (simulating the person speaking).
6. Type something like *"I fell and I can't get up"* — the AI sets `ESCALATE: true` and the full-screen alert fires.
7. Click **"I'm on my way — Clear Alert"** to acknowledge.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness check |
| `POST` | `/api/button` | ESP32 button press → starts check-in |
| `POST` | `/api/checkin-chat` | Continue the check-in conversation |
| `GET` | `/api/status` | Escalation state + recent messages |
| `POST` | `/api/clear-escalation` | Caregiver acknowledges the alert |
| `POST` | `/api/chat` | General RAG chat |
| `POST` | `/api/documents` | Upload .txt/.md to RAG knowledge base |

---

## Tech Stack

- **Firmware**: Arduino C++ on ESP32, WiFi + HTTPClient
- **Backend**: Python · Flask · OpenAI SDK (compatible with OpenAI, Groq, Gemini)
- **Frontend**: React 18 · Vite · Tailwind CSS v4
- **AI**: Any OpenAI-compatible LLM (default: `gpt-4o-mini`)
