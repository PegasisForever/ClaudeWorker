import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  cmd: string;
}

const MONITOR_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      theme: {
        background: "#ffffff",
        foreground: "#1a1a1a",
        cursor: "#333333",
        cursorAccent: "#ffffff",
        selectionBackground: "#b3d4ff",
        black: "#000000",
        red: "#c0392b",
        green: "#27ae60",
        yellow: "#d35400",
        blue: "#2980b9",
        magenta: "#8e44ad",
        cyan: "#16a085",
        white: "#808080",
        brightBlack: "#555555",
        brightRed: "#e74c3c",
        brightGreen: "#2ecc71",
        brightYellow: "#e67e22",
        brightBlue: "#3498db",
        brightMagenta: "#9b59b6",
        brightCyan: "#1abc9c",
        brightWhite: "#1a1a1a",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current!);
    fitAddon.fit();
    term.focus();

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
      style={{ width: "100%", height: "100%", background: "#ffffff" }}
    />
  );
}
