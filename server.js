import express from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabaseAnon =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/* ---------- REQUIRED FOR DASHBOARD ---------- */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/config", (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  res.json({
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  });
});

/* ---------- ENROLLMENT CODE CREATION ---------- */

app.post("/enroll/create", async (req, res) => {
  if (!supabaseAnon) {
    return res.status(500).json({ ok: false, error: "Supabase not configured" });
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();

  const { error } = await supabaseAnon
    .from("enrollment_codes")
    .insert({ code });

  if (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  res.json({
    ok: true,
    enrollment_code: code,
  });
});

/* ---------- START SERVER ---------- */
// TEMP: browser-friendly enrollment code generator
app.get("/enroll/create-test", async (req, res) => {
  if (!supabaseAnon) {
    return res.status(500).json({ ok: false, error: "Supabase not configured" });
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();

  const { error } = await supabaseAnon
    .from("enrollment_codes")
    .insert({ code });

  if (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  res.json({
    ok: true,
    enrollment_code: code
  });
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
