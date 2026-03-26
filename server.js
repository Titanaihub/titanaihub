const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./routes/api.js");
const { startAutoTrading } = require("./services/demo-auto-trading-service.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);

  // Optional: auto-start testnet auto trading after server restart/deploy.
  if (String(process.env.DEMO_AUTO_TRADING_BOOT || "false").toLowerCase() === "true") {
    const requestedIntervalMs = Number(process.env.DEMO_AUTO_TRADING_INTERVAL_MS || 300000);
    const r = startAutoTrading(requestedIntervalMs);
    if (r.ok) {
      console.log(
        `[auto-trading] boot start success: intervalMs=${r.status?.intervalMs || requestedIntervalMs}`
      );
    } else {
      console.log(`[auto-trading] boot start skipped: ${r.message || "unknown"}`);
    }
  }
});
