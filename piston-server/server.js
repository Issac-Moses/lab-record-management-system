

const express = require("express");
const cors = require("cors");

// Node 18+ has native fetch. If using older Node, install node-fetch.
const fetch = global.fetch || require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("Piston proxy running");
});

// Proxy endpoint
app.post("/execute", async (req, res) => {
  try {
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Piston proxy error:", err);
    res.status(500).json({
      error: "Execution service unavailable"
    });
  }
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Piston proxy running on http://localhost:${PORT}`);
});