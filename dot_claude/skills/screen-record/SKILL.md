# Screen Record Skill

To record the screen using ffmpeg (X11, display :1, 1920x1080):

1. **Start recording:**
   ```bash
   ffmpeg -f x11grab -framerate 15 -video_size 1920x1080 -i :1.0 -c:v libx264 -preset ultrafast -pix_fmt yuv420p /path/to/output.mp4
   ```
   Run this in the background (`run_in_background`) so you can continue working.

2. **Do your actions** — tool preference order:
   1. **computer-use MCP** (preferred)
   2. **chrome-devtools MCP** (if computer-use is insufficient)
   3. **terminal commands** (last resort)

3. **Stop recording:**
   ```bash
   pkill -INT ffmpeg
   ```
   Use `SIGINT` (`-INT`) for a clean stop — this lets ffmpeg finalize the mp4 container properly. Do NOT use `SIGKILL` or the file will be corrupt.
