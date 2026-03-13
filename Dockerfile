FROM pegasis0/claude-worker:base

USER kasm-user

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - 
RUN sudo apt-get update && sudo apt-get install -y \
    tmux \
    build-essential \
    git \
    ripgrep \
    nginx \
    nodejs \
    ffmpeg

# patched kasmvncserver for running in iframe & default local scaling
RUN wget https://github.com/PegasisForever/KasmVNC/releases/download/v1.3.4-pegasis/kasmvncserver_jammy_1.3.4-pegasis_amd64.deb && \
    sudo env DEBIAN_FRONTEND=noninteractive dpkg --force-confdef --force-confold -i kasmvncserver_jammy_1.3.4-pegasis_amd64.deb && \
    rm kasmvncserver_jammy_1.3.4-pegasis_amd64.deb

# patched vnc_startup.sh and config to not use ssl
COPY vnc_startup.sh /dockerstartup/vnc_startup.sh
COPY kasmvnc.yaml /etc/kasmvnc/kasmvnc.yaml
RUN sudo rm -f /etc/nginx/sites-enabled/default

ENV PATH="/home/kasm-user/.local/bin:$PATH"

# set default resolution and frame rate, and disable basic auth
ENV VNC_RESOLUTION=1920x1080
ENV MAX_FRAME_RATE=15
ENV VNCOPTIONS="${VNCOPTIONS} -disableBasicAuth"

# GH CLI
# auth using GITHUB_TOKEN
RUN (type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
    && sudo mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && sudo mkdir -p -m 755 /etc/apt/sources.list.d \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && sudo apt update \
    && sudo apt install gh -y

# Claude
# auth by setting CLAUDE_CODE_OAUTH_TOKEN env (get from `claude setup-token`)
RUN curl -fsSL https://claude.ai/install.sh | bash
COPY dot_claude /home/kasm-user/.claude
COPY claude.json /home/kasm-user/.claude.json

# Monitor Daemon
COPY monitor/monitor /opt/monitor/bin/monitor
COPY monitor/packages/frontend/dist /opt/monitor/www/monitor
RUN sudo chmod +x /opt/monitor/bin/monitor
# kasm docker cleans /tmp on startup, we need to wait until the flag disappears
RUN touch /tmp/monitor_flag

# General config
RUN sudo usermod --shell /bin/bash kasm-user
COPY tmux.conf /home/kasm-user/.tmux.conf
COPY bashrc /home/kasm-user/.bashrc
RUN rm /home/kasm-user/.bash_history
COPY nginx-monitor.conf /etc/nginx/conf.d/monitor.conf
