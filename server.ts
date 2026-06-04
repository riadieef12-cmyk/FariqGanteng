import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import mqtt from "mqtt";

// Global state stored in-memory for physical device relay control and feedback telemetry
const relayStates = {
  lampu1: true,
  lampu2: false,
  lampu3: false,
  lampu4: false,
  temp: 28.5,
  humidity: 62.0
};

// Dynamic MQTT Configuration that synchronizes with the Web Frontend Settings
const mqttConfig = {
  brokerUrl: "wss://broker.emqx.io:8084/mqtt",
  pubTopic: "esp32/relay/control",
  subTopic: "esp32/relay/status"
};

let serverMqttClient: mqtt.MqttClient | null = null;

function initServerMqtt() {
  if (serverMqttClient) {
    try {
      console.log("[MQTT BRIDGE] Stopping existing server connection before reconnecting...");
      serverMqttClient.end(true);
    } catch (e) {
      console.error("[MQTT BRIDGE] Error ending client connection:", e);
    }
  }

  // Determine standard TCP/TLS or WS mapping for node-mqtt reliability
  let targetUrl = mqttConfig.brokerUrl;
  if (targetUrl.includes("broker.emqx.io")) {
    // If using the default broker, use port 1883 TCP which is highly reliable for Node-MQTT
    targetUrl = "mqtt://broker.emqx.io:1883";
  }

  console.log(`[MQTT BRIDGE] Re-initiating server bridge connection to: ${targetUrl}`);

  try {
    serverMqttClient = mqtt.connect(targetUrl, {
      clientId: `express_server_bridge_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 7500,
      reconnectPeriod: 4000
    });

    serverMqttClient.on("connect", () => {
      console.log(`[MQTT BRIDGE] Server bridge successfully CONNECTED to ${targetUrl}`);
      
      // Subscribe to telemetry/status topic so physical board updates can sync server state instantly
      serverMqttClient?.subscribe(mqttConfig.subTopic, { qos: 1 }, (err) => {
        if (!err) {
          console.log(`[MQTT BRIDGE] Subscribed to FEEDBACK topic: ${mqttConfig.subTopic}`);
        } else {
          console.error(`[MQTT BRIDGE] Subscription failed to: ${mqttConfig.subTopic}`, err);
        }
      });
    });

    serverMqttClient.on("message", (topic, message) => {
      try {
        const payloadStr = message.toString().trim();
        console.log(`[MQTT BRIDGE] RX Message on [${topic}]: ${payloadStr}`);

        if (payloadStr.startsWith("{")) {
          const parsed = JSON.parse(payloadStr);
          
          // E.g. {"lampu": 1, "state": true}
          if (parsed.hasOwnProperty("lampu") && parsed.hasOwnProperty("state")) {
            const ch = Number(parsed.lampu);
            const val = !!parsed.state;
            if (ch === 1) relayStates.lampu1 = val;
            else if (ch === 2) relayStates.lampu2 = val;
            else if (ch === 3) relayStates.lampu3 = val;
            else if (ch === 4) relayStates.lampu4 = val;
          } else {
            // E.g. {"lampu1": true, "lampu2": false, ...}
            if (parsed.hasOwnProperty("lampu1")) relayStates.lampu1 = !!parsed.lampu1;
            if (parsed.hasOwnProperty("lampu2")) relayStates.lampu2 = !!parsed.lampu2;
            if (parsed.hasOwnProperty("lampu3")) relayStates.lampu3 = !!parsed.lampu3;
            if (parsed.hasOwnProperty("lampu4")) relayStates.lampu4 = !!parsed.lampu4;
          }

          // Parse sensor values from hardware telemetry
          if (typeof parsed.temp === "number") relayStates.temp = parsed.temp;
          if (typeof parsed.humidity === "number") relayStates.humidity = parsed.humidity;
        } else {
          // Plain text command reflection back to state for manual esp32 clients toggling via MQTT
          const payloadUpper = payloadStr.toUpperCase();
          if (payloadUpper === 'L1_ON') relayStates.lampu1 = true;
          if (payloadUpper === 'L1_OFF') relayStates.lampu1 = false;
          if (payloadUpper === 'L2_ON') relayStates.lampu2 = true;
          if (payloadUpper === 'L2_OFF') relayStates.lampu2 = false;
          if (payloadUpper === 'L3_ON') relayStates.lampu3 = true;
          if (payloadUpper === 'L3_OFF') relayStates.lampu3 = false;
          if (payloadUpper === 'L4_ON') relayStates.lampu4 = true;
          if (payloadUpper === 'L4_OFF') relayStates.lampu4 = false;
        }
      } catch (err) {
        console.error("[MQTT BRIDGE] Error parsing received payload:", err);
      }
    });

    serverMqttClient.on("error", (err) => {
      console.error("[MQTT BRIDGE] Connection Error:", err);
    });

    serverMqttClient.on("close", () => {
      console.warn("[MQTT BRIDGE] Server MQTT Connection closed.");
    });
  } catch (e) {
    console.error("[MQTT BRIDGE] Connection initialisation exception:", e);
  }
}

// Fire up standard backend client connection
initServerMqtt();

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

    // Publish to MQTT from server side so if browser MQTT is blocked, the physical boards still get it immediately!
    if (serverMqttClient && serverMqttClient.connected) {
      if (channel === 0) {
        console.log(`[MQTT BRIDGE] TX MASTER: ${stateVal ? "ALL_ON" : "ALL_OFF"} to ${mqttConfig.pubTopic}`);
        serverMqttClient.publish(mqttConfig.pubTopic, stateVal ? "ALL_ON" : "ALL_OFF", { qos: 1 });
        serverMqttClient.publish(mqttConfig.pubTopic, `L1_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
        serverMqttClient.publish(mqttConfig.pubTopic, `L2_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
        serverMqttClient.publish(mqttConfig.pubTopic, `L3_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
        serverMqttClient.publish(mqttConfig.pubTopic, `L4_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
      } else {
        const payloadText = `L${channel}_${stateVal ? 'ON' : 'OFF'}`;
        console.log(`[MQTT BRIDGE] TX CMD: ${payloadText} to ${mqttConfig.pubTopic}`);
        serverMqttClient.publish(mqttConfig.pubTopic, payloadText, { qos: 1 });
      }
    } else {
      console.warn("[MQTT BRIDGE] Cannot publish to hardware, serverMqttClient.connected is offline.");
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

    // Push status updates back to MQTT too so physical boards listening to status get refreshed
    if (serverMqttClient && serverMqttClient.connected) {
      const payload = JSON.stringify(relayStates);
      serverMqttClient.publish(mqttConfig.subTopic, payload, { qos: 1, retain: true });
    }

    res.json({
      success: true,
      relayStates
    });
  });

  // REST API 4: Get dyn MQTT configuration values
  app.get("/api/relay/config", (req, res) => {
    res.json(mqttConfig);
  });

  // REST API 5: Synchronize/Update MQTT settings
  app.post("/api/relay/config", (req, res) => {
    const { brokerUrl, pubTopic, subTopic } = req.body;
    if (brokerUrl) mqttConfig.brokerUrl = brokerUrl;
    if (pubTopic) mqttConfig.pubTopic = pubTopic;
    if (subTopic) mqttConfig.subTopic = subTopic;

    // Restart client connections
    initServerMqtt();

    res.json({
      success: true,
      message: "Server bridge MQTT updated successfully",
      mqttConfig
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
