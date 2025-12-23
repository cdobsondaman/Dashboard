const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Create Supabase client on the server (used only for verifying tokens)
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Health check (public)
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Frontend needs these to initialize supabase-js (anon key is OK to expose)
app.get("/config", (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Missing Supabase env vars on server",
      required: ["SUPABASE_URL", "SUPABASE_ANON_KEY"]
    });
  }
  return res.json({ SUPABASE_URL, SUPABASE_ANON_KEY });
});

// In-memory maintenance log (resets on restart)
const maintenanceLog = [];
function addLog(entry) {
  maintenanceLog.unshift(entry);
  if (maintenanceLog.length > 25) maintenanceLog.pop();
}

function helpText() {
  return {
    commands: ["help", "status", "diagnose", "uptime", "env", "logs"],
    examples: ["status", "diagnose", "logs"]
  };
}

// Middleware: require a valid Supabase session token
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);

  if (!match) return res.status(401).json({ ok: false, error: "Missing Bearer token" });
  if (!supabase) return res.status(500).json({ ok: false, error: "Supabase not configured" });

  const token = match[1];
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) return res.status(401).json({ ok: false, error: "Invalid session" });

  req.user = data.user;
  next();
}

// Protected maintenance endpoint
app.post("/maintenance", requireAuth, (req, res) => {
  const cmdRaw = (req.body?.command || "").toString().trim().toLowerCase();
  const command = cmdRaw || "help";

  const now = new Date().toISOString();
  const uptimeSeconds = Math.floor(process.uptime());
  const uptime = `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

  let result;

  if (command === "help") {
    result = helpText();
  } else if (command === "status") {
    result = {
      status: "online",
      time: now,
      port: PORT,
      node: process.version,
      user: req.user.email
    };
  } else if (command === "uptime") {
    result = { uptime };
  } else if (command === "env") {
    const keys = Object.keys(process.env).sort();
    result = { env_keys_present: keys, note: "Values hidden on purpose." };
  } else if (command === "logs") {
    result = { maintenanceLog };
  } else if (command === "diagnose") {
    result = {
      status: "ok",
      time: now,
      uptime,
      memory: process.memoryUsage(),
      platform: process.platform,
      arch: process.arch,
      user: req.user.email
    };
  } else {
    result = { error: `Unknown command: "${command}"`, hint: "Try: help" };
  }

  addLog({
    time: now,
    by: req.user.email,
    command,
    result_preview: JSON.stringify(result).slice(0, 200)
  });

  res.json({ ok: true, time: now, command, result });
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
