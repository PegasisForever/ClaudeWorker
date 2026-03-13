import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import TerminalPage from "./TerminalPage";
import "./App.css";

const PAGES = [
  { path: "terminal", label: "Terminal", cmd: "tmux new-session -A -s terminal" },
  { path: "claude", label: "Claude Code", cmd: "tmux new-session -A -s claude" },
];

type Status = "idle" | "waiting" | "working" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "Idle",
  waiting: "Waiting",
  working: "Working",
  error: "Error",
};

const STATUS_COLOR: Record<Status, string> = {
  idle: "#8e8e8e",
  waiting: "#d29922",
  working: "#3fb950",
  error: "#e74c3c",
};

interface PR { url: string; number: number; title: string; headRefName: string }

function stripBracketPrefix(title: string): string {
  return title.replace(/^\[.*?\]\s*/, "");
}

function formatHostname(hostname: string): string {
  return hostname.replace(/^worker(\d+)$/i, "W$1");
}

const MONITOR_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SCREEN_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:6901/`
  : new URL("/", window.location.origin).toString();

function AppInner({ pr, status, cwd, hostname }: { pr: PR | null; status: Status; cwd: string; hostname: string }) {
  const location = useLocation();
  const active = location.pathname;
  const [tabHidden, setTabHidden] = useState(document.hidden);

  useEffect(() => {
    const handler = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    const tag = formatHostname(hostname);
    const prName = pr ? stripBracketPrefix(pr.title) : null;
    document.title = prName ? `${tag} | ${prName}` : tag;
  }, [hostname, pr]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 32, 32);
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = STATUS_COLOR[status];
    ctx.fill();
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") ?? (() => {
      const el = document.createElement("link");
      el.rel = "icon";
      document.head.appendChild(el);
      return el;
    })();
    link.href = canvas.toDataURL("image/png");
  }, [status]);

  const show = (path: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    visibility: active === path ? "visible" : "hidden",
    pointerEvents: active === path ? "auto" : "none",
  });

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="status-badge">
          <div className="status-row">
            <span className="status-dot" style={{ background: STATUS_COLOR[status] }} />
            <span className="status-label">{STATUS_LABEL[status]}</span>
          </div>
          {cwd && <div className="status-cwd">{cwd}</div>}
        </div>
        <div className="nav-divider" />
        {PAGES.map(({ path, label }) => (
          <NavLink key={path} to={`/${path}`} className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            {label}
          </NavLink>
        ))}
        <NavLink to="/screen" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
          Screen
        </NavLink>
        {pr && (
          <>
            <a href={pr.url} target="_blank" rel="noreferrer" className="nav-item nav-item--pr">
              PR #{pr.number}
            </a>
            <div className="pr-title">{stripBracketPrefix(pr.title)}</div>
            <div className="pr-branch">{pr.headRefName}</div>
          </>
        )}
      </nav>
      <main className="content">
        {/* default redirect */}
        <Routes>
          <Route index element={<Navigate to="/terminal" replace />} />
          <Route path="*" element={null} />
        </Routes>

        {PAGES.map(({ path, cmd }) => (
          <div key={path} style={show(`/${path}`)}>
            <TerminalPage cmd={cmd} />
          </div>
        ))}
        <div style={show("/screen")}>
          {!tabHidden && <iframe src={SCREEN_URL} style={{ width: "100%", height: "100%", border: "none" }} />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [pr, setPr] = useState<PR | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [cwd, setCwd] = useState<string>("");
  const [hostname, setHostname] = useState<string>("");

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${MONITOR_BASE}/api/status`);
        const json = await res.json() as { status: Status; cwd: string; hostname: string; pr: PR | null };
        setStatus(json.status);
        setCwd(json.cwd);
        setHostname(json.hostname);
        setPr(json.pr);
      } catch {
        setStatus("error");
      }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <BrowserRouter basename={MONITOR_BASE || undefined}>
      <AppInner pr={pr} status={status} cwd={cwd} hostname={hostname} />
    </BrowserRouter>
  );
}
