pegasis0/claude-worker:base is created manually from kasmweb/ubuntu-jammy-dind:1.18.0

1. comment out start_gamepad, start_webcam, start_printer, start_pcscd, start_smartcard in /dockerstartup/vnc_startup.sh
2. in settings, change taskbar to bottom, reduce workspace count to 1, and remove workspace switcher from task bar
3. install papirus icon theme from https://github.com/PapirusDevelopmentTeam/papirus-icon-theme
4. download zorin blue light theme from https://github.com/ZorinOS/zorin-desktop-themes/releases/tag/5.2.2 and install to /usr/share/themes/
5. set terminal theme to white
6. run "ln -s /home/kasm-user/ Home" under ~/Desktop
7. reorganize desktop
8. change desktop background