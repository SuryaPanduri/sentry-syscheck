# 📊 SysHealth – Cross-Platform System Utility + Admin Dashboard

> Simple, secure, cross-platform compliance monitoring for macOS, Linux, and Windows.

<p align="center">
  <img alt="Agent" src="https://img.shields.io/badge/Agent-macOS%20%7C%20Linux%20%7C%20Windows-4c9aff">
  <img alt="Backend" src="https://img.shields.io/badge/Server-Express%20%2B%20MongoDB-10b981">
  <img alt="Frontend" src="https://img.shields.io/badge/Dashboard-React%20%2B%20Vite-6366f1">
  <img alt="Security" src="https://img.shields.io/badge/Security-HMAC--signed%20ingest-f97316">
</p>

---

## 🌍 Overview
**SysHealth** consists of three parts:

- **Agent** → Runs on machines and periodically reports system health.  
- **Server (API)** → Validates, ingests, and stores reports in MongoDB.  
- **Dashboard (Frontend)** → React + Vite app that visualizes machine health in real time.  

---

## ✨ Features

### 🖥 Agent (Utility)
- Cross-platform binaries (**macOS / Linux / Windows**)
- Periodic health checks:
  - Disk encryption status
  - OS update status
  - Antivirus presence
  - Inactivity sleep settings
- Runs as a background daemon/service
- Immediate reporting + heartbeat messages
- Lightweight (low resource usage)

### ⚙️ Server (API)
- Built with **Express + MongoDB**
- Secure **HMAC signature validation**
- Endpoints:
  - `POST /v1/ingest` – receive agent data
  - `GET /v1/machines` – list all machines
  - `GET /v1/machines/:id` – machine detail
  - `GET /v1/export.csv` – CSV export

### 📊 Dashboard (Frontend)
- Built with **React + Vite**
- Features:
  - Lists all reporting machines
  - Shows **last check-in time**
  - Highlights issues (disk, updates, antivirus)
  - Pulse animation = **agent alive**
  - Offline label = stale agent
  - Filter/search, **CSV export**

---

## 📂 Project Structure

```text
sentry-syshealth/
├── agent/                 # Cross-platform agent
│   ├── dist/              # Built binaries (macOS/Linux/Windows)
│   ├── src/               # System checks, reporting logic
│   ├── package.json       # Build config (pkg)
│   └── .env.example       # Agent env example
│
├── server/                # Backend API (Express + MongoDB)
│   ├── src/               # Endpoints, DB models, HMAC
│   ├── package.json       # API scripts & deps
│   └── .env.example       # Server env example
│
├── dashboard/             # Frontend Dashboard (React + Vite)
│   ├── src/               # UI components, pages
│   ├── package.json       # Frontend scripts & deps
│   └── .env.example       # Dashboard env example
│
└── README.md              # Project documentation
```

🚀 Quick Start (Local Development)

1️⃣ Start the Server
```text
cd server
npm install
cp .env.example .env   # edit with your MongoDB + secret
npm start
```

.env
```text
PORT=8080
MONGODB_URI=mongodb+srv://<your-atlas-uri>
INGEST_SECRET=<your-secret>
```

2️⃣ Start the Dashboard
```text
cd dashboard
npm install
cp .env.example .env   # set API URL
npm run dev
```

.env
```text
VITE_API_URL=http://localhost:8080
VITE_HEARTBEAT_MINUTES=60
```

3️⃣ Run the Agent (local binary)
```text
cd agent
npm install
npm run build
cp .env dist/.env
./dist/syshealth-agent-macos-arm64 --once   # one-shot report
./dist/syshealth-agent-macos-arm64          # daemon mode
```

.env
```text
SERVER_URL=http://localhost:8080
INGEST_SECRET=<your-secret>
INTERVAL_MINUTES=20
HEARTBEAT_MINUTES=60
```

🌐 Deployment

🖥 Server → Render
```text
Root directory: server
Build Command: npm ci
Start Command: npm start
```
Environment Variables
```text
PORT=8080
MONGODB_URI=<your Atlas URI>
INGEST_SECRET=<same secret as agent>
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
```

📊 Dashboard → Vercel
```text
Root directory: dashboard
Build Command: npm run build
Output: dist
```
```text
Environment Variables
VITE_API_URL=https://<your-render-app>.onrender.com
VITE_HEARTBEAT_MINUTES=60
```

🤖 Agent → Machines
	•	Copy binary from agent/dist/ and .env file
	•	Configure as background service per OS
 

🔄 Running the Agent as a Background Service

🍏 macOS (LaunchAgent)
```text
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
```
```text
launchctl load ~/Library/LaunchAgents/com.syshealth.agent.plist
launchctl start com.syshealth.agent
```

🐧 Linux (systemd)
```text
/etc/systemd/system/syshealth-agent.service
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
```
```text
sudo systemctl daemon-reload
sudo systemctl enable --now syshealth-agent
```

🪟 Windows (Task Scheduler)
```text
$exe = "C:\Program Files\SysHealth\syshealth-agent-win-x64.exe"
$act = New-ScheduledTaskAction -Execute $exe
$tr1 = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "SysHealth Agent" -Action $act -Trigger $tr1
Start-ScheduledTask -TaskName "SysHealth Agent"
```

🎯 Demo Flow

	1.	Deploy API (Render) + Dashboard (Vercel)
	2.	Run Agent binary (macOS/Linux/Windows)
	3.	Open Dashboard → see machine appear with OS, checks, last check-in
	4.	Pulse = Alive ✅ | Offline = Not reporting ❌
	5.	Export CSV if needed

⸻

🔐 Security

	•	Agents sign payloads with HMAC (INGEST_SECRET)
	•	Server verifies before accepting
	•	Only minimal machine info + health results are sent
	•	API runs over HTTPS
	•	CORS restricted to dashboard domain

⸻
