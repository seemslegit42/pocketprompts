# PocketPrompts 🚀

PocketPrompts is an open-source, cross-platform prompt management studio built for local-first AI workflows, multi-user real-time collaboration, and precision cognitive execution.

## Key Features

1. **Real-Time WebSocket Collaboration (`/ws/collab`)**:
   - Live multi-user synchronization across browser tabs and mobile viewports.
   - Live peer presence indicators, typing status, and concurrent prompt drafting.

2. **Precision Execution & Real-Time Streaming (`/api/execute/stream`)**:
   - Powered by the `@google/genai` SDK (`gemini-3.8-flash` model), streaming responses via Server-Sent Events (SSE).
   - Interactive tactile feedback with audio-haptic thrums and concentric energy ripple animations on execution.

3. **Offline SQLite Persistence & Version Control**:
   - Robust embedded SQLite database tracking prompt history, immutable audit logs, and one-click version rollbacks.

4. **Point & Query Vision Analysis**:
   - Capture live camera frames or upload images to inspect architecture topologies, UI wireframes, and documentation specs with Gemini vision grounding.

5. **Structured Outputs & DoT.js Template Rendering**:
   - Define JSON schemas and lightweight DoT.js templates (`{{=it.prop}}`, `{{~it.arr :item:idx}}`) to render rich interactive cards.

6. **Automated LAN Discovery**:
   - Automatically probes local network subnets (`127.0.0.1`, custom hosts) for running Ollama and `llama.cpp` inference daemons.

---

## Architecture & Tech Stack

- **Frontend**: React, Vite, Tailwind CSS (Glassmorphic UI theme), Lucide icons.
- **Backend**: Node.js & Express (`server.ts`) with native WebSocket server support (`ws`).
- **Database**: Better-SQLite3 (`src/server/db.ts`) with auto-migrating tables for prompts, categories, versions, providers, and webhook integrations.
- **AI Integration**: `@google/genai` TypeScript SDK supporting text generation, multimodal vision, structured schemas, and streaming SSE tokens.

---

## Getting Started

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and configure your `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```

3. **Run Development Server**:
   ```bash
   bun run dev
   ```
   The application runs on port `3000` with Vite middleware mounted on Express.
