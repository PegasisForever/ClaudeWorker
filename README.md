# Claude Worker Docker Image

`pegasis0/claude-worker:latest`

## Image Hierarchy

- `pegasis0/claude-worker:base` - Created manually from `kasmweb/ubuntu-jammy-dind:1.18.0` with the following customizations:
  1. In settings, change taskbar to bottom, reduce workspace count to 1, and remove workspace switcher from task bar
  2. Install papirus icon theme from https://github.com/PapirusDevelopmentTeam/papirus-icon-theme
  3. Download zorin blue light theme from https://github.com/ZorinOS/zorin-desktop-themes/releases/tag/5.2.2 and install to /usr/share/themes/
  4. Set terminal theme to white
  5. Run "ln -s /home/kasm-user/ Home" under ~/Desktop
  6. Reorganize desktop
  7. Change desktop background

- `pegasis0/claude-worker:latest` - Built on top of `:base` with Claude Code and additional automation. Includes:
  - Ubuntu 22.04 LTS with XFCE Desktop Environment, fixed 1080p resolution
  - Node.js 22.x LTS
  - Screen record skill for Claude
  - Computer use MCP
  - Chrome DevTools MCP
  - Pre-installed Claude Code and GitHub CLI
  - Docker in Docker

## Usage

This image (`pegasis0/claude-worker:latest`) is intended to be used as a **starting point**. End users should build their own images on top of this to add their development tools, project dependencies, and custom configurations.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for authenticating with Claude Code, get from `claude setup-token` |
| `GITHUB_TOKEN` | GitHub personal access token for repository operations |
| `SETUP_COMMAND` | Command to run before starting Claude Code (e.g., cloning repos, setting up environment) |
| `CLAUDE_PROMPT` | Initial prompt to send to Claude Code on startup |

## Example

```bash
docker run --rm -d \
  --shm-size=512m \
  -p 13000:13000 \
  --privileged \
  -e GITHUB_TOKEN=ghp_xxx \
  -e CLAUDE_CODE_OAUTH_TOKEN=sk-ant-xxx \
  -e SETUP_COMMAND='cd ~/Downloads && ls' \
  -e CLAUDE_PROMPT='hi' \
  --hostname worker1 \
  pegasis0/claude-worker:latest
```

Note: `--privileged` is required for Docker in Docker.

After the container is running, you can access the desktop at `http://localhost:13000/monitor`.