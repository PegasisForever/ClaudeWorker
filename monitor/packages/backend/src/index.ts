import { spawn } from "bun-pty";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";

const MONITOR_API_BASE = "/monitor/api";
const MONITOR_STATUS_PATH = `${MONITOR_API_BASE}/status`;
const MONITOR_STOP_PATH = `${MONITOR_API_BASE}/stop`;
const MONITOR_WS_PATH = "/monitor/ws";
const PORT = parseInt(process.env.PORT ?? "13001", 10);

type Status = "idle" | "waiting" | "working";

const HOME = process.env.HOME ?? "";
const HOSTNAME = (await Bun.spawn(["hostname"], { stdout: "pipe" }).stdout.text()).trim();

interface ClaudeInfo {
  status: Status;
  cwd: string;
  hostname: string;
  pr: { url: string; number: number; title: string; headRefName: string } | null;
}

const PR_TTL = 2 * 60 * 1000;

const prCache = {
  pr: null as ClaudeInfo["pr"],
  lastStatus: null as Status | null,
  lastFetchedAt: 0,
};

function getRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? `127.0.0.1:${PORT}`;
  return new URL(req.url ?? "/", `http://${host}`);
}

function getTerminalCommand(req: IncomingMessage): { cmd: string; args: string[] } {
  const url = getRequestUrl(req);
  const rawCmd = url.searchParams.get("cmd") ?? "bash";
  const parts = rawCmd.trim().split(/\s+/);
  return { cmd: parts[0], args: parts.slice(1) };
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    res.setHeader(key, value);
  }

  if (!response.body) {
    res.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

async function ensureTmuxSession(sessionName: string): Promise<void> {
  const proc = Bun.spawn(["tmux", "new-session", "-d", "-s", sessionName], {
    cwd: HOME || undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode === 0 || stderr.includes("duplicate session")) {
    return;
  }

  console.error(`failed to create tmux session ${sessionName}: ${stderr.trim()}`);
}

// Wait until /tmp/monitor_flag disappears
while (true) {
  const fileExists = await Bun.file("/tmp/monitor_flag").exists();
  if (!fileExists) {
    break;
  }
  console.log("Waiting for /tmp/monitor_flag to disappear...");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

await Promise.all([
  ensureTmuxSession("claude"),
  ensureTmuxSession("terminal"),
]);

function shellEscape(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const setupCommand = process.env.SETUP_COMMAND;
console.log("setup command", setupCommand);
if (setupCommand) {
  console.log("running setup command", setupCommand);
  const proc = Bun.spawn(["tmux", "send-keys", "-t", "claude", setupCommand, "Enter"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    console.error("SETUP_COMMAND failed:", (await new Response(proc.stderr).text()).trim());
  }
}

const claudePrompt = process.env.CLAUDE_PROMPT;
console.log("claude prompt", claudePrompt);
if (claudePrompt) {
  console.log("running claude prompt", claudePrompt);
  const claudeCommand = `claude --dangerously-skip-permissions --allow-dangerously-skip-permissions --effort high ${shellEscape(claudePrompt)}`;
  const proc = Bun.spawn(["tmux", "send-keys", "-t", "claude", claudeCommand, "Enter", "Enter"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    console.error("CLAUDE_PROMPT failed:", (await new Response(proc.stderr).text()).trim());
  }
} else {
  const claudeCommand = `claude --dangerously-skip-permissions --allow-dangerously-skip-permissions --effort high`;
  const proc = Bun.spawn(["tmux", "send-keys", "-t", "claude", claudeCommand, "Enter", "Enter"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    console.error("CLAUDE_PROMPT failed:", (await new Response(proc.stderr).text()).trim());
  }
}

async function fetchPr(fullPath: string): Promise<ClaudeInfo["pr"]> {
  try {
    const proc = Bun.spawn(["gh", "pr", "view", "--json", "number,url,title,headRefName"], {
      cwd: fullPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      return JSON.parse(out) as { number: number; url: string; title: string; headRefName: string };
    }
  } catch {
    // no PR or gh not available
  }

  return null;
}

async function getClaudeInfo(): Promise<ClaudeInfo> {
  const tmux = (args: string[]) =>
    Bun.spawn(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });

  const [p1, p2] = [
    tmux(["list-panes", "-t", "claude", "-F", "#{pane_current_command}"]),
    tmux(["list-panes", "-t", "claude", "-F", "#{pane_current_path}"]),
  ];
  const [paneCmd, rawPath] = await Promise.all([
    new Response(p1.stdout).text(),
    new Response(p2.stdout).text(),
  ]);
  await Promise.all([p1.exited, p2.exited]);

  const fullPath = rawPath.trim();
  const cwd = fullPath.replace(HOME, "~");
  const currentCommand = paneCmd.trim();

  if (currentCommand === "bash") {
    return { status: "idle", cwd, hostname: HOSTNAME, pr: null };
  }

  let status: Status;
  if (currentCommand === "claude") {
    const p3 = tmux(["capture-pane", "-p", "-S", "0", "-t", "claude"]);
    const paneOutput = await new Response(p3.stdout).text();
    await p3.exited;

    if (paneOutput.includes("frolicking")) {
      status = "working";
    } else if (paneOutput.includes("Type something.")) {
      status = "waiting";
    } else {
      status = "idle";
    }
  } else {
    status = "working";
  }

  const now = Date.now();
  const statusChanged = status !== prCache.lastStatus;
  const ttlExpired = now - prCache.lastFetchedAt > PR_TTL;

  if (statusChanged || ttlExpired) {
    prCache.pr = await fetchPr(fullPath);
    prCache.lastStatus = status;
    prCache.lastFetchedAt = now;
  }

  return { status, cwd, hostname: HOSTNAME, pr: prCache.pr };
}

const terminalWss = new WebSocketServer({ noServer: true });

terminalWss.on("connection", (ws, req) => {
  const { cmd, args } = getTerminalCommand(req);
  const pty = spawn(cmd, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    env: {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  const cleanup = () => {
    pty.kill();
  };

  pty.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "output", data }));
    }
  });

  pty.onExit(({ exitCode }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "exit", exitCode }));
    }
    ws.close();
  });

  ws.on("message", (message: RawData, isBinary) => {
    if (isBinary) {
      return;
    }

    try {
      const msg = JSON.parse(message.toString()) as
        | { type: "input"; data: string }
        | { type: "resize"; cols: number; rows: number };

      if (msg.type === "input") {
        pty.write(msg.data);
      } else if (msg.type === "resize") {
        pty.resize(msg.cols, msg.rows);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

const server = createServer(async (req, res) => {
  try {
    const url = getRequestUrl(req);

    if (url.pathname === MONITOR_STATUS_PATH) {
      await sendResponse(res, new Response(JSON.stringify(await getClaudeInfo()), {
        headers: { "Content-Type": "application/json" },
      }));
      return;
    }

    if (url.pathname === MONITOR_STOP_PATH) {
      await sendResponse(res, new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      }));
      Bun.spawn(["sudo", "kill", "-TERM", "1"]);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  } catch (error) {
    console.error("request handling failed", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = getRequestUrl(req);

  if (url.pathname === MONITOR_WS_PATH) {
    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      terminalWss.emit("connection", ws, req);
    });
    return;
  }

  socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
});

server.listen(PORT, () => {
  console.log(`monitor backend running at http://localhost:${PORT}${MONITOR_STATUS_PATH}`);
});
