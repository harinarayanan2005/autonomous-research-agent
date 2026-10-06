# AutoResearch Agent

An autonomous research platform that formulates search strategies, browses the web, extracts relevant data, and synthesizes structured research dossiers with benchmark charts in real time.

---

## Overview

AutoResearch Agent is a full-stack AI research system built to move beyond static, single-prompt conversational wrappers. It employs an autonomous **ReAct (Reasoning + Acting)** execution pattern where the agent reasons about what information is missing, invokes external search and scraping tools, inspects intermediate results, and iteratively compiles comprehensive intelligence reports.

---

## Architecture & Features

### 1. Autonomous ReAct Agent Loop
- Operates a multi-step cognitive loop: **Thought** -> **Action** -> **Observation** -> **Synthesis**.
- Equips the language model with external capabilities:
  - **Web Search**: Queries real-time information via DuckDuckGo.
  - **Page Scraper**: Deep extracts clean readable text from selected URLs using BeautifulSoup4.
- Automated error recovery and exponential backoff retry handling for API stability.

### 2. Real-Time Telemetry via Server-Sent Events (SSE)
- Streams agent cognitive traces directly to the client as they occur.
- Implemented using HTTP `StreamingHttpResponse` on Django and the native `EventSource` API on React for lightweight, unidirectional real-time data flow.

### 3. Quantitative Benchmarking & Visualizations
- Synthesizes comparative metric ratings alongside qualitative research text.
- Automatically renders dynamic metric bar charts using **Recharts**.

### 4. Grounded Follow-Up Inquiries
- Interactive Q&A chat drawer allowing users to interrogate research findings.
- Uses strict **Retrieval Grounding** on session observations to eliminate model hallucinations.

### 5. Dual-Session Matrix Comparison
- Side-by-side comparison workspace allowing instant contrast of findings, methodology, and metrics across different research sessions.

### 6. Clean Multi-Page Document Export
- Built-in multi-page print stylesheet formatted with continuous borders and report layouts for saving directly as PDF.

---

## Tech Stack

- **Frontend:** React 19, Vite, Bootstrap 5, Recharts, React-Markdown, Axios
- **Backend:** Django 5.x, Django REST Framework, Django-CORS-Headers, SQLite
- **LLM Engine:** Google Gemini (`google-genai` SDK)
- **Web Tools:** DuckDuckGo Search API, BeautifulSoup4, Requests
