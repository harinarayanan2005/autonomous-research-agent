# AutoResearch Agent — Architectural Dossier & Interview Guide

A full-stack, production-grade **Agentic AI** platform built with **React 19**, **Django 5**, **Django REST Framework**, and **Google Gemini 3.5 Flash Lite**.

---

## 🌟 Key Architecture & Capabilities

### 1. Autonomous ReAct Cognitive Loop
Unlike static chatbot wrappers that guess from frozen training data, AutoResearch executes an autonomous **ReAct (Reasoning + Acting)** cycle:
1. **Thought:** The agent identifies what information is missing.
2. **Action:** It invokes external tools (`search_web` or `scrape_page`).
3. **Observation:** It reads live web data from DuckDuckGo or web pages.
4. **Iterative Refinement:** It refines queries based on previous discoveries before compiling the final dossier.

### 2. Server-Sent Events (SSE) Streaming
* Implemented in Django using `StreamingHttpResponse(content_type='text/event-stream')`.
* React connects via the native W3C `EventSource` API.
* Replaces interval polling with real-time push: steps and tool telemetry stream into the UI character-by-character with zero artificial lag.

### 3. Quantitative Data Visualization (Recharts)
* The agent outputs a dual payload: a full Markdown dossier and a structured JSON array of 4–5 benchmark scores (scaled 1–100).
* React dynamically renders an interactive, multi-color **Benchmark Bar Chart** right above the report.

### 4. Grounded Follow-Up Q&A
* Users can query the compiled dossier.
* The backend injects the report and all raw web observation snippets into the prompt, enforcing strict factual grounding with zero hallucinations.

### 5. Multi-Page Boxed PDF Export
* Configured using CSS Paged Media standards (`@page`, `-webkit-box-decoration-break: clone`, `orphans/widows` control).
* Produces a formal Microsoft Word-style bordered whitepaper across all pages.

---

## 🏗️ System Architecture Flowchart

```
[ React Client (Vite + Recharts + SSE) ]
                   │
                   │  1. POST /api/sessions/ (Topic, Depth, Persona)
                   ▼
[ Django Backend (Orchestration Engine) ]
   ├── Background Execution Thread (run_research_agent)
   │     ├── Gemini 3.5 Flash Lite (Formulates Thought & Chooses Action)
   │     ├── Tool Sandbox (DuckDuckGo Search OR BeautifulSoup Scraper)
   │     └── Loop Controller (Up to N iterations with 429/503 backoff)
   │
   ├── Database Persistence (Django ORM)
   │     ├── ResearchSession (Topic, Status, Final Report, Metrics JSON)
   │     └── AgentStep (Thought, Action, Action_Input, Observation)
   │
   └── Server-Sent Events (SSE) Stream
         │  2. GET /api/sessions/{id}/stream/ (Content-Type: text/event-stream)
         ▼
[ Real-Time UI Render ]
   ├── Live Cognitive Trace Timeline
   ├── Quantitative Metric Bar Chart (Recharts)
   ├── Clickable Verified Sources with Favicons
   └── Interactive Follow-up Grounded Q&A Drawer
```

---

## 🗄️ Database Schema Design

* **`ResearchSession`**
  * `id`: UUID (Primary Key)
  * `topic`: CharField(500)
  * `status`: CharField (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`)
  * `final_report`: TextField (Markdown + Embedded Metric JSON)
  * `created_at`, `updated_at`: DateTimeField
* **`AgentStep`**
  * `session`: ForeignKey $\rightarrow$ `ResearchSession` (on_delete=models.CASCADE)
  * `step_number`: PositiveIntegerField
  * `thought`: TextField (Agent's reasoning)
  * `action`: CharField(100) (Tool name: `search_web`, `scrape_page`, `finish`)
  * `action_input`: TextField (Query or URL)
  * `observation`: TextField (Scraped web snippet)
  * `created_at`: DateTimeField

---

## 🎤 Technical Interview Cheat-Sheet

### Q1: How does your application differ from a typical ChatGPT wrapper?
> *"A wrapper simply forwards a user prompt to an LLM API and displays the text. It has no external agency and frequently hallucinates. My application implements an autonomous ReAct (Reasoning + Acting) loop: it plans search strategies, executes live DuckDuckGo queries and web-scraping tools, evaluates observations, and saves an immutable audit trail of its reasoning trajectory in a relational database."*

### Q2: Why did you choose Server-Sent Events (SSE) over WebSockets?
> *"WebSockets are bidirectional and protocol-heavy, suited for chatrooms or online gaming. An AI research agent only needs to push progress and tokens one-way from server to client. SSE runs over standard HTTP, traverses firewalls without configuration, has zero handshake overhead, and features native auto-reconnect in the browser's `EventSource` API."*

### Q3: How did you handle LLM rate limits (429) and high-demand spikes (503)?
> *"I built an exponential backoff decorator in `agent_engine.py`. If Google AI Studio returns a 429 Resource Exhausted or 503 Spike error, the engine intercepts it, sleeps for an escalating interval, and retries up to 4 times before graceful fallback. All agent runs occur in background threads, so slow responses never block the main Django HTTP server."*

### Q4: How do you prevent hallucinations during the follow-up Q&A?
> *"I implemented strict Retrieval Grounding. When a user asks a follow-up question, the backend queries the database for all recorded `AgentStep` web observations and the report text, injecting them directly into the system prompt with instructions to answer strictly from verified telemetry."*

---

## 📋 Resume Bullet Points (Ready to Copy)

* **Autonomous Agentic Architecture:** Engineered a full-stack research platform using React 19 and Django REST Framework, implementing an autonomous ReAct loop with Gemini 3.5 Flash Lite for multi-step web research.
* **Live Tool Execution:** Integrated DuckDuckGo Search API and BeautifulSoup4 to crawl live web sources and extract domain citations.
* **Real-Time SSE Streaming:** Architected real-time Server-Sent Events (SSE) via Django's `StreamingHttpResponse` and React's `EventSource`, streaming agent cognitive traces without polling lag.
* **Structured Data & Visualization:** Implemented dual-payload structured output generation, dynamically binding quantified benchmark metrics to interactive Recharts bar components.
* **Standardized Whitepaper Export:** Created a multi-page bordered Word-style PDF export stylesheet using CSS Paged Media standards.
