const express = require("express");
const path = require("path");

const app = express();

// Render provides PORT automatically
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Basic health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Placeholder for future AI maintenance endpoint
app.post("/maintenance", express.json(), (req, res) => {
  res.json({
    message: "AI maintenance endpoint placeholder",
    received: req.body
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
