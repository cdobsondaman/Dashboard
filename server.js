const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Simple in-memory log (resets when Render restarts)
const maintenanceLog = [];

function addLog(entry) {
  maintenanceLog.unshift(entry);
  if (maintenanceLog.length > 25) maintenanceLog.pop();
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// List available maintenance commands
function helpText() {
  return {
    commands: [
      "help",
      "status",
      "diagnose",
      "uptime",
      "env",
      "logs"
    ],
    examples: [
      "status",
      "diagnose",
      "env"
    ]
  };
}

// The maintenance “agent”
app.post("/maintenance", (req, res) => {
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
      node: process.version
    };
  } else if (command === "uptime") {
    result = { uptime };
  } else if (command === "env") {
    // Show keys only (not values)
    const keys = Object.keys(process.env).sort();
    result = {
      env_keys_present: keys,
      note: "Values are hidden on purpose."
    };
  } else if (command === "logs") {
    result = { maintenanceLog };
  } else if (command === "diagnose") {
    result = {
      status: "ok",
      time: now,
      uptime,
      memory: process.memoryUsage(),
      platform: process.platform,
      arch: process.arch
    };
  } else {
    result = {
      error: `Unknown command: "${command}"`,
      hint: "Try: help"
    };
  }

  addLog({ time: now, command, result_preview: JSON.stringify(result).slice(0, 200) });

  res.json({
    ok: true,
    time: now,
    command,
    result
  });
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
