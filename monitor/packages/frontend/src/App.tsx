import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import TerminalPage from "./TerminalPage";

const PAGES = [
  {
    path: "terminal",
    label: "Terminal",
    cmd: "tmux new-session -A -s terminal",
  },
  {
    path: "claude",
    label: "Claude Code",
    cmd: "tmux new-session -A -s claude",
  },
];

type Status = "idle" | "waiting" | "working" | "error";

const STATUS_LABEL: Record<Status, string> = {
  idle: "Idle",
  waiting: "Waiting",
  working: "Working",
  error: "Error",
};

const STATUS_COLOR: Record<Status, string> = {
  idle: "#6272a4",
  waiting: "#f1fa8c",
  working: "#50fa7b",
  error: "#ff5555",
};

const STATUS_ACCENT_CLASS: Record<Status, string> = {
  idle: "bg-slate-400",
  waiting: "bg-amber-500",
  working: "bg-emerald-500",
  error: "bg-rose-500",
};

interface PR {
  url: string;
  number: number;
  title: string;
  headRefName: string;
}

function stripBracketPrefix(title: string): string {
  return title.replace(/^\[.*?\]\s*/, "");
}

function formatHostname(hostname: string): string {
  return hostname.replace(/^worker(\d+)$/i, "W$1");
}

function showStatusNotification(message: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification(message);
  notification.onclick = () => {
    notification.close();
    window.focus();
  };
}

const MONITOR_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SCREEN_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:6901/`
  : new URL("/", window.location.origin).toString();

const NAV_LINK_BASE_CLASS =
  "mx-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors";
const NAV_LINK_INACTIVE_CLASS =
  "text-app-secondary hover:bg-nav-hover hover:text-app-fg";
const NAV_LINK_ACTIVE_CLASS =
  "bg-nav-active text-nav-active-fg shadow-sm shadow-black/10 hover:bg-nav-active hover:text-nav-active-fg";
const ACTIVE_PAGE_CLASS = "absolute inset-0 visible";
const INACTIVE_PAGE_CLASS = "pointer-events-none absolute inset-0 invisible";

function pageClass(path: string, activePath: string): string {
  return activePath === path ? ACTIVE_PAGE_CLASS : INACTIVE_PAGE_CLASS;
}

function navLinkClass(isActive: boolean): string {
  return `${NAV_LINK_BASE_CLASS} ${isActive ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_INACTIVE_CLASS}`;
}

function AppInner({
  pr,
  status,
  cwd,
  hostname,
}: {
  pr: PR | null;
  status: Status;
  cwd: string;
  hostname: string;
}) {
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
    const handler = (e: BeforeUnloadEvent) => {
      if (status !== "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

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
    const link: HTMLLinkElement =
      document.querySelector("link[rel~='icon']") ??
      (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
        return el;
      })();
    link.href = canvas.toDataURL("image/png");
  }, [status]);

  return (
    <div className="flex h-full w-full bg-app-bg text-app-fg">
      <nav className="flex w-52 shrink-0 flex-col gap-2 border-r border-border bg-panel px-2 py-3 backdrop-blur-md">
        <div className="px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_ACCENT_CLASS[status]}`}
              style={{ background: STATUS_COLOR[status] }}
            />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-app-secondary">
              {STATUS_LABEL[status]}
            </span>
          </div>
          {cwd && (
            <div className="mt-1 truncate font-mono text-[11px] text-app-muted">
              {cwd}
            </div>
          )}
        </div>
        <div className="mx-2 h-px bg-border" />
        <div className="flex flex-col gap-1">
          {PAGES.map(({ path, label }) => (
            <NavLink
              key={path}
              to={`/${path}`}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/screen"
            className={({ isActive }) => navLinkClass(isActive)}
          >
            Screen
          </NavLink>
          <button
            onClick={() => {
              if (confirm("Are you sure you want to stop the container?")) {
                void fetch(`${MONITOR_BASE}/api/stop`, { method: "POST" });
              }
            }}
            className="mx-1 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#ff5555] transition-colors hover:bg-[#ff5555]/10 hover:text-[#ff6e6e]"
          >
            Stop
          </button>
        </div>
        <div className="flex-1" />
        {pr && (
          <>
            <div className="mx-2 h-px bg-border" />
            <div className="mx-1 px-3 py-3">
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[#bd93f9] underline transition-colors hover:text-[#d6acff]"
              >
                PR #{pr.number}
              </a>
              <div className="mt-2 text-sm leading-5 text-app-secondary">
                {stripBracketPrefix(pr.title)}
              </div>
              <div className="mt-2 break-words font-mono text-[11px] text-app-muted">
                {pr.headRefName}
              </div>
            </div>
          </>
        )}
      </nav>
      <main className="relative min-w-0 flex-1 bg-terminal-bg">
        {/* default redirect */}
        <Routes>
          <Route index element={<Navigate to="/terminal" replace />} />
          <Route path="*" element={null} />
        </Routes>

        {PAGES.map(({ path, cmd }) => (
          <div key={path} className={pageClass(`/${path}`, active)}>
            <TerminalPage cmd={cmd} />
          </div>
        ))}
        <div className={pageClass("/screen", active)}>
          {!tabHidden && (
            <iframe
              src={SCREEN_URL}
              title="Remote screen"
              className="h-full w-full border-0 bg-terminal-bg"
            />
          )}
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
  const previousStatusRef = useRef<Status>("idle");

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") {
      return;
    }

    void Notification.requestPermission().catch(() => {
      // Ignore browsers that reject permission requests.
    });
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${MONITOR_BASE}/api/status`);
        const json = (await res.json()) as {
          status: Status;
          cwd: string;
          hostname: string;
          pr: PR | null;
        };
        const previousStatus = previousStatusRef.current;

        if (previousStatus === "error" && json.status !== "error") {
          window.location.reload();
          return;
        }

        if (previousStatus === "working" && json.status === "waiting") {
          showStatusNotification(`${json.hostname} is waiting for your input`);
        } else if (previousStatus === "working" && json.status === "idle") {
          showStatusNotification(`${json.hostname} is finished`);
        }

        previousStatusRef.current = json.status;
        setStatus(json.status);
        setCwd(json.cwd);
        setHostname(json.hostname);
        setPr(json.pr);
      } catch {
        previousStatusRef.current = "error";
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
