import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Global state stored in-memory for physical device relay control and feedback telemetry
const relayStates = {
  lampu1: true,
  lampu2: false,
  lampu3: false,
  lampu4: false,
  temp: 24.8,
  humidity: 62.0
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to handle JSON raw payloads
  app.use(express.json());

  // CORS middleware for local testing headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // REST API 1: Get current status of all 4 Relays and Sensor values
  // Accessible at: http://<app-url>/api/relay/status
  app.get("/api/relay/status", (req, res) => {
    res.json(relayStates);
  });

  // REST API 2: Single command toggle via GET URL parameters
  // Useful for quick testing on browsers or ultra-lightweight ESP8266/ESP32 code:
  // e.g. GET /api/relay/toggle?channel=1&state=true
  app.get("/api/relay/toggle", (req, res) => {
    const channel = Number(req.query.channel);
    const stateVal = req.query.state === "true" || req.query.state === "1";

    if (channel === 1) relayStates.lampu1 = stateVal;
    else if (channel === 2) relayStates.lampu2 = stateVal;
    else if (channel === 3) relayStates.lampu3 = stateVal;
    else if (channel === 4) relayStates.lampu4 = stateVal;
    else if (channel === 0) { // Master Control
      relayStates.lampu1 = stateVal;
      relayStates.lampu2 = stateVal;
      relayStates.lampu3 = stateVal;
      relayStates.lampu4 = stateVal;
    }

    res.json({
      success: true,
      message: `Relay channel ${channel} set to ${stateVal ? "ON" : "OFF"}`,
      channel,
      state: stateVal,
      relayStates
    });
  });

  // REST API 3: Update states with JSON payload (POST)
  // Useful for physical microcontrollers to push sensor telemetry and sync switches:
  // e.g. POST /api/relay/update with {"lampu1": true, "temp": 28.5}
  app.post("/api/relay/update", (req, res) => {
    const { lampu1, lampu2, lampu3, lampu4, temp, humidity } = req.body;

    if (typeof lampu1 === "boolean") relayStates.lampu1 = lampu1;
    if (typeof lampu2 === "boolean") relayStates.lampu2 = lampu2;
    if (typeof lampu3 === "boolean") relayStates.lampu3 = lampu3;
    if (typeof lampu4 === "boolean") relayStates.lampu4 = lampu4;
    
    if (typeof temp === "number") relayStates.temp = temp;
    if (typeof humidity === "number") relayStates.humidity = humidity;

    res.json({
      success: true,
      relayStates
    });
  });

  // Serve static assets or mount Vite Developer Server middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP SERVER] Running on host 0.0.0.0 and port ${PORT}`);
  });
}

startServer();
