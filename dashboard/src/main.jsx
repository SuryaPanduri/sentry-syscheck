import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
const HEARTBEAT_MIN = Number(import.meta.env.VITE_HEARTBEAT_MINUTES || 60); // minutes

const StatusIcon = ({ s }) => {
  const map = {
    ok: { label: "OK", class: "ok", emoji: "✅" },
    issue: { label: "Issue", class: "issue", emoji: "⚠️" },
    unknown: { label: "Unknown", class: "unknown", emoji: "❓" },
  };
  const { label, class: cls, emoji } = map[s] || map.unknown;
  return (
    <span className={`pill ${cls}`} title={label}>
      <span className="emoji" aria-hidden>{emoji}</span>
      {label}
    </span>
  );
};

function timeAgo(iso) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (Number.isNaN(diff)) return "";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const isStale = (lastSeenIso) =>
  Date.now() - new Date(lastSeenIso).getTime() > HEARTBEAT_MIN * 2 * 60_000;

async function fetchMachines(params = {}) {
  const url = new URL(API_URL + "/v1/machines");
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function SkeletonRow() {
  return (
    <tr className="skeleton">
      <td colSpan={7}>
        <div className="skeleton-bar" />
      </td>
    </tr>
  );
}

function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [os, setOS] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Initial load + on filters
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    fetchMachines({ q, os, status })
      .then((data) => mounted && setRows(data))
      .catch((e) => mounted && setError(String(e.message || e)))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [q, os, status]);

  // Auto-refresh every 15s so blink/offline updates without manual reload
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const data = await fetchMachines({ q, os, status });
        if (mounted) setRows(data);
      } catch {}
    };
    const id = setInterval(tick, 15000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { mounted = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [q, os, status]);

  const sorted = useMemo(() => {
    const hasIssues = (m) =>
      Object.values(m.checks || {}).some(
        (c) => c?.status === "issue" || c?.status === "unknown"
      );
    return rows.slice().sort((a, b) => (hasIssues(b) ? 1 : 0) - (hasIssues(a) ? 1 : 0));
  }, [rows]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🩺</div>
          <div className="titles">
            <h1>SysHealth Dashboard</h1>
            <p className="muted">API: {API_URL}</p>
          </div>
        </div>
        <a className="btn ghost" href={`${API_URL}/v1/export.csv`} target="_blank" rel="noreferrer">
          Export CSV
        </a>
      </header>

      <section className="filters">
        <div className="field">
          <label>Search</label>
          <input
            className="input"
            placeholder="hostname or machine id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="field">
          <label>OS</label>
          <select className="input" value={os} onChange={(e) => setOS(e.target.value)}>
            <option value="">All</option>
            <option value="windows">Windows</option>
            <option value="darwin">macOS</option>
            <option value="linux">Linux</option>
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="issue">Issue</option>
            <option value="ok">OK</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="alert error">
          <strong>Failed to load:</strong> {error}
        </div>
      )}

      <section className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Host</th>
              <th>OS / Arch</th>
              <th>Disk Enc</th>
              <th>OS Updates</th>
              <th>Antivirus</th>
              <th>Sleep ≤10m</th>
              <th>Last Check‑in</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<><SkeletonRow /><SkeletonRow /></>)}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">No machines yet.</td>
              </tr>
            )}
            {!loading && sorted.map((m) => {
              const stale = isStale(m.last_seen);
              return (
                <tr key={m.machine_id} className="row">
                  <td>
                    <div className="host">
                      <span className="name">{m.hostname}</span>
                      <span className="sub">{m.machine_id.slice(0, 10)}…</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      {m.os}/{m.arch}
                      <div className="sub">agent {m.agent_version}</div>
                    </div>
                  </td>
                  <td><StatusIcon s={m.checks?.disk_encryption?.status} /></td>
                  <td><StatusIcon s={m.checks?.os_update_status?.status} /></td>
                  <td><StatusIcon s={m.checks?.antivirus?.status} /></td>
                  <td><StatusIcon s={m.checks?.inactivity_sleep?.status} /></td>
                  <td>
                    <div className="when" title={new Date(m.last_seen).toLocaleString()}>
                      {timeAgo(m.last_seen)}
                      {!stale ? (
                        <span
                          className="hb-tag"
                          title={m.heartbeat ? "Alive (heartbeat)" : "Alive (change event)"}
                        >
                          ●
                        </span>
                      ) : (
                        <span style={{ marginLeft: 6, fontSize: 12, color: "#dc2626" }}>
                          offline
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer className="footer">
        <span className="muted">© {new Date().getFullYear()} SysHealth</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);