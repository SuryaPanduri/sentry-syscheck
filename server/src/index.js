// server/src/index.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { stringify } from 'csv-stringify'

const PORT = Number(process.env.PORT || 8080)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/syshealth'
const INGEST_SECRET = process.env.INGEST_SECRET || 'change-me'

// ---- DB ----
await mongoose.connect(MONGODB_URI)

const MachineSchema = new mongoose.Schema({
  machine_id: { type: String, index: true, unique: true },
  os: String,
  arch: String,
  hostname: String,
  agent_version: String,
  last_seen: { type: Date, index: true },
  heartbeat: { type: Boolean, default: false },   // <-- store heartbeat
  last_payload: { type: Object }
})
const Machine = mongoose.model('Machine', MachineSchema)

// ---- App ----
const app = express()
app.use(helmet())
app.use(cors())

// IMPORTANT: handle /v1/ingest with RAW body first (for HMAC)
function verifyHmac(secret, rawBuf, sigHex) {
  if (!sigHex) return false
  const mac = crypto.createHmac('sha256', secret).update(rawBuf).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sigHex))
  } catch {
    return false
  }
}

app.post('/v1/ingest', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  const sig = req.header('X-Signature') || ''
  const raw = req.body // Buffer

  if (!verifyHmac(INGEST_SECRET, raw, sig)) {
    return res.status(401).send('invalid signature')
  }

  let data
  try {
    data = JSON.parse(raw.toString('utf8'))
  } catch {
    return res.status(400).send('invalid json')
  }

  if (!data?.machine_id || !data?.checks) {
    return res.status(400).send('missing fields')
  }

  // Normalize fields we persist
  const doc = {
    machine_id: data.machine_id,
    os: data.os,
    arch: data.arch,
    hostname: data.hostname,
    agent_version: data.agent_version,
    last_seen: new Date(data.timestamp || Date.now()),
    heartbeat: !!data.heartbeat,          // <-- keep the flag
    last_payload: data
  }

  await Machine.findOneAndUpdate(
    { machine_id: data.machine_id },
    doc,
    { upsert: true, setDefaultsOnInsert: true }
  )

  res.json({ ok: true })
})

// JSON parser AFTER ingest (for read endpoints)
app.use(express.json({ limit: '256kb' }))

app.get('/v1/machines', async (req, res) => {
  const { os, status, q } = req.query
  const docs = await Machine.find({}).sort({ last_seen: -1 }).lean()

  const filtered = docs.filter(d => {
    if (os && d.os !== os) return false
    if (q && !(String(d.hostname || '').toLowerCase().includes(String(q).toLowerCase()) || String(d.machine_id).includes(q))) return false
    if (status) {
      const checks = d.last_payload?.checks || {}
      const any = Object.values(checks).some(c => c?.status === status)
      if (!any) return false
    }
    return true
  })

  const out = filtered.map(d => ({
    machine_id: d.machine_id,
    os: d.os,
    arch: d.arch,
    hostname: d.hostname,
    agent_version: d.agent_version,
    last_seen: d.last_seen,
    heartbeat: !!d.heartbeat,                 // <-- return it
    checks: d.last_payload?.checks
  }))
  res.json(out)
})

app.get('/v1/machines/:id', async (req, res) => {
  const d = await Machine.findOne({ machine_id: req.params.id }).lean()
  if (!d) return res.status(404).send('not found')
  res.json({
    machine_id: d.machine_id,
    os: d.os,
    arch: d.arch,
    hostname: d.hostname,
    agent_version: d.agent_version,
    last_seen: d.last_seen,
    heartbeat: !!d.heartbeat,               // <-- return it
    checks: d.last_payload?.checks
  })
})

app.get('/v1/export.csv', async (req, res) => {
  const docs = await Machine.find({}).sort({ last_seen: -1 }).lean()
  const rows = [
    ['machine_id','os','arch','hostname','agent_version','last_seen','heartbeat','disk_encryption','os_update_status','antivirus','inactivity_sleep'],
    ...docs.map(d => {
      const c = d.last_payload?.checks || {}
      return [
        d.machine_id, d.os, d.arch, d.hostname, d.agent_version, (d.last_seen?.toISOString?.() || ''), d.heartbeat ? '1' : '0',
        c?.disk_encryption?.status || 'unknown',
        c?.os_update_status?.status || 'unknown',
        c?.antivirus?.status || 'unknown',
        c?.inactivity_sleep?.status || 'unknown'
      ]
    })
  ]
  stringify(rows, (err, csv) => {
    if (err) return res.status(500).send('csv error')
    res.setHeader('Content-Type', 'text/csv')
    res.send(csv)
  })
})

app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))