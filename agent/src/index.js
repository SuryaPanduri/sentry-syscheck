import 'dotenv/config';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8080';
const INGEST_SECRET = process.env.INGEST_SECRET || 'change-me';
const INTERVAL_MINUTES = Number(process.env.INTERVAL_MINUTES || 20);
const HEARTBEAT_MINUTES = Number(process.env.HEARTBEAT_MINUTES || 60); // heartbeat window
const VERSION = '1.0.0';

const stateDir = join(os.homedir(), '.syshealth-agent');
const hashPath = join(stateDir, 'last_hash');
const lastSentPath = join(stateDir, 'last_sent_at'); // heartbeat timestamp

function platform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function execCmd(cmd, args, timeout = 8000, shell = false) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, shell }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '') + (stderr || '') });
    });
  });
}

/* -------------------- checks -------------------- */
async function checkDiskEncryption() {
  try {
    switch (platform()) {
      case 'darwin': {
        const r = await execCmd('fdesetup', ['status'], 6000);
        if (!r.ok) return { status: 'unknown', details: {} };
        const on = r.out.includes('FileVault is On.');
        return { status: on ? 'ok' : 'issue', details: { tool: 'fdesetup' } };
      }
      case 'windows': {
        const r = await execCmd('cmd', ['/C', 'manage-bde -status'], 8000);
        if (!r.ok) return { status: 'unknown', details: {} };
        const low = r.out.toLowerCase();
        const full = low.includes('percentage encrypted: 100%');
        const any = low.includes('conversion status');
        return { status: full ? 'ok' : any ? 'issue' : 'unknown', details: { tool: 'manage-bde' } };
      }
      default: {
        const r = await execCmd('bash', ['-lc', "lsblk -o NAME,TYPE | grep -q crypt && echo enc || echo no"], 5000, true);
        if (!r.ok) return { status: 'unknown', details: {} };
        return { status: r.out.trim() === 'enc' ? 'ok' : 'issue', details: { tool: 'lsblk' } };
      }
    }
  } catch {
    return { status: 'unknown', details: {} };
  }
}

async function checkOSUpdates() {
  try {
    switch (platform()) {
      case 'darwin': {
        const r = await execCmd('softwareupdate', ['-l'], 15000);
        if (!r.ok) return { status: 'unknown', details: {} };
        const none = r.out.includes('No new software available.');
        return { status: none ? 'ok' : 'issue', details: { updates: none ? 'none' : 'available' } };
      }
      case 'windows': {
        const r = await execCmd('powershell', ['-Command', '(New-Object -ComObject Microsoft.Update.AutoUpdate).Results.LastSearchSuccessDate'], 12000);
        return { status: r.ok && r.out.trim() ? 'ok' : 'issue', details: { lastSearch: r.out.trim().slice(0, 64) } };
      }
      default: {
        const r = await execCmd('bash', ['-lc', "command -v apt-get >/dev/null && apt-get -s -o Debug::NoLocking=true upgrade | grep -E '^[0-9]+ upgraded' || echo NA"], 15000, true);
        if (!r.ok) return { status: 'unknown', details: {} };
        return { status: r.out.includes('0 upgraded') ? 'ok' : 'issue', details: { summary: r.out.trim().slice(0, 80) } };
      }
    }
  } catch {
    return { status: 'unknown', details: {} };
  }
}

async function checkAntivirus() {
  try {
    switch (platform()) {
      case 'darwin':
        return { status: 'ok', details: { engine: 'XProtect' } };
      case 'windows': {
        const r = await execCmd('powershell', ['-Command', 'Get-MpComputerStatus | Select-Object -ExpandProperty AMServiceEnabled'], 8000);
        if (!r.ok) return { status: 'unknown', details: {} };
        const on = r.out.toLowerCase().includes('true');
        return { status: on ? 'ok' : 'issue', details: { engine: 'Defender' } };
      }
      default: {
        const r = await execCmd('bash', ['-lc', "systemctl list-unit-files | egrep -i 'clamav|sophos|symantec|falcon|endpoint' || true"], 6000, true);
        return { status: r.out.trim() ? 'ok' : 'issue', details: { found: r.out.trim() ? 'yes' : 'no' } };
      }
    }
  } catch {
    return { status: 'unknown', details: {} };
  }
}

async function checkInactivitySleep() {
  try {
    switch (platform()) {
      case 'darwin': {
        const r = await execCmd('pmset', ['-g'], 6000);
        if (!r.ok) return { status: 'unknown', details: {} };
        const m = (r.out.match(/\b(displaysleep|sleep)\s+(\d+)/g) || []).join(' ');
        const nums = (m.match(/\d+/g) || []).map(Number);
        const ok = nums.length && nums.some((v) => v <= 10);
        return { status: ok ? 'ok' : nums.length ? 'issue' : 'unknown', details: { parsed: m } };
      }
      case 'windows': {
        const r = await execCmd('powershell', ['-Command', "(powercfg -q | Select-String -Pattern 'VIDEOIDLE|STANDBYIDLE').Line"], 8000);
        return { status: 'unknown', details: { raw: r.out.slice(0, 120) } };
      }
      default: {
        const r = await execCmd('bash', ['-lc', "grep -E 'IdleAction|IdleActionSec' /etc/systemd/logind.conf || true"], 4000, true);
        return { status: r.out ? 'ok' : 'issue', details: { logind: r.out ? 'configured' : 'default' } };
      }
    }
  } catch {
    return { status: 'unknown', details: {} };
  }
}

/* -------------------- util + state -------------------- */
function hmacHex(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
function hashHex(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}
async function hasChanged(hash) {
  try {
    const prev = (await readFile(hashPath, 'utf8')).trim();
    return prev !== hash;
  } catch {
    return true;
  }
}
async function persistHash(hash) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(hashPath, hash, 'utf8');
}
async function getLastSentAt() {
  try {
    return Number(await readFile(lastSentPath, 'utf8'));
  } catch {
    return 0;
  }
}
async function persistLastSent(ts) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(lastSentPath, String(ts), 'utf8');
}

/* -------------------- HTTP (no fetch) -------------------- */
function postJSON(u, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: 10000,
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.write(body);
    req.end();
  });
}

/* -------------------- core flow -------------------- */
async function collect() {
  return {
    machine_id: `${os.hostname()}|${platform()}|${process.env.USER || process.env.USERNAME || 'user'}`,
    os: platform(),
    arch: process.arch,
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
    agent_version: VERSION,
    checks: {
      disk_encryption: await checkDiskEncryption(),
      os_update_status: await checkOSUpdates(),
      antivirus: await checkAntivirus(),
      inactivity_sleep: await checkInactivitySleep(),
    },
  };
}

async function postIfChanged(rep) {
  // Build a stable core (exclude volatile timestamp)
  const { timestamp, ...core } = rep;
  const coreBody = JSON.stringify(core);
  const hash = hashHex(coreBody);

  const lastSent = await getLastSentAt();
  const ageMs = Date.now() - lastSent;
  const heartbeatDue = ageMs > HEARTBEAT_MINUTES * 60_000;

  const changed = await hasChanged(hash);
  if (!changed && !heartbeatDue) return; // skip if no change and heartbeat not due

  // mark heartbeat only when no-change AND due
  const payload = { ...rep, heartbeat: !changed && heartbeatDue };
  const body = JSON.stringify(payload);

  const sig = hmacHex(INGEST_SECRET, body);
  const res = await postJSON(
    `${SERVER_URL}/v1/ingest`,
    { 'X-Machine-Id': rep.machine_id, 'X-Signature': sig },
    body
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`ingest failed: ${res.status} ${res.text}`);
  }
  await persistHash(hash);
  await persistLastSent(Date.now());
}

async function cycle() {
  try {
    const rep = await collect();
    await postIfChanged(rep);
  } catch (e) {
    console.error('[cycle]', e.message || e);
  }
}

async function main() {
  // initial jitter 0–2 min
  await wait(Math.floor(Math.random() * 120000));
  while (true) {
    await cycle();
    const mins = INTERVAL_MINUTES + Math.floor(Math.random() * 5);
    await wait(mins * 60000);
  }
}

if (process.argv.includes('--once')) {
  collect().then((r) => console.log(JSON.stringify(r, null, 2)));
} else {
  main();
}