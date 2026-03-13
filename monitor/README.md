# ClaudeMonitor

A lightweight web-based monitor for Claude Code sessions running in tmux. Provides a browser UI with terminal access, status indicators, and PR tracking.

## Features

- **Terminal pages** — full xterm.js terminals connected via WebSocket/PTY to tmux sessions
- **Status indicator** — polls the `claude` tmux session every second; shows `Idle`, `Waiting`, or `Working`
- **Current directory** — shows the active working directory of the Claude session
- **PR tracking** — auto-detects the open GitHub PR for the current branch via `gh` CLI
- **Screen page** — embeds a noVNC viewer (port 6901) for desktop access
- **Split runtime** — Bun backend serves monitor APIs/WebSockets while `nginx` serves the frontend and proxies the VNC UI

## Requirements

- [Bun](https://bun.sh) v1.1+
- [tmux](https://github.com/tmux/tmux)
- [gh](https://cli.github.com) (optional, for PR tracking)

## Development

```bash
# Install dependencies
bun install

# Start the backend dev server (with hot reload) on port 13001
bun dev
```

The frontend is served by Vite at `http://localhost:5173` with HMR. Vite proxies `/monitor/api/status` and `/monitor/ws` to the backend on `http://localhost:13001`.

To run the frontend separately:
```bash
cd packages/frontend
bun run dev
```

## Build

```bash
bun run build
```

This will:
1. Install all dependencies
2. Build the frontend with Vite
3. Compile the backend into a single executable: `./monitor`
4. Leave the frontend assets in `./packages/frontend/dist` for `nginx` to serve

## Usage

```bash
./monitor
# → monitor backend running at http://localhost:13001/monitor/api/status
```

The port can be overridden with the `PORT` environment variable:
```bash
PORT=8080 ./monitor
```

## Project Structure

```
monitor/
├── packages/
│   ├── backend/          # Bun HTTP + WebSocket server
│   │   └── src/
│   │       └── index.ts          # Main server (PTY, /monitor/api/status, /monitor/ws)
│   └── frontend/         # React + Vite frontend
│       └── src/
│           ├── App.tsx           # Layout, routing, status polling
│           ├── TerminalPage.tsx  # xterm.js terminal connected via WebSocket
│           └── App.css           # Sidebar styles
├── scripts/
│   └── build.ts          # Build pipeline script
└── package.json          # Bun workspace root
```

## How status detection works

The backend inspects the `claude` tmux session:

1. If the pane's current command is `bash` → **Idle**
2. If the captured pane output contains `gooning` → **Working**
3. Otherwise → **Waiting**
