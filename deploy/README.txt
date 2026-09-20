Arbor - self-hosted project tracker
===================================
Windows service "Arbor" (NSSM). Starts with Windows, runs even when signed out.
Listens on http://127.0.0.1:5240; Caddy serves it as https://arbor.<your domain>
(reachable from your devices over Tailscale). install.cmd prints the exact
address it set up.

FOLDERS
  app\       the program (replaced by every deploy from the Arbor repo)
  data\      arbor.sqlite (everything you entered), backups\ (one copy per day,
             last 14 kept), arbor.log
  install.cmd     first-time setup / change the passcode (double-click)
  check.cmd       show what setup would do, change nothing
  uninstall.cmd   remove the service (keeps data)

UPDATING
  In the repo: npm run deploy
  The client updates immediately; the server restarts itself when its code
  changes. Open apps pick up the new version on the next launch.

PHONE
  Tailscale on, open your Arbor address in Chrome, menu > Add to Home screen.
  It opens full-screen, works offline, and syncs when back online.

RESTORE A BACKUP
  Stop the service (services.msc > Arbor > Stop), copy a file from
  data\backups over data\arbor.sqlite (delete arbor.sqlite-wal/-shm if present),
  start the service. On each device: Settings > Data & sync > Reset this device.
