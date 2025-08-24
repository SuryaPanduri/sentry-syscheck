SysHealth – Cross-Platform System Utility + Admin Dashboard

Overview
--------
This project implements a cross-platform system utility (agent) that reports machine health to a central backend API (server), which is visualized in a web dashboard (frontend).

Features
--------
Agent (utility):
- Cross-platform binaries (macOS / Linux / Windows).
- Periodically checks:
  - Disk encryption status
  - OS update status
  - Antivirus presence
  - Inactivity sleep settings
- Runs in background (daemon/service).
- Reports changes immediately, and sends heartbeat messages if nothing changes (to prove it’s alive).
- Low resource usage.

Server (API):
- Secure HMAC signature validation.
- Stores machine records in MongoDB.
- Endpoints:
  - POST /v1/ingest – receive agent data
  - GET /v1/machines – list all machines
  - GET /v1/machines/:id – detail for a machine
  - GET /v1/export.csv – CSV export

Dashboard (frontend):
- Built with React + Vite.
- Lists all reporting machines.
- Shows last check-in time and system status.
- Highlights issues.
- Pulse animation = agent alive, Offline label = agent stale.
- Filter/search, CSV export.

Project Structure
-----------------
sentry-syshealth/
  ├── agent/                # Cross-platform agent
  │   ├── dist/             # Built binaries (macOS/Linux/Windows)
  │   ├── src/              # Agent source code (system checks, reporting logic)
  │   ├── package.json      # Build configuration (pkg)
  │   └── .env.example      # Example agent environment file
  │
  ├── server/               # Backend API (Express + MongoDB)
  │   ├── src/              # API source code (endpoints, DB models, HMAC)
  │   ├── package.json      # API scripts and dependencies
  │   └── .env.example      # Example server environment variables
  │
  ├── dashboard/            # Frontend Dashboard (React + Vite)
  │   ├── src/              # UI components, pages
  │   ├── package.json      # Frontend scripts and dependencies
  │   └── .env.example      # Example dashboard environment variables
  │
  └── README.md             # Project documentation

Quick Start (Local Dev)
-----------------------
1. Start the Server
   cd server
   npm install
   cp .env.example .env   # edit with your MongoDB + secret
   npm start

   .env:
   PORT=8080
   MONGODB_URI=mongodb+srv://<your-atlas-uri>
   INGEST_SECRET=<your-secret>

2. Start the Dashboard
   cd dashboard
   npm install
   cp .env.example .env   # set API URL
   npm run dev

   .env:
   VITE_API_URL=http://localhost:8080
   VITE_HEARTBEAT_MINUTES=60

3. Run the Agent (local binary)
   cd agent
   npm install
   npm run build
   cp .env dist/.env
   ./dist/syshealth-agent-macos-arm64 --once   # one-shot report
   ./dist/syshealth-agent-macos-arm64          # daemon mode

   .env:
   SERVER_URL=http://localhost:8080
   INGEST_SECRET=<your-secret>
   INTERVAL_MINUTES=20
   HEARTBEAT_MINUTES=60

Deployment
----------
Server → Render
- Root directory: server
- Build Command: npm ci
- Start Command: npm start
- Environment:
  PORT=8080
  MONGODB_URI=<your Atlas URI>
  INGEST_SECRET=<same secret as agent>
  CORS_ORIGIN=https://<your-vercel-app>.vercel.app

Dashboard → Vercel
- Root directory: dashboard
- Build Command: npm run build
- Output: dist
- Environment:
  VITE_API_URL=https://<your-render-app>.onrender.com
  VITE_HEARTBEAT_MINUTES=60

Agent → Machines
- Copy the platform-specific binary from agent/dist/ and a .env file.
- macOS (LaunchAgent), Linux (systemd), Windows (Task Scheduler) setup instructions below.

Running the Agent as a Background Service
-----------------------------------------

macOS (LaunchAgent)
1. Copy binary + .env into ~/SysHealth/
2. Create ~/Library/LaunchAgents/com.syshealth.agent.plist:
   <plist version="1.0"><dict>
     <key>Label</key><string>com.syshealth.agent</string>
     <key>ProgramArguments</key><array>
       <string>/Users/USERNAME/SysHealth/syshealth-agent-macos-arm64</string>
     </array>
     <key>WorkingDirectory</key><string>/Users/USERNAME/SysHealth</string>
     <key>RunAtLoad</key><true/>
     <key>KeepAlive</key><true/>
     <key>StandardOutPath</key><string>/tmp/syshealth-agent.out.log</string>
     <key>StandardErrorPath</key><string>/tmp/syshealth-agent.err.log</string>
   </dict></plist>
3. Load it:
   launchctl load ~/Library/LaunchAgents/com.syshealth.agent.plist
   launchctl start com.syshealth.agent

Linux (systemd)
Create /etc/systemd/system/syshealth-agent.service:
   [Unit]
   Description=SysHealth Agent
   After=network-online.target

   [Service]
   WorkingDirectory=/opt/syshealth
   ExecStart=/opt/syshealth/syshealth-agent-linux-x64
   Restart=always
   EnvironmentFile=/opt/syshealth/.env

   [Install]
   WantedBy=multi-user.target

Enable:
   sudo systemctl daemon-reload
   sudo systemctl enable --now syshealth-agent

Windows (Task Scheduler)
Run PowerShell as Administrator:
   $exe = "C:\Program Files\SysHealth\syshealth-agent-win-x64.exe"
   $act = New-ScheduledTaskAction -Execute $exe
   $tr1 = New-ScheduledTaskTrigger -AtLogOn
   Register-ScheduledTask -TaskName "SysHealth Agent" -Action $act -Trigger $tr1
   Start-ScheduledTask -TaskName "SysHealth Agent"

Demo Flow
---------
1. Deploy API (Render) + Dashboard (Vercel).
2. Run Agent binary (macOS/Linux/Windows).
3. Open Dashboard — see machine appear with OS, checks, last check-in.
4. Pulse blinks while alive; turns Offline if agent stops reporting.
5. Export CSV if needed.

Security
--------
- Agents sign payloads with HMAC (INGEST_SECRET).
- Server verifies signatures before accepting data.
- Only minimal machine info + system check results are sent.
- API is HTTPS (via Render).
- CORS restricted to dashboard domain in production.
