const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 10000;

// ---- ENV VARS ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing Supabase environment variables");
}

// ---- SUPABASE CLIENT (ANON) ----
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- AUTH GUARD ----
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ ok: false, error: "Missing Bearer token" });
  }

  const token = match[1];
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ ok: false, error: "Invalid session" });
  }

  req.user = data.user;
  next();
}

// ---- HEALTH CHECK ----
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "online",
    time: new Date().toISOString()
  });
});

// ---- CONFIG (FRONTEND USE) ----
app.get("/config", (req, res) => {
  res.json({
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  });
});

// ---- CREATE ENROLLMENT CODE (LOGGED-IN OWNER) ----
app.post("/enroll/create", requireAuth, async (req, res) => {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();

  const { error } = await supabase
    .from("enrollment_codes")
    .insert({
      owner_id: req.user.id,
      code
    });

  if (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  res.json({
    ok: true,
    enrollment_code: code
  });
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
