const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// anon client (verify user tokens)
const supabaseAnon =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

// service client (server privileged operations)
const supabaseService =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/config", (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Missing Supabase env vars on server",
      required: ["SUPABASE_URL", "SUPABASE_ANON_KEY"]
    });
  }
  res.json({ SUPABASE_URL, SUPABASE_ANON_KEY });
});

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);

  if (!match) return res.status(401).json({ ok: false, error: "Missing Bearer token" });
  if (!supabaseAnon) return res.status(500).json({ ok: false, error: "Supabase not configured" });

  const token = match[1];
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ ok: false, error: "Invalid session" });

  req.user = data.user;
  next();
}

// -------- Enrollment: create code (owner must be logged in) --------
function makeCode() {
  // short human-friendly code, e.g. 8 chars
  return crypto.randomBytes(5).toString("base64url").slice(0, 8).toUpperCase();
}

app.post("/enroll/create", requireAuth, async (req, res) => {
  if (!supabaseAnon) return res.status(500).json({ ok: false, error: "Supabase anon client missing" });

  const code = makeCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  // Insert using user context by using the user's token against anon key (RLS will allow)
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { error } = await sbUser.from("enrollments").insert({
    owner_id: req.user.id,
    code,
    expires_at: expiresAt
  });

  if (error) return res.status(400).json({ ok: false, error: error.message });

  res.json({
    ok: true,
    code,
    expires_at: expiresAt,
    enroll_url: `/enroll.html?code=${encodeURIComponent(code)}`
  });
});

// -------- Enrollment: claim code (public web page) --------
app.post("/enroll/claim", async (req, res) => {
  const { code, device_name, platform } = req.body || {};
  const c = (code || "").toString().trim().toUpperCase();

  if (!c) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!supabaseService) return res.status(500).json({ ok: false, error: "Server role key not set" });

  // Look up enrollment
  const { data: enr, error: enrErr } = await supabaseService
    .from("enrollments")
    .select("*")
    .eq("code", c)
    .single();

  if (enrErr || !enr) return res.status(400).json({ ok: false, error: "Invalid code" });
  if (enr.claimed_at) return res.status(400).json({ ok: false, error: "Code already claimed" });

  const now = new Date();
  if (now.toISOString() > enr.expires_at) return res.status(400).json({ ok: false, error: "Code expired" });

  const name = (device_name || "New Device").toString().slice(0, 80);
  const plat = (platform || "ios").toString().slice(0, 20);

  // Create device
  const { data: device, error: devErr } = await supabaseService
    .from("devices")
    .insert({
      owner_id: enr.owner_id,
      name,
      platform: plat
    })
    .select("*")
    .single();

  if (devErr) return res.status(400).json({ ok: false, error: devErr.message });

  // Mark enrollment claimed
  const { error: updErr } = await supabaseService
    .from("enrollments")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_device_id: device.id
    })
    .eq("id", enr.id);

  if (updErr) return res.status(400).json({ ok: false, error: updErr.message });

  // Write an event
  await supabaseService.from("events").insert({
    owner_id: enr.owner_id,
    device_id: device.id,
    type: "device_enrolled",
    payload: { name, platform: plat }
  });

  res.json({ ok: true, device_id: device.id, owner_id: enr.owner_id });
});

// -------- Maintenance (still protected) --------
const maintenanceLog = [];
function addLog(entry) {
  maintenanceLog.unshift(entry);
  if (maintenanceLog.length > 25) maintenanceLog.pop();
}
function helpText() {
  return { commands: ["help", "status", "diagnose", "uptime", "env", "logs"] };
}

app.post("/maintenance", requireAuth, (req, res) => {
  const cmdRaw = (req.body?.command || "").toString().trim().toLowerCase();
  const command = cmdRaw || "help";
  const now = new Date().toISOString();

  let result;
  if (command === "help") result = helpText();
  else if (command === "status") result = { status: "online", time: now, port: PORT, node: process.version, user: req.user.email };
  else if (command === "logs") result = { maintenanceLog };
  else result = { ok: true, note: "Command received", command };

  addLog({ time: now, by: req.user.email, command });
  res.json({ ok: true, time: now, command, result });
});

app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
