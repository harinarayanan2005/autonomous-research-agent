import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const API_BASE = 'http://127.0.0.1:8000/sessions/';

const SAMPLE_TOPICS = [
  "Claude 3.7 vs OpenAI o3",
  "EV Solid-State Batteries",
  "Commercial Fusion 2026",
  "DeepSeek Architecture"
];

const MONO_CHART_COLORS = ['#38bdf8', '#22c55e', '#a855f7', '#f59e0b', '#ec4899'];

function getDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

function extractSourcesFromSteps(steps) {
  if (!steps) return [];
  const sources = [];
  const urlRegex = /(https?:\/\/[^\s\)\"\'>]+)/g;

  steps.forEach((step) => {
    if (step.action === 'scrape_page' && step.action_input) {
      const domain = getDomain(step.action_input);
      if (domain && !sources.some((s) => s.url === step.action_input)) {
        sources.push({ url: step.action_input, domain });
      }
    }
    if (step.observation) {
      const matches = step.observation.match(urlRegex) || [];
      matches.forEach((u) => {
        const cleanUrl = u.replace(/[,\.\'\"\)]+$/, '');
        const domain = getDomain(cleanUrl);
        if (domain && !sources.some((s) => s.url === cleanUrl) && !domain.includes('duckduckgo')) {
          sources.push({ url: cleanUrl, domain });
        }
      });
    }
  });

  return sources.slice(0, 8);
}

function parseReportAndMetrics(rawReport) {
  if (!rawReport) return { metrics: [], cleanReport: '' };
  const match = rawReport.match(/<!--METRICS:(.*?)-->/);
  if (match) {
    try {
      const metrics = JSON.parse(match[1]);
      const cleanReport = rawReport.replace(/<!--METRICS:.*?-->\n?/, '');
      return { metrics, cleanReport };
    } catch {
      return { metrics: [], cleanReport: rawReport };
    }
  }
  return { metrics: [], cleanReport: rawReport };
}

export default function App() {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState('2');
  const [persona, setPersona] = useState('Executive');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Dual Comparison
  const [compareMode, setCompareMode] = useState(false);
  const [compareSession, setCompareSession] = useState(null);

  // Q&A state
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    setQaHistory([]);
    setQaQuestion('');
  }, [activeSession?.id]);

  const fetchSessions = async () => {
    try {
      const res = await axios.get(API_BASE);
      setSessions(res.data);
      if (!activeSession && res.data.length > 0) {
        setActiveSession(res.data[0]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // SSE Stream
  useEffect(() => {
    if (!activeSession || (activeSession.status !== 'RUNNING' && activeSession.status !== 'PENDING')) {
      return;
    }

    const eventSource = new EventSource(`${API_BASE}${activeSession.id}/stream/`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'step') {
          setActiveSession((prev) => {
            if (!prev) return prev;
            const existingSteps = prev.steps || [];
            if (existingSteps.some((s) => s.id === data.step.id)) return prev;
            return {
              ...prev,
              steps: [...existingSteps, data.step]
            };
          });
        } else if (data.type === 'complete') {
          setActiveSession(data.session);
          setLoading(false);
          fetchSessions();
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeSession?.id, activeSession?.status]);

  const handleStartResearch = async (searchTopic) => {
    const query = searchTopic || topic;
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await axios.post(API_BASE, {
        topic: query,
        depth: parseInt(depth),
        persona: persona
      });
      setActiveSession(res.data);
      setTopic('');
      fetchSessions();
    } catch (err) {
      console.error('Failed to start research:', err);
      setLoading(false);
      alert('Error connecting to backend.');
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this session?')) return;

    try {
      await axios.delete(`${API_BASE}${sessionId}/`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSession?.id === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveSession(remaining.length > 0 ? remaining[0] : null);
      }
      if (compareSession?.id === sessionId) {
        setCompareSession(null);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!qaQuestion.trim() || !activeSession) return;

    const currentQ = qaQuestion;
    setQaLoading(true);
    setQaQuestion('');

    try {
      const res = await axios.post(`${API_BASE}${activeSession.id}/ask/`, {
        question: currentQ
      });
      setQaHistory((prev) => [...prev, { question: res.data.question, answer: res.data.answer }]);
    } catch (err) {
      console.error('Follow-up Q&A error:', err);
    } finally {
      setQaLoading(false);
    }
  };

  const { metrics, cleanReport } = parseReportAndMetrics(activeSession?.final_report);
  const compareData = compareSession ? parseReportAndMetrics(compareSession.final_report) : null;

  const handleCopy = () => {
    if (!cleanReport) return;
    navigator.clipboard.writeText(cleanReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    if (!cleanReport) return;
    const blob = new Blob([cleanReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.topic.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const wordCount = cleanReport ? cleanReport.split(/\s+/).filter(Boolean).length : 0;
  const readTime = Math.ceil(wordCount / 200);
  const verifiedSources = extractSourcesFromSteps(activeSession?.steps);

  return (
    <div className="min-vh-100 pb-5">
      {/* Industrial Monolith Header */}
      <header className="border-bottom py-3 no-print" style={{ backgroundColor: 'var(--bg-surface)' }}>
        <div className="container">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <span className="badge rounded-1 p-2 bg-dark border border-secondary text-light font-monospace fw-bold">
                AR//
              </span>
              <div>
                <h6 className="mb-0 fw-bold font-monospace" style={{ letterSpacing: '0.02em' }}>
                  AutoResearch Studio
                </h6>
                <small className="text-muted d-none d-sm-block" style={{ fontSize: '0.72rem' }}>
                  Autonomous Intelligence Engine • ReAct SSE
                </small>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className={`btn btn-sm btn-outline-term d-flex align-items-center gap-1 ${
                  compareMode ? 'bg-secondary text-light' : ''
                }`}
                onClick={() => setCompareMode(!compareMode)}
              >
                <i className="bi bi-columns-gap"></i>
                <span>{compareMode ? 'Exit Split' : 'Compare'}</span>
              </button>

              <span className="term-badge d-flex align-items-center gap-2">
                <span className={loading ? 'pulse-indicator-running' : 'pulse-indicator'}></span>
                <span>{loading ? 'STREAMING' : 'IDLE'}</span>
              </span>

              <button
                type="button"
                className="btn btn-sm btn-outline-term p-1 px-2"
                onClick={() => setDarkMode(!darkMode)}
                title="Toggle Theme"
              >
                <i className={`bi ${darkMode ? 'bi-sun' : 'bi-moon'}`}></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container pt-4">
        {/* Research Input Form */}
        <div className="term-card p-4 mb-4 no-print">
          <div className="mb-3">
            <h5 className="fw-bold mb-1">New Investigation</h5>
            <p className="text-secondary small mb-0">
              Formulate a research target. The agent executes targeted web queries, parses citations, and synthesizes intelligence.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartResearch(topic);
            }}
          >
            <div className="input-group mb-3">
              <input
                type="text"
                className="form-control form-control-lg term-input ps-3"
                placeholder="Enter topic or question (e.g. Solid-State Battery Commercialization Roadmaps)..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={loading}
                style={{ fontSize: '0.95rem' }}
              />
              <button
                type="submit"
                className="btn btn-solid px-4"
                disabled={loading || !topic.trim()}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm" role="status"></span>
                ) : (
                  <span>Launch Agent</span>
                )}
              </button>
            </div>

            <div className="d-flex flex-wrap gap-3 align-items-center justify-content-between pt-1">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <span className="small text-muted me-1 font-monospace" style={{ fontSize: '0.72rem' }}>PRESETS:</span>
                {SAMPLE_TOPICS.map((st, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-sm btn-outline-term py-0 px-2"
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => {
                      setTopic(st);
                      handleStartResearch(st);
                    }}
                    disabled={loading}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="d-flex gap-2">
                <select
                  className="form-select form-select-sm term-input py-1"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                  disabled={loading}
                  style={{ width: 'auto', fontSize: '0.78rem' }}
                >
                  <option value="1">1 Step (Brief)</option>
                  <option value="2">2 Steps (Standard)</option>
                  <option value="3">3 Steps (Deep)</option>
                </select>

                <select
                  className="form-select form-select-sm term-input py-1"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  disabled={loading}
                  style={{ width: 'auto', fontSize: '0.78rem' }}
                >
                  <option value="Executive">Executive</option>
                  <option value="Technical / Engineer">Technical</option>
                  <option value="Academic Analyst">Academic</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        {/* SIDE-BY-SIDE SPLIT VIEW */}
        {compareMode ? (
          <div className="row g-4 mb-4">
            <div className="col-lg-6">
              <div className="term-card p-4 h-100">
                <div className="d-flex justify-content-between align-items-center pb-2 border-bottom mb-3">
                  <span className="term-badge">SESSION A</span>
                  <select
                    className="form-select form-select-sm term-input"
                    style={{ width: 'auto', maxWidth: '240px', fontSize: '0.8rem' }}
                    value={activeSession?.id || ''}
                    onChange={(e) => {
                      const sel = sessions.find((s) => s.id === e.target.value);
                      if (sel) setActiveSession(sel);
                    }}
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.topic}</option>
                    ))}
                  </select>
                </div>

                <h6 className="fw-bold mb-3">{activeSession?.topic}</h6>

                {metrics && metrics.length > 0 && (
                  <div className="term-box p-3 mb-3" style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'monospace' }} />
                        <Tooltip />
                        <Bar dataKey="score" fill="var(--accent-blue)" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="markdown-report p-2" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                  <ReactMarkdown>{cleanReport || 'No report available.'}</ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="term-card p-4 h-100">
                <div className="d-flex justify-content-between align-items-center pb-2 border-bottom mb-3">
                  <span className="term-badge">SESSION B</span>
                  <select
                    className="form-select form-select-sm term-input"
                    style={{ width: 'auto', maxWidth: '240px', fontSize: '0.8rem' }}
                    value={compareSession?.id || ''}
                    onChange={(e) => {
                      const sel = sessions.find((s) => s.id === e.target.value);
                      if (sel) setCompareSession(sel);
                    }}
                  >
                    <option value="">Select Session B...</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.topic}</option>
                    ))}
                  </select>
                </div>

                {compareSession ? (
                  <>
                    <h6 className="fw-bold mb-3">{compareSession.topic}</h6>

                    {compareData?.metrics && compareData.metrics.length > 0 && (
                      <div className="term-box p-3 mb-3" style={{ height: 160 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compareData.metrics} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }} />
                            <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'monospace' }} />
                            <Tooltip />
                            <Bar dataKey="score" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="markdown-report p-2" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                      <ReactMarkdown>{compareData?.cleanReport || 'No report available.'}</ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-5 text-muted my-auto font-monospace">
                    <p className="small">SELECT SECOND SESSION FOR COMPARISON</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD SPLIT VIEW */
          <div className="row g-4">
            {/* Left Column: Cognitive Trace */}
            <div className="col-lg-5 no-print">
              <div className="term-card p-3 mb-4">
                <div className="d-flex justify-content-between align-items-center pb-2 border-bottom mb-3">
                  <h6 className="mb-0 fw-semibold font-monospace" style={{ fontSize: '0.82rem' }}>
                    COGNITIVE TRACE // SSE
                  </h6>
                  {activeSession && (
                    <span className="term-badge">
                      {activeSession.status}
                    </span>
                  )}
                </div>

                {activeSession && activeSession.status === 'RUNNING' && (
                  <div className="mb-3">
                    <div className="progress" style={{ height: '3px', background: 'var(--bg-subtle)' }}>
                      <div
                        className="progress-bar bg-light"
                        style={{ width: `${Math.min(((activeSession.steps?.length || 1) / parseInt(depth)) * 100, 92)}%` }}
                      ></div>
                    </div>
                    <small className="font-monospace text-muted mt-1 d-block text-end" style={{ fontSize: '0.68rem' }}>
                      STEP {activeSession.steps?.length || 0} / {depth}
                    </small>
                  </div>
                )}

                <div style={{ maxHeight: '440px', overflowY: 'auto' }} className="pe-1">
                  {!activeSession || !activeSession.steps || activeSession.steps.length === 0 ? (
                    <div className="text-center py-5 text-muted font-monospace">
                      <p className="mb-0 small">NO ACTIVE CYCLES</p>
                    </div>
                  ) : (
                    activeSession.steps.map((step) => (
                      <div
                        key={step.id || step.step_number}
                        className="mb-2 p-2 rounded term-box"
                      >
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="font-monospace" style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                            #{step.step_number} {step.action}
                          </span>
                        </div>

                        <p className="small mb-1 text-secondary" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                          {step.thought}
                        </p>

                        {step.action_input && (
                          <div className="p-1 px-2 rounded mb-1" style={{ background: 'var(--bg-subtle)' }}>
                            <code className="text-break small" style={{ fontSize: '0.72rem' }}>
                              {step.action_input}
                            </code>
                          </div>
                        )}

                        {step.observation && (
                          <small className="text-muted font-monospace d-block text-truncate" style={{ fontSize: '0.68rem' }}>
                            {step.observation}
                          </small>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Session History */}
              <div className="term-card p-3">
                <div className="d-flex align-items-center justify-content-between pb-2 border-bottom mb-2">
                  <span className="small text-muted font-monospace" style={{ fontSize: '0.72rem' }}>ARCHIVE</span>
                  <span className="small text-muted font-monospace" style={{ fontSize: '0.72rem' }}>{sessions.length} SESSIONS</span>
                </div>
                <div className="list-group list-group-flush" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {sessions.length === 0 ? (
                    <div className="text-center py-4 text-muted small font-monospace">NO SESSIONS</div>
                  ) : (
                    sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`list-group-item py-2 px-2 border-0 rounded mb-1 d-flex justify-content-between align-items-center ${
                          activeSession && activeSession.id === s.id ? 'bg-secondary text-light' : 'term-box text-body'
                        }`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveSession(s)}
                      >
                        <div className="text-truncate pe-2 text-start" style={{ maxWidth: '210px' }}>
                          <div className="fw-medium small text-truncate" style={{ fontSize: '0.8rem' }}>
                            {s.topic}
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-sm text-muted border-0 p-0 px-1"
                            title="Delete"
                            onClick={(e) => handleDeleteSession(e, s.id)}
                          >
                            <i className="bi bi-x-lg" style={{ fontSize: '0.75rem' }}></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Dossier */}
            <div className="col-lg-7">
              <div className="term-card p-4 print-target h-100 d-flex flex-column">
                <div className="print-page-border"></div>

                {/* Toolbar */}
                <div className="d-flex flex-wrap justify-content-between align-items-center pb-2 border-bottom mb-3 gap-2 no-print">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-semibold small font-monospace">DOSSIER VIEW</span>
                  </div>
                  {activeSession && cleanReport && (
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-outline-term py-1 px-2"
                        onClick={handleCopy}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        className="btn btn-sm btn-outline-term py-1 px-2"
                        onClick={handleDownloadMd}
                      >
                        .MD
                      </button>
                      <button
                        className="btn btn-sm btn-solid py-1 px-3"
                        onClick={handlePrintPdf}
                      >
                        Export PDF
                      </button>
                    </div>
                  )}
                </div>

                {/* Metadata KPI Pill Bar */}
                {activeSession && cleanReport && (
                  <div className="term-box p-2 px-3 mb-3 d-flex flex-wrap gap-3 align-items-center justify-content-between no-print">
                    <div className="d-flex align-items-center gap-3 font-monospace">
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {wordCount} WORDS
                      </small>
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                        ~{readTime} MIN READ
                      </small>
                    </div>
                    <small className="text-secondary font-monospace" style={{ fontSize: '0.72rem' }}>
                      GROUNDED // DUCKDUCKGO
                    </small>
                  </div>
                )}

                {/* BENCHMARK CHART */}
                {metrics && metrics.length > 0 && (
                  <div className="term-box p-3 mb-3 no-print">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="small font-monospace text-secondary" style={{ fontSize: '0.72rem' }}>
                        METRIC SCORES (0-100)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 140 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'monospace' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}
                          />
                          <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                            {metrics.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={MONO_CHART_COLORS[index % MONO_CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Verified Sources */}
                {verifiedSources.length > 0 && (
                  <div className="mb-3 no-print">
                    <small className="text-muted d-block font-monospace mb-1" style={{ fontSize: '0.68rem' }}>
                      SOURCES ({verifiedSources.length}):
                    </small>
                    <div className="d-flex gap-1 flex-wrap">
                      {verifiedSources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-term py-0 px-2 text-decoration-none d-flex align-items-center gap-1"
                          style={{ fontSize: '0.72rem' }}
                          title={src.url}
                        >
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=32`}
                            alt="favicon"
                            width="12"
                            height="12"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <span className="text-truncate" style={{ maxWidth: '120px' }}>
                            {src.domain}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Report Content */}
                <div
                  className="flex-grow-1 mb-3"
                  style={{ minHeight: '380px', maxHeight: '540px', overflowY: 'auto' }}
                >
                  {!activeSession ? (
                    <div className="text-center py-5 text-muted my-auto font-monospace">
                      <p className="small">NO SESSION SELECTED</p>
                    </div>
                  ) : activeSession.status === 'RUNNING' || activeSession.status === 'PENDING' ? (
                    <div className="text-center py-5 my-auto font-monospace">
                      <div className="spinner-border spinner-border-sm text-secondary mb-2" role="status"></div>
                      <p className="small text-secondary mb-0">AGENT INVESTIGATING (SSE STREAMING)...</p>
                    </div>
                  ) : cleanReport ? (
                    <div className="markdown-report p-1">
                      <ReactMarkdown>{cleanReport}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-center py-5 text-muted my-auto font-monospace">
                      <p className="small">NO REPORT DATA</p>
                    </div>
                  )}
                </div>

                {/* Q&A Section */}
                {activeSession && activeSession.status === 'COMPLETED' && (
                  <div className="border-top pt-3 mt-auto no-print">
                    <div className="mb-2">
                      <span className="small font-monospace text-secondary" style={{ fontSize: '0.75rem' }}>
                        QUERY DOSSIER
                      </span>
                    </div>

                    {qaHistory.length > 0 && (
                      <div className="mb-2 p-2 rounded term-box" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        {qaHistory.map((item, idx) => (
                          <div key={idx} className="mb-2 pb-1 border-bottom border-secondary border-opacity-25">
                            <strong className="small d-block text-primary" style={{ fontSize: '0.78rem' }}>
                              Q: {item.question}
                            </strong>
                            <div className="text-secondary small pt-1" style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
                              <ReactMarkdown>{item.answer}</ReactMarkdown>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleAskQuestion} className="d-flex gap-2">
                      <input
                        type="text"
                        className="form-control form-control-sm term-input px-3"
                        placeholder="Ask follow-up question..."
                        value={qaQuestion}
                        onChange={(e) => setQaQuestion(e.target.value)}
                        disabled={qaLoading}
                        style={{ fontSize: '0.82rem' }}
                      />
                      <button
                        type="submit"
                        className="btn btn-sm btn-solid px-3"
                        disabled={qaLoading || !qaQuestion.trim()}
                        style={{ fontSize: '0.8rem' }}
                      >
                        {qaLoading ? '...' : 'Ask'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}