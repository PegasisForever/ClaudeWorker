import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  cmd: string;
}

const MONITOR_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DRACULA_TERMINAL_THEME = {
  background: "#282a36",
  foreground: "#f8f8f2",
  cursor: "#f8f8f2",
  cursorAccent: "#282a36",
  selectionBackground: "#44475a",
  selectionInactiveBackground: "#44475a88",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function isPrimaryShortcut(event: KeyboardEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}

async function writeClipboardText(text: string): Promise<void> {
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

function getWsUrl(cmd: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${MONITOR_BASE}/ws?cmd=${encodeURIComponent(cmd)}`;
}

export default function TerminalPage({ cmd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: DRACULA_TERMINAL_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current!);
    fitAddon.fit();
    term.focus();

    containerRef.current?.style.setProperty("background", DRACULA_TERMINAL_THEME.background);

    const handleCopy = () => {
      const selection = term.getSelection();
      if (!selection) {
        return false;
      }

      void writeClipboardText(selection);
      return true;
    };

    const handlePaste = async (text?: string) => {
      const clipboardText = text ?? (await readClipboardText());
      if (!clipboardText) {
        return;
      }

      term.focus();
      term.paste(clipboardText);
    };

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryShortcut = isPrimaryShortcut(event);
      const isCopyShortcut =
        !event.altKey &&
        term.hasSelection() &&
        ((hasPrimaryShortcut && key === "c") ||
          (event.ctrlKey && !event.metaKey && key === "insert"));
      const isPasteShortcut =
        !event.altKey &&
        ((hasPrimaryShortcut && key === "v") ||
          (event.ctrlKey && event.shiftKey && key === "v") ||
          (!event.ctrlKey && !event.metaKey && event.shiftKey && key === "insert"));

      if (isCopyShortcut) {
        event.preventDefault();
        event.stopPropagation();
        handleCopy();
        return false;
      }

      if (isPasteShortcut) {
        event.preventDefault();
        event.stopPropagation();
        void handlePaste();
        return false;
      }

      return true;
    });

    const terminalTextarea = term.textarea;
    const onCopy = (event: ClipboardEvent) => {
      if (!handleCopy()) {
        return;
      }

      const selection = term.getSelection();
      event.preventDefault();
      event.clipboardData?.setData("text/plain", selection);
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (!text) {
        return;
      }

      event.preventDefault();
      void handlePaste(text);
    };

    terminalTextarea?.addEventListener("copy", onCopy);
    terminalTextarea?.addEventListener("paste", onPaste);

    const ws = new WebSocket(getWsUrl(cmd));

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "output") {
          term.write(msg.data);
        } else if (msg.type === "exit") {
          term.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      term.write("\r\n[Connection closed]\r\n");
    };

    ws.onerror = () => {
      term.write("\r\n[WebSocket error]\r\n");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    resizeObserver.observe(containerRef.current!);

    const onWindowResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      terminalTextarea?.removeEventListener("copy", onCopy);
      terminalTextarea?.removeEventListener("paste", onPaste);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      ws.close();
      term.dispose();
    };
  }, [cmd]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-terminal-bg"
    />
  );
}
