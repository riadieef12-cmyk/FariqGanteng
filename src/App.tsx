/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { 
  Thermometer, 
  Droplet, 
  Power, 
  Terminal, 
  Signal, 
  Clock, 
  RefreshCw, 
  SlidersHorizontal, 
  Cpu, 
  FileDown, 
  AlertTriangle, 
  Trash2, 
  WifiOff, 
  Wifi, 
  Play, 
  Layers, 
  CheckCircle,
  Settings2,
  HardDrive,
  Lightbulb,
  Copy,
  Check,
  BookOpen,
  Mic,
  MicOff
} from 'lucide-react';

interface LogEntry {
  id: string;
  time: string;
  type: 'SENSOR' | 'CMD' | 'ALERT' | 'SYSTEM';
  msg: string;
}

export default function App() {
  // Helper to generate guaranteed unique IDs for logs to avoid React key collisions
  const generateLogId = (suffix = 'log') => {
    const rand = Math.random().toString(36).substring(2, 7);
    return `${suffix}_${Date.now()}_${rand}`;
  };

  // MQTT Connection State Configuration
  const [inputBrokerUrl, setInputBrokerUrl] = useState<string>('wss://broker.emqx.io:8084/mqtt');
  const [inputPubTopic, setInputPubTopic] = useState<string>('esp32/relay/control');
  const [inputSubTopic, setInputSubTopic] = useState<string>('esp32/relay/status');

  const [brokerUrl, setBrokerUrl] = useState<string>('wss://broker.emqx.io:8084/mqtt');
  const [pubTopic, setPubTopic] = useState<string>('esp32/relay/control');
  const [subTopic, setSubTopic] = useState<string>('esp32/relay/status');

  const [mqttClientId] = useState<string>(`web_client_${Math.random().toString(16).substring(2, 10)}`);
  const [mqttConnected, setMqttConnected] = useState<boolean>(false);
  const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
  const [isSimulatedOutage, setIsSimulatedOutage] = useState<boolean>(false);
  const [isSimulationEnabled, setIsSimulationEnabled] = useState<boolean>(false);

  // Map isConnected to denote whether we are connected to the actual MQTT broker (and not in simulated outage mode)
  const isConnected = mqttConnected && !isSimulatedOutage;
  
  // Device/Hardware Configuration State
  const [deviceType, setDeviceType] = useState<'ESP32_RELAY_01' | 'ARDUINO_NANO_IOT' | 'RASPBERRY_PICO_W'>('ESP32_RELAY_01');
  const [ipAddress, setIpAddress] = useState<string>('192.168.1.104');
  
  // Live Sensor Values
  const [temp, setTemp] = useState<number>(24.8);
  const [humidity, setHumidity] = useState<number>(62.0);
  const [rssi, setRssi] = useState<number>(-58);
  
  // Custom Alert Thresholds set by user
  const [tempThreshold, setTempThreshold] = useState<number>(29.5);
  const [humidityMinThreshold, setHumidityMinThreshold] = useState<number>(45.0);
  
  // Actuator/Control States (Lampu 1-4)
  const [relayLampu1, setRelayLampu1] = useState<boolean>(true);
  const [relayLampu2, setRelayLampu2] = useState<boolean>(false);
  const [relayLampu3, setRelayLampu3] = useState<boolean>(false);
  const [relayLampu4, setRelayLampu4] = useState<boolean>(false);
  
  // General System State
  const [uptime, setUptime] = useState<number>(45845); // Starter uptime in seconds (12h 44m 05s)
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [syncTick, setSyncTick] = useState<boolean>(false);
  
  // Logs & Filters
  const [activeLogFilter, setActiveLogFilter] = useState<'ALL' | 'SENSOR' | 'CMD' | 'ALERT' | 'SYSTEM'>('ALL');
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', time: '14:21:35', type: 'SENSOR', msg: 'DATA_RECEIVED TEMP: 24.9C | HUM: 60%' },
    { id: '2', time: '14:21:38', type: 'CMD', msg: 'LIGHT_STATE -> ON' },
    { id: '3', time: '14:21:45', type: 'SENSOR', msg: 'DATA_RECEIVED TEMP: 24.8C | HUM: 61%' },
    { id: '4', time: '14:21:55', type: 'SENSOR', msg: 'DATA_RECEIVED TEMP: 24.7C | HUM: 62%' },
    { id: '5', time: '14:22:05', type: 'SENSOR', msg: 'DATA_RECEIVED TEMP: 24.8C | HUM: 62%' },
  ]);

  // Calibration Drawer / Config Mode Toggle
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);

  // Hardware simulator and code helper tab selection
  const [activeSimulatorTab, setActiveSimulatorTab] = useState<'emulator' | 'http' | 'mqtt' | 'schematic'>('emulator');
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [relayLogicMode, setRelayLogicMode] = useState<'high' | 'low'>('low'); // 'low' is active-low (common), 'high' is active-high

  // Voice Command Assistant state variables
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [voiceStatus, setVoiceStatus] = useState<string>('Siap menerima perintah suara...');
  const [useSpeechSynthesis, setUseSpeechSynthesis] = useState<boolean>(true);
  const [activeVoiceTab, setActiveVoiceTab] = useState<'voice' | 'system'>('voice');
  const [lastMatchedCommand, setLastMatchedCommand] = useState<string>('');
  const recognitionRef = useRef<any>(null);

  // Bottom scroll Ref for terminal logs
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Update timestamps/Uptime timers
  useEffect(() => {
    // Set initial sync time
    const initTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setLastSyncTime(initTime);

    // Live 1-second interval for system uptime
    const secondInterval = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(secondInterval);
  }, []);

  // Load initial MQTT configuration from Express server bridge
  useEffect(() => {
    const loadMqttConfig = async () => {
      try {
        const res = await fetch('/api/relay/config');
        if (res.ok) {
          const data = await res.json();
          if (data.brokerUrl) {
            setInputBrokerUrl(data.brokerUrl);
            setBrokerUrl(data.brokerUrl);
          }
          if (data.pubTopic) {
            setInputPubTopic(data.pubTopic);
            setPubTopic(data.pubTopic);
          }
          if (data.subTopic) {
            setInputSubTopic(data.subTopic);
            setSubTopic(data.subTopic);
          }
        }
      } catch (e) {
        // Safe catch for static fallback
      }
    };
    loadMqttConfig();
  }, []);

  // Poll Express API backend every 2.5 seconds to synchronize relay states and sensor telemetry from physical boards
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/relay/status');
        if (response.ok) {
          const data = await response.json();
          setRelayLampu1(!!data.lampu1);
          setRelayLampu2(!!data.lampu2);
          setRelayLampu3(!!data.lampu3);
          setRelayLampu4(!!data.lampu4);
          
          // Only update telemetry state if they are in normal bounds
          if (typeof data.temp === 'number' && typeof data.humidity === 'number') {
            // Check if values actually changed to avoid unnecessary re-renders
            setTemp(prev => Math.abs(prev - data.temp) > 0.05 ? data.temp : prev);
            setHumidity(prev => Math.abs(prev - data.humidity) > 0.05 ? data.humidity : prev);

            // Fluctuate RSSI slightly on successful active hardware telemetry report
            setRssi(prev => {
              const drift = Math.floor((Math.random() - 0.5) * 2);
              const next = prev + drift;
              return next > -45 ? -45 : (next < -82 ? -82 : next);
            });
          }

          // Trigger visual sync dot and time update to show real-time synchronization is successful
          const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
          setLastSyncTime(timestamp);
          setSyncTick(true);
          setTimeout(() => setSyncTick(false), 300);
        }
      } catch (e) {
        // Safe catch for static-only offline deployment testing
      }
    }, 2500);

    return () => clearInterval(syncInterval);
  }, []);

  // Scroll to bottom of terminal whenever logs array updates
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Sensor drift simulation (Real-time updates) - Runs only if manual simulation mode is enabled
  useEffect(() => {
    if (!isSimulationEnabled) return;

    const sensorTicker = setInterval(() => {
      // Small fluctuation
      const tDrift = parseFloat(((Math.random() - 0.5) * 0.3).toFixed(1));
      const hDrift = parseFloat(((Math.random() - 0.5) * 0.5).toFixed(1));
      
      let nextTemp = parseFloat((temp + tDrift).toFixed(1));
      let nextHum = parseFloat((humidity + hDrift).toFixed(1));

      // Keep in realistic bounds
      if (nextTemp < 10) nextTemp = 10;
      if (nextTemp > 45) nextTemp = 45;
      if (nextHum < 20) nextHum = 20;
      if (nextHum > 95) nextHum = 95;

      setTemp(nextTemp);
      setHumidity(nextHum);

      // Fluctuate Signal strength slightly
      const rssiDrift = Math.floor((Math.random() - 0.5) * 3);
      let nextRssi = rssi + rssiDrift;
      if (nextRssi > -45) nextRssi = -45;
      if (nextRssi < -82) nextRssi = -82;
      setRssi(nextRssi);

      // Trigger visual sync dot
      setSyncTick(true);
      setTimeout(() => setSyncTick(false), 300);

      const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
      setLastSyncTime(timestamp);

      // Randomly push SENSOR logs
      const shouldLog = Math.random() < 0.25;
      let newLogsList: LogEntry[] = [];

      // Check Alarms
      const tempAlertTriggered = nextTemp >= tempThreshold;
      const humidAlertTriggered = nextHum <= humidityMinThreshold;

      if (tempAlertTriggered) {
        newLogsList.push({
          id: generateLogId('t_warn'),
          time: timestamp,
          type: 'ALERT',
          msg: `⚠️ SUHU TINGGI MELEBIHI AMBANG BATAS: ${nextTemp}°C (Ambang: ${tempThreshold}°C)`
        });
      }

      if (humidAlertTriggered) {
        newLogsList.push({
          id: generateLogId('h_warn'),
          time: timestamp,
          type: 'ALERT',
          msg: `⚠️ KELEMBAPAN RENDAH: ${nextHum}% (Ambang Min: ${humidityMinThreshold}%)`
        });
      }

      if (shouldLog && !tempAlertTriggered && !humidAlertTriggered) {
        newLogsList.push({
          id: generateLogId('sensor'),
          time: timestamp,
          type: 'SENSOR',
          msg: `DATA_RECEIVED TEMP: ${nextTemp}°C | HUM: ${nextHum}% | RSSI: ${nextRssi}dBm`
        });
      }

      if (newLogsList.length > 0) {
        setLogs(prev => [...prev, ...newLogsList].slice(-40)); // Keep last 40 logs
      }

    }, 4500);

    return () => clearInterval(sensorTicker);
  }, [temp, humidity, tempThreshold, humidityMinThreshold, rssi, isSimulationEnabled]);

  // Real-time MQTT Lifecycle hook
  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    setLogs(prev => [
      ...prev,
      {
        id: generateLogId('mqtt_init'),
        time: timestamp,
        type: 'SYSTEM',
        msg: `🔌 MQTT CONNECTING: Menghubungkan ke ${brokerUrl} ...`
      }
    ]);

    // Connect to WebSocket MQTT broker
    const client = mqtt.connect(brokerUrl, {
      clientId: mqttClientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 4000,
    });

    setMqttClient(client);

    client.on('connect', () => {
      setMqttConnected(true);
      const connTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('mqtt_online'),
          time: connTime,
          type: 'SYSTEM',
          msg: `🟢 MQTT ONLINE: Berhasil koneksi! Subscribed ke topik "${subTopic}"`
        }
      ]);
      client.subscribe(subTopic);
    });

    client.on('message', (topic, message) => {
      const payloadString = message.toString();
      const msgTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
      
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('mqtt_rx'),
          time: msgTime,
          type: 'SENSOR',
          msg: `📥 MQTT RECV [${topic}]: ${payloadString}`
        }
      ]);

      // Parse payload status to sync actuator relays
      try {
        const payloadUpper = payloadString.trim().toUpperCase();
        
        if (payloadString.startsWith('{')) {
          const parsed = JSON.parse(payloadString);
          
          // E.g. {"lampu": 1, "state": true}
          if (parsed.hasOwnProperty('lampu') && parsed.hasOwnProperty('state')) {
            const ch = Number(parsed.lampu);
            const val = !!parsed.state;
            if (ch === 1) setRelayLampu1(val);
            if (ch === 2) setRelayLampu2(val);
            if (ch === 3) setRelayLampu3(val);
            if (ch === 4) setRelayLampu4(val);
          } else {
            // E.g. {"lampu1": true, "lampu2": false}
            if (parsed.hasOwnProperty('lampu1')) setRelayLampu1(!!parsed.lampu1);
            if (parsed.hasOwnProperty('lampu2')) setRelayLampu2(!!parsed.lampu2);
            if (parsed.hasOwnProperty('lampu3')) setRelayLampu3(!!parsed.lampu3);
            if (parsed.hasOwnProperty('lampu4')) setRelayLampu4(!!parsed.lampu4);
          }

          // Parse sensor values from hardware telemetry
          if (parsed.hasOwnProperty('temp')) setTemp(Number(parsed.temp));
          if (parsed.hasOwnProperty('humidity')) setHumidity(Number(parsed.humidity));
        } else {
          // Plain Text commands parsing
          if (payloadUpper === 'L1_ON') setRelayLampu1(true);
          if (payloadUpper === 'L1_OFF') setRelayLampu1(false);
          if (payloadUpper === 'L2_ON') setRelayLampu2(true);
          if (payloadUpper === 'L2_OFF') setRelayLampu2(false);
          if (payloadUpper === 'L3_ON') setRelayLampu3(true);
          if (payloadUpper === 'L3_OFF') setRelayLampu3(false);
          if (payloadUpper === 'L4_ON') setRelayLampu4(true);
          if (payloadUpper === 'L4_OFF') setRelayLampu4(false);
        }
      } catch (e) {
        // Safe catch json error
      }
    });

    client.on('error', (err) => {
      const errTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('mqtt_err'),
          time: errTime,
          type: 'ALERT',
          msg: `🔴 MQTT ERROR: ${err.message || 'Gagal tersambung ke broker'}`
        }
      ]);
    });

    client.on('close', () => {
      setMqttConnected(false);
    });

    return () => {
      client.end();
    };
  }, [brokerUrl, subTopic, mqttClientId]);

  // Master switch control
  const handleMasterLampu = (stateVal: boolean) => {
    setRelayLampu1(stateVal);
    setRelayLampu2(stateVal);
    setRelayLampu3(stateVal);
    setRelayLampu4(stateVal);

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });

    // Sync state with global server REST API so physical boards can read/update via simple HTTP GET
    fetch(`/api/relay/toggle?channel=0&state=${stateVal}`).catch(() => {});

    if (mqttClient && mqttConnected) {
      const payloadText = stateVal ? 'ALL_ON' : 'ALL_OFF';
      mqttClient.publish(pubTopic, payloadText, { qos: 1 });
      
      // Publish individual channels too for robust backup
      mqttClient.publish(pubTopic, `L1_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
      mqttClient.publish(pubTopic, `L2_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
      mqttClient.publish(pubTopic, `L3_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });
      mqttClient.publish(pubTopic, `L4_${stateVal ? 'ON' : 'OFF'}`, { qos: 1 });

      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('pub_master'),
          time: timestamp,
          type: 'CMD',
          msg: `📡 MQTT PUBLISH MASTER [${pubTopic}]: payload = "${payloadText}"`
        }
      ]);
    } else {
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('master_offline'),
          time: timestamp,
          type: 'SYSTEM',
          msg: `⚠️ SISTEM OK (Sinkron REST API & Lokal): SEMUA LAMPU -> ${stateVal ? 'ON' : 'OFF'}`
        }
      ]);
    }
  };

  // Simulating DHT22 sensor readings being sent from mock physical board to website via MQTT & HTTP REST API
  const handleSimulateSensorChange = (type: 'temp' | 'humidity', value: number) => {
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    let updatedTemp = temp;
    let updatedHum = humidity;

    if (type === 'temp') {
      updatedTemp = value;
      setTemp(value);
      if (mqttClient && mqttConnected) {
        const payload = JSON.stringify({ temp: value, humidity: humidity });
        mqttClient.publish(subTopic, payload, { qos: 1 });
      }
    } else {
      updatedHum = value;
      setHumidity(value);
      if (mqttClient && mqttConnected) {
        const payload = JSON.stringify({ temp: temp, humidity: value });
        mqttClient.publish(subTopic, payload, { qos: 1 });
      }
    }

    // Sync simulated sensor data to server API
    fetch('/api/relay/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp: updatedTemp, humidity: updatedHum })
    }).catch(() => {});
  };

  // Toggle controls helper
  const handleToggleLampu = (id: 1 | 2 | 3 | 4) => {
    let nextState = false;
    let name = '';
    let pin = '';
    if (id === 1) {
      nextState = !relayLampu1;
      setRelayLampu1(nextState);
      name = 'Lampu 1';
      pin = 'Pin D5';
    } else if (id === 2) {
      nextState = !relayLampu2;
      setRelayLampu2(nextState);
      name = 'Lampu 2';
      pin = 'Pin D6';
    } else if (id === 3) {
      nextState = !relayLampu3;
      setRelayLampu3(nextState);
      name = 'Lampu 3';
      pin = 'Pin D7';
    } else if (id === 4) {
      nextState = !relayLampu4;
      setRelayLampu4(nextState);
      name = 'Lampu 4';
      pin = 'Pin D8';
    }

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    // Command format text payload
    const payloadText = `L${id}_${nextState ? 'ON' : 'OFF'}`;

    // Sync to Express backend API
    fetch(`/api/relay/toggle?channel=${id}&state=${nextState}`).catch(() => {});

    if (mqttClient && mqttConnected) {
      mqttClient.publish(pubTopic, payloadText, { qos: 1 });
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('toggle_tx'),
          time: timestamp,
          type: 'CMD',
          msg: `📡 MQTT PUBLISH [${pubTopic}]: payload = "${payloadText}" (${name})`
        }
      ]);
    } else {
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('toggle_offline'),
          time: timestamp,
          type: 'SYSTEM',
          msg: `⚡ SISTEM OK (Sinkron REST API & Lokal): ${name.toUpperCase()} -> ${nextState ? 'ON' : 'OFF'} (${pin})`
        }
      ]);
    }
  };

  // Set explicit state control helper
  const handleSetLampu = (id: 1 | 2 | 3 | 4, nextState: boolean) => {
    let name = '';
    let pin = '';
    if (id === 1) {
      setRelayLampu1(nextState);
      name = 'Lampu 1';
      pin = 'Pin D5';
    } else if (id === 2) {
      setRelayLampu2(nextState);
      name = 'Lampu 2';
      pin = 'Pin D6';
    } else if (id === 3) {
      setRelayLampu3(nextState);
      name = 'Lampu 3';
      pin = 'Pin D7';
    } else if (id === 4) {
      setRelayLampu4(nextState);
      name = 'Lampu 4';
      pin = 'Pin D8';
    }

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    // Command format text payload
    const payloadText = `L${id}_${nextState ? 'ON' : 'OFF'}`;

    // Sync to Express backend API
    fetch(`/api/relay/toggle?channel=${id}&state=${nextState}`).catch(() => {});

    if (mqttClient && mqttConnected) {
      mqttClient.publish(pubTopic, payloadText, { qos: 1 });
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('toggle_tx'),
          time: timestamp,
          type: 'CMD',
          msg: `📡 MQTT PUBLISH [${pubTopic}]: payload = "${payloadText}" (${name})`
        }
      ]);
    } else {
      setLogs(prev => [
        ...prev,
        {
          id: generateLogId('toggle_offline'),
          time: timestamp,
          type: 'SYSTEM',
          msg: `⚡ SISTEM OK (Sinkron REST API & Lokal): ${name.toUpperCase()} -> ${nextState ? 'ON' : 'OFF'} (${pin})`
        }
      ]);
    }
  };

  // Text to Speech Response
  const speakResponse = (text: string) => {
    if (!useSpeechSynthesis) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // cancel any active speaking
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID'; // Indonesian
        
        // Find Indonesian voice if possible
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(v => v.lang.startsWith('id') || v.lang.includes('id-ID'));
        if (idVoice) {
          utterance.voice = idVoice;
        }
        
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("Speech synthesis failed", e);
    }
  };

  // Process Voice Commands with Robust Indonesian matching
  const processVoiceCommand = (cmd: string) => {
    const speech = cmd.toLowerCase().trim();
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    setLogs(prev => [
      ...prev,
      {
        id: generateLogId('voice_rx'),
        time: timestamp,
        type: 'CMD',
        msg: `🎙️ SUARA DITERIMA: "${cmd}"`
      }
    ]);

    // Command matching
    // Lampu 1
    if (speech.includes('nyalakan lampu 1') || speech.includes('nyalakan lampu satu') || speech.includes('hidupkan lampu 1') || speech.includes('hidupkan lampu satu') || (speech.includes('lampu 1') && speech.includes('on')) || (speech.includes('lampu satu') && speech.includes('on'))) {
      handleSetLampu(1, true);
      setLastMatchedCommand('Nyalakan Lampu 1');
      setVoiceStatus('Berhasil: Lampu 1 Dinyalakan');
      speakResponse('Lampu satu dinyalakan.');
    } else if (speech.includes('matikan lampu 1') || speech.includes('matikan lampu satu') || speech.includes('padamkan lampu 1') || speech.includes('padamkan lampu satu') || (speech.includes('lampu 1') && speech.includes('off')) || (speech.includes('lampu satu') && speech.includes('off'))) {
      handleSetLampu(1, false);
      setLastMatchedCommand('Matikan Lampu 1');
      setVoiceStatus('Berhasil: Lampu 1 Dimatikan');
      speakResponse('Lampu satu dimatikan.');
    }
    // Lampu 2
    else if (speech.includes('nyalakan lampu 2') || speech.includes('nyalakan lampu dua') || speech.includes('hidupkan lampu 2') || speech.includes('hidupkan lampu dua') || (speech.includes('lampu 2') && speech.includes('on')) || (speech.includes('lampu dua') && speech.includes('on'))) {
      handleSetLampu(2, true);
      setLastMatchedCommand('Nyalakan Lampu 2');
      setVoiceStatus('Berhasil: Lampu 2 Dinyalakan');
      speakResponse('Lampu dua dinyalakan.');
    } else if (speech.includes('matikan lampu 2') || speech.includes('matikan lampu dua') || speech.includes('padamkan lampu 2') || speech.includes('padamkan lampu dua') || (speech.includes('lampu 2') && speech.includes('off')) || (speech.includes('lampu dua') && speech.includes('off'))) {
      handleSetLampu(2, false);
      setLastMatchedCommand('Matikan Lampu 2');
      setVoiceStatus('Berhasil: Lampu 2 Dimatikan');
      speakResponse('Lampu dua dimatikan.');
    }
    // Lampu 3
    else if (speech.includes('nyalakan lampu 3') || speech.includes('nyalakan lampu tiga') || speech.includes('hidupkan lampu 3') || speech.includes('hidupkan lampu tiga') || (speech.includes('lampu 3') && speech.includes('on')) || (speech.includes('lampu tiga') && speech.includes('on'))) {
      handleSetLampu(3, true);
      setLastMatchedCommand('Nyalakan Lampu 3');
      setVoiceStatus('Berhasil: Lampu 3 Dinyalakan');
      speakResponse('Lampu tiga dinyalakan.');
    } else if (speech.includes('matikan lampu 3') || speech.includes('matikan lampu tiga') || speech.includes('padamkan lampu 3') || speech.includes('padamkan lampu tiga') || (speech.includes('lampu 3') && speech.includes('off')) || (speech.includes('lampu tiga') && speech.includes('off'))) {
      handleSetLampu(3, false);
      setLastMatchedCommand('Matikan Lampu 3');
      setVoiceStatus('Berhasil: Lampu 3 Dimatikan');
      speakResponse('Lampu tiga dimatikan.');
    }
    // Lampu 4
    else if (speech.includes('nyalakan lampu 4') || speech.includes('nyalakan lampu empat') || speech.includes('hidupkan lampu 4') || speech.includes('hidupkan lampu empat') || (speech.includes('lampu 4') && speech.includes('on')) || (speech.includes('lampu empat') && speech.includes('on'))) {
      handleSetLampu(4, true);
      setLastMatchedCommand('Nyalakan Lampu 4');
      setVoiceStatus('Berhasil: Lampu 4 Dinyalakan');
      speakResponse('Lampu empat dinyalakan.');
    } else if (speech.includes('matikan lampu 4') || speech.includes('matikan lampu empat') || speech.includes('padamkan lampu 4') || speech.includes('padamkan lampu empat') || (speech.includes('lampu 4') && speech.includes('off')) || (speech.includes('lampu empat') && speech.includes('off'))) {
      handleSetLampu(4, false);
      setLastMatchedCommand('Matikan Lampu 4');
      setVoiceStatus('Berhasil: Lampu 4 Dimatikan');
      speakResponse('Lampu empat dimatikan.');
    }
    // All on
    else if (speech.includes('all on') || speech.includes('nyalakan semua') || speech.includes('hidupkan semua') || speech.includes('semua on') || speech.includes('semua hidup')) {
      handleMasterLampu(true);
      setLastMatchedCommand('Nyalakan Semua');
      setVoiceStatus('Berhasil: Nyalakan Semua Lampu');
      speakResponse('Semua lampu dinyalakan.');
    }
    // All off
    else if (speech.includes('all off') || speech.includes('matikan semua') || speech.includes('padamkan semua') || speech.includes('semua off') || speech.includes('semua mati')) {
      handleMasterLampu(false);
      setLastMatchedCommand('Matikan Semua');
      setVoiceStatus('Berhasil: Matikan Semua Lampu');
      speakResponse('Semua lampu dimatikan.');
    }
    // Cek status sensor
    else if (speech.includes('status sensor') || speech.includes('cek sensor') || speech.includes('cek status') || speech.includes('baca sensor') || speech.includes('berapa suhu') || speech.includes('suhu berapa') || speech.includes('cek kelembaban')) {
      setLastMatchedCommand('Cek Status Sensor');
      const responseText = `Status sensor saat ini. Suhu: ${temp.toFixed(1)} derajat Celsius. Kelebapan: ${humidity.toFixed(1)} persen.`;
      setVoiceStatus(`Pembacaan: Suhu ${temp.toFixed(1)}°C, Hum ${humidity.toFixed(1)}%`);
      speakResponse(responseText);
    }
    // unrecognized
    else {
      setLastMatchedCommand('Tidak Dikenali');
      setVoiceStatus(`Perintah tidak dikenali: "${cmd}"`);
      speakResponse('Perintah tidak dikenali, silakan coba lagi.');
    }
  };

  // Start Speech Recognition Engine
  const startSpeechRecognition = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceStatus('Browser Anda tidak mendukung kendali suara.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRecognitionAPI();
      rec.continuous = false; // single-shot pattern (cleaner resource cleanup)
      rec.interimResults = false;
      rec.lang = 'id-ID';

      rec.onstart = () => {
        setIsListening(true);
        setVoiceStatus('Mendengarkan... Silakan bicara.');
        setTranscript('');
      };

      rec.onerror = (event: any) => {
        console.error("Speech error", event);
        setIsListening(false);
        if (event.error === 'no-speech') {
          setVoiceStatus('Tidak terdengar suara. Coba lagi.');
        } else if (event.error === 'not-allowed') {
          setVoiceStatus('Izin mikrofon ditolak.');
        } else {
          setVoiceStatus(`Galat: ${event.error}`);
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        processVoiceCommand(text);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error(err);
      setVoiceStatus('Gagal memulai mikrofon.');
      setIsListening(false);
    }
  };

  // Stop Speech Recognition Engine
  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setVoiceStatus('Kendali suara dihentikan.');
    }
  };

  const getBrokerHostAndPort = () => {
    try {
      const cleanUrl = brokerUrl.replace('wss://', '').replace('ws://', '');
      const parts = cleanUrl.split(':');
      const host = parts[0].split('/')[0] || 'broker.emqx.io';
      return { host, port: '1883' };
    } catch (e) {
      return { host: 'broker.emqx.io', port: '1883' };
    }
  };

  const generateArduinoCode = () => {
    const { host } = getBrokerHostAndPort();
    const isLow = relayLogicMode === 'low';
    const activeLevelText = isLow ? 'ACTIVE LOW (Relay Module Indonesia)' : 'ACTIVE HIGH';
    const initValText = isLow ? 'HIGH' : 'LOW';
    const onValText = isLow ? 'LOW' : 'HIGH';
    const offValText = isLow ? 'HIGH' : 'LOW';

    return `/*
  ========================================================================
  KODE FIRMWARE ESP32 - KONTROL RELAY 4-SALURAN & SENSOR TELEMETRI (DHT22)
  Modul Relay: ${activeLevelText} (Lampu menyala jika pin bernilai ${onValText})
  ========================================================================
  Instruksi:
  1. Pasang library "PubSubClient" oleh Nick O'Leary di Arduino IDE.
  2. Pasang library "DHT sensor library" oleh Adafruit jika pakai sensor DHT22 fisik.
  3. Masukkan nama Wi-Fi (SSID) dan Password Wi-Fi Anda di bawah.
  4. Upload kode ini ke ESP32 Dev Board Anda.
  
  Format Topic yang Terintegrasi Hari Ini:
  - ESP32 Mendengarkan Perintah (Sub): ${pubTopic}
  - ESP32 Mengirimkan Status Telemetri (Pub): ${subTopic}
*/

#include <WiFi.h>
#include <PubSubClient.h>

// 1. Kredensial WiFi Lokal Anda
const char* ssid = "NAMA_WIFI_ANDA";       // Ganti dengan SSID Wi-Fi Anda
const char* password = "PASSWORD_WIFI_ANDA"; // Ganti dengan sandi Wi-Fi Anda

// 2. Broker MQTT Server Configuration (Disinkronkan dengan Website)
const char* mqtt_server = "${host}"; 
const int mqtt_port = 1883; // Port TCP standar untuk koneksi ESP32 tanpa SSL

// 3. Topik MQTT Komunikasi
const char* sub_topic = "${pubTopic}"; // Topik mendengarkan perintah dari web (esp32/relay/control)
const char* pub_topic = "${subTopic}"; // Topik feedback telemetry dari ESP32 (esp32/relay/status)

WiFiClient espClient;
PubSubClient client(espClient);

// Definisi Pemetaan Pin Fisik Relay Elektromagnetik pada board ESP32
// Menggunakan GPIO 5, 18, 19, 21 sesuai diagram skema
const int RELAY_PIN_1 = 5;  // Lampu 1
const int RELAY_PIN_2 = 18; // Lampu 2
const int RELAY_PIN_3 = 19; // Lampu 3
const int RELAY_PIN_4 = 21; // Lampu 4

// Uptime Tracker & Mock Sensor
unsigned long lastMsgTime = 0;
float currentTemp = 24.8;
float currentHumid = 62.0;

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Menghubungkan ke Wi-Fi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("Wi-Fi Sukses Terhubung!");
  Serial.print("Alamat IP ESP32: ");
  Serial.println(WiFi.localIP());
}

// Callback mendengarkan perintah masuk dari Website Broker
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Pesan diterima di topik [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  message.trim();
  String command = message;
  command.toUpperCase();

  // Parsing Perintah Sakelar Berdasarkan Payload Text
  if (command == "L1_ON") {
    digitalWrite(RELAY_PIN_1, ${onValText});
    client.publish(pub_topic, "{\\"lampu\\":1,\\"state\\":true}");
  } else if (command == "L1_OFF") {
    digitalWrite(RELAY_PIN_1, ${offValText});
    client.publish(pub_topic, "{\\"lampu\\":1,\\"state\\":false}");
  } else if (command == "L2_ON") {
    digitalWrite(RELAY_PIN_2, ${onValText});
    client.publish(pub_topic, "{\\"lampu\\":2,\\"state\\":true}");
  } else if (command == "L2_OFF") {
    digitalWrite(RELAY_PIN_2, ${offValText});
    client.publish(pub_topic, "{\\"lampu\\":2,\\"state\\":false}");
  } else if (command == "L3_ON") {
    digitalWrite(RELAY_PIN_3, ${onValText});
    client.publish(pub_topic, "{\\"lampu\\":3,\\"state\\":true}");
  } else if (command == "L3_OFF") {
    digitalWrite(RELAY_PIN_3, ${offValText});
    client.publish(pub_topic, "{\\"lampu\\":3,\\"state\\":false}");
  } else if (command == "L4_ON") {
    digitalWrite(RELAY_PIN_4, ${onValText});
    client.publish(pub_topic, "{\\"lampu\\":4,\\"state\\":true}");
  } else if (command == "L4_OFF") {
    digitalWrite(RELAY_PIN_4, ${offValText});
    client.publish(pub_topic, "{\\"lampu\\":4,\\"state\\":false}");
  } else if (command == "ALL_ON") {
    digitalWrite(RELAY_PIN_1, ${onValText});
    digitalWrite(RELAY_PIN_2, ${onValText});
    digitalWrite(RELAY_PIN_3, ${onValText});
    digitalWrite(RELAY_PIN_4, ${onValText});
    client.publish(pub_topic, "{\\"lampu1\\":true,\\"lampu2\\":true,\\"lampu3\\":true,\\"lampu4\\":true}");
  } else if (command == "ALL_OFF") {
    digitalWrite(RELAY_PIN_1, ${offValText});
    digitalWrite(RELAY_PIN_2, ${offValText});
    digitalWrite(RELAY_PIN_3, ${offValText});
    digitalWrite(RELAY_PIN_4, ${offValText});
    client.publish(pub_topic, "{\\"lampu1\\":false,\\"lampu2\\":false,\\"lampu3\\":false,\\"lampu4\\":false}");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ulang ke MQTT Broker...");
    String clientId = "ESP32_SmartRelay_" + String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("TERHUBUNG!");
      client.subscribe(sub_topic);
      client.publish(pub_topic, "{\\"system_status\\":\\"ONLINE\\"}");
    } else {
      Serial.print("GAGAL, Kode Status=");
      Serial.print(client.state());
      Serial.println(" coba lagi dalam 5 detik...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  pinMode(RELAY_PIN_1, OUTPUT);
  pinMode(RELAY_PIN_2, OUTPUT);
  pinMode(RELAY_PIN_3, OUTPUT);
  pinMode(RELAY_PIN_4, OUTPUT);

  // Set nilai awal berdasarkan tipe pemicu relay aktif (${initValText})
  digitalWrite(RELAY_PIN_1, ${initValText});
  digitalWrite(RELAY_PIN_2, ${initValText});
  digitalWrite(RELAY_PIN_3, ${initValText});
  digitalWrite(RELAY_PIN_4, ${initValText});

  setup_wifi();
  
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsgTime > 10000) {
    lastMsgTime = now;
    // Update simple simulated readings
    currentTemp = 24.0 + (random(0, 40) / 10.0);
    currentHumid = 60.0 + (random(0, 100) / 10.0);

    String telemetryPayload = "{\\"temp\\":" + String(currentTemp, 1) + 
                              ",\\"humidity\\":" + String(currentHumid, 1) + "}";
    
    Serial.print("Publish Sinyal Telemetry: ");
    Serial.println(telemetryPayload);
    client.publish(pub_topic, telemetryPayload.c_str());
  }
}
`;
  };

  const handleCopyCode = () => {
    const code = generateArduinoCode();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setLogs(prev => [
      ...prev,
      {
        id: generateLogId('copy_info'),
        time: timestamp,
        type: 'SYSTEM',
        msg: '📋 COPY_SUCCESS: Kode firmware C++ ESP32 disalin ke clipboard.'
      }
    ]);
  };

  // Switch hardware device profile
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const target = e.target.value as 'ESP32_RELAY_01' | 'ARDUINO_NANO_IOT' | 'RASPBERRY_PICO_W';
    setDeviceType(target);
    
    let targetIp = '192.168.1.104';
    if (target === 'ARDUINO_NANO_IOT') targetIp = '192.168.1.115';
    if (target === 'RASPBERRY_PICO_W') targetIp = '192.168.1.201';
    setIpAddress(targetIp);

    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setLogs(prev => [
      ...prev,
      {
        id: generateLogId('switch_profile'),
        time: timestamp,
        type: 'SYSTEM',
        msg: `SYSTEM_PVM: SWITCHED PROFILE TO ${target} (${targetIp})`
      }
    ]);
  };

  // Export logs to CSV
  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["ID,Time,Type,Message", ...logs.map(log => `"${log.id}","${log.time}","${log.type}","${log.msg}"`)].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `iot_telemetry_logs_${deviceType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Record action log
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setLogs(prev => [
      ...prev,
      {
        id: generateLogId('export_logs'),
        time: timestamp,
        type: 'SYSTEM',
        msg: `USER_ACTION: TELEMETRY DATA EXPORTED AS CSV (${logs.length} RECORDS)`
      }
    ]);
  };

  // Simulate diagnostic failure
  const handleSimulateOutage = () => {
    setIsSimulatedOutage(true);
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    setLogs(prev => [
      ...prev,
      { id: generateLogId('err1'), time: timestamp, type: 'ALERT', msg: '🚨 ERROR: SOCKET CONNECTION TIMEOUT over WebSocket channel (MQTT)' },
      { id: generateLogId('err2'), time: timestamp, type: 'SYSTEM', msg: '🔧 DIAGNOSTICS: Web client is simulating offline behavior...' }
    ]);

    // Automatically recover connection after 6 seconds
    setTimeout(() => {
      setIsSimulatedOutage(false);
      const recoveryTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
      setLogs(prev => [
        ...prev,
        { id: generateLogId('ok1'), time: recoveryTime, type: 'SYSTEM', msg: '✅ MQTT RECONNECTED: Session restored during simulation.' },
        { id: generateLogId('ok2'), time: recoveryTime, type: 'SENSOR', msg: `DATA_RECEIVED SYSTEM_UPTIME_SYNC OK | IP: ${ipAddress}` }
      ]);
    }, 6000);
  };

  // Helper formatting for uptime
  const formatUptimeValue = (secondsCount: number): string => {
    const hours = Math.floor(secondsCount / 3600);
    const minutes = Math.floor((secondsCount % 3600) / 60);
    const seconds = secondsCount % 60;
    return `${hours}j ${minutes}m ${seconds}s`;
  };

  // Clear Terminal state
  const handleClearLogs = () => {
    setLogs([]);
  };

  // Filtered Logs
  const filteredLogs = logs.filter(log => {
    if (activeLogFilter === 'ALL') return true;
    return log.type === activeLogFilter;
  });

  // Calculate percentage of temperature against a maximum safe display ceiling of 50°C
  const tempPercentage = Math.min(100, Math.max(0, (temp / 50) * 100));
  // Humidity percentage is the value itself
  const humidityPercentage = humidity;

  // Temperature Alarm State
  const tempAlarmLive = temp >= tempThreshold;
  // Humidity Alarm State
  const humidityAlarmLive = humidity <= humidityMinThreshold;

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen py-4 px-4 md:py-6 md:px-8 flex flex-col justify-between overflow-x-hidden" id="app_root">
      
      {/* 1. Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl backdrop-blur-md mb-4 gap-4" id="header_section">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 bg-zinc-800 text-zinc-400 font-mono text-[10px] uppercase font-bold rounded-md tracking-wider border border-zinc-700/60 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
              SISTEM GATEWAY: ACTIVE
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white mt-1.5 flex items-center gap-2">
            Sistem Monitoring & Kontrol IoT
          </h1>
          <p className="text-zinc-400 text-sm">Integrasi Real-time Rangkaian ESP32 / Arduino & Sensor Gateway</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Hardware Selector Dropdown */}
          <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-2xl">
            <Settings2 className="w-4 h-4 text-zinc-500" />
            <select 
              value={deviceType}
              onChange={handleDeviceChange}
              className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none cursor-pointer pr-1"
              title="Pilih Profile Hardware"
            >
              <option value="ESP32_RELAY_01" className="bg-zinc-900 text-zinc-300">ESP32 (Core Board)</option>
              <option value="ARDUINO_NANO_IOT" className="bg-zinc-900 text-zinc-300">Arduino Nano 33 IoT</option>
              <option value="RASPBERRY_PICO_W" className="bg-zinc-900 text-zinc-300">Raspberry Pi Pico W</option>
            </select>
          </div>

          {/* Connection Status Badge */}
          <button 
            onClick={() => {
              if (isConnected) {
                handleSimulateOutage();
              } else {
                setIsSimulatedOutage(false);
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border transition-all duration-300 text-xs font-semibold select-none group cursor-pointer ${
              isConnected 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
            }`}
            title="Klik untuk simulasi pemutusan jaringan"
          >
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-600'} transition-all`} />
            <span className="uppercase tracking-wider">{isConnected ? 'TERHUBUNG' : 'TERPUTUS'}</span>
            <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300 ml-1 font-normal">(Simulate Fail)</span>
          </button>

          {/* Timestamps Sync Status */}
          <div className="text-left md:text-right bg-zinc-900/30 border border-zinc-850/60 px-4 py-1.5 rounded-2xl min-w-[120px]">
            <div className="flex items-center gap-1.5 md:justify-end">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Last Sync</span>
              <div className={`w-1.5 h-1.5 rounded-full ${syncTick ? 'bg-orange-500 scale-150 animate-ping' : 'bg-zinc-600'} transition-all duration-150`} />
            </div>
            <p className="text-xs font-mono font-medium text-zinc-300 mt-0.5">{lastSyncTime || '--:--:--'} WIB</p>
          </div>
        </div>
      </header>

      {/* 2. Interactive Calibration Drawer Toolbar */}
      <div className="w-full mb-4" id="calibration_toolbar">
        <div className={`transition-all duration-300 rounded-2xl overflow-hidden border ${isCalibrating ? 'bg-zinc-900/85 border-zinc-700 py-5 px-6 mb-2 opacity-100 max-h-[1000px]' : 'bg-transparent border-transparent max-h-0 py-0 px-0 mb-0 opacity-0 pointer-events-none'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Left Column: Alerts and Thresholds */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                  Panel Kalibrasi & Konfigurasi Batas Alarm
                </h4>
                <p className="text-xs text-zinc-400">Atur parameter dan nilai threshold sensor untuk menguji pemrosesan sinyal sirkuit otomatis.</p>
              </div>
              
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 uppercase font-bold tracking-wider mb-1">
                    Maksimal Suhu Alert ({tempThreshold}°C)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="20" 
                      max="40" 
                      step="0.5" 
                      value={tempThreshold} 
                      onChange={(e) => setTempThreshold(parseFloat(e.target.value))}
                      className="w-full accent-orange-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                    <span className="text-xs font-mono text-zinc-300 min-w-[20px] text-right">{tempThreshold}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 uppercase font-bold tracking-wider mb-1">
                    Min Kelembapan Alert ({humidityMinThreshold}%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="30" 
                      max="80" 
                      step="1.0" 
                      value={humidityMinThreshold} 
                      onChange={(e) => setHumidityMinThreshold(parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                    <span className="text-xs font-mono text-zinc-300 min-w-[20px] text-right">{humidityMinThreshold}</span>
                  </div>
                </div>

                {/* Mode Simulasi Toggle */}
                <div className="bg-zinc-950 px-3 py-2.5 rounded-xl border border-zinc-800/80 flex justify-between items-center mt-3">
                  <div>
                    <span className="block text-[10px] text-zinc-300 font-extrabold uppercase tracking-wider">Mode Simulasi Sensor</span>
                    <span className="text-[9px] text-zinc-500 font-semibold leading-tight block mt-0.5">Jika aktif, sensor berfluktuasi otomatis. Matikan agar nilai 100% riil dari DHT11 ESP32.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulationEnabled(!isSimulationEnabled);
                      const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
                      setLogs(prev => [
                        ...prev,
                        {
                          id: generateLogId('sim_toggle'),
                          time: timestamp,
                          type: 'SYSTEM',
                          msg: `SYSTEM_CFG: Mode simulasi sensor diubah menjadi ${!isSimulationEnabled ? 'AKTIF' : 'NON-AKTIF'}.`
                        }
                      ]);
                    }}
                    className={`text-[9px] font-extrabold px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer border ${
                      isSimulationEnabled 
                        ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 font-black' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {isSimulationEnabled ? 'Aktif (Mock)' : 'Non-Aktif (Riil)'}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button 
                    onClick={() => {
                      setTemp(28.5);
                      setHumidity(62.0);
                      setTempThreshold(29.5);
                      setHumidityMinThreshold(45.0);
                      setIsSimulationEnabled(false);
                      
                      const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
                      setLogs(prev => [
                        ...prev,
                        { id: generateLogId('reset'), time: timestamp, type: 'SYSTEM', msg: 'SYSTEM_RESET: Calibration constants reverted to defaults.' }
                      ]);
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3.5 py-1.5 rounded-xl border border-zinc-700 font-semibold cursor-pointer transition-colors"
                  >
                    Reset Default Dials
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Real MQTT Connection Credentials */}
            <div className="border-t md:border-t-0 md:border-l border-zinc-800/80 md:pl-6 pt-4 md:pt-0 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Signal className="w-4 h-4 text-emerald-400" />
                  Konfigurasi Jaringan & Broker MQTT (WS)
                </h4>
                <p className="text-xs text-zinc-400">Atur kredensial MQTT WebSockets agar bisa berinteraksi langsung dengan ESP32 fisik.</p>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">
                    Broker WebSocket URL (ws:// atau wss://)
                  </label>
                  <input 
                    type="text"
                    value={inputBrokerUrl}
                    onChange={(e) => setInputBrokerUrl(e.target.value)}
                    placeholder="wss://broker.emqx.io:8084/mqtt"
                    className="w-full text-xs font-mono bg-zinc-950 text-zinc-200 border border-zinc-800 px-3 py-1.5 rounded-xl focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">
                      Publish Topic (Tx)
                    </label>
                    <input 
                      type="text"
                      value={inputPubTopic}
                      onChange={(e) => setInputPubTopic(e.target.value)}
                      placeholder="esp32/relay/control"
                      className="w-full text-xs font-mono bg-zinc-950 text-zinc-200 border border-zinc-800 px-3 py-1.5 rounded-xl focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">
                      Subscribe Topic (Rx / Feedback)
                    </label>
                    <input 
                      type="text"
                      value={inputSubTopic}
                      onChange={(e) => setInputSubTopic(e.target.value)}
                      placeholder="esp32/relay/status"
                      className="w-full text-xs font-mono bg-zinc-950 text-zinc-200 border border-zinc-800 px-3 py-1.5 rounded-xl focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Active-Low and Active-High option */}
                <div className="bg-zinc-950 px-3 py-2.5 rounded-xl border border-zinc-800/80 flex justify-between items-center">
                  <div>
                    <span className="block text-[10px] text-zinc-300 font-extrabold uppercase tracking-wider">Logika Pemicu Relay</span>
                    <span className="text-[9px] text-zinc-500 font-semibold leading-tight block mt-0.5">Modul relay Indonesia (songle block) biasanya Active-Low.</span>
                  </div>
                  <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => setRelayLogicMode('low')}
                      className={`text-[9px] font-extrabold px-2.5 py-1.5 rounded-md transition-all uppercase tracking-wider cursor-pointer ${
                        relayLogicMode === 'low' 
                          ? 'bg-orange-550 text-white shadow-md font-black' 
                          : 'text-zinc-450 hover:text-zinc-300'
                      }`}
                    >
                      Active Low (0/ON)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRelayLogicMode('high')}
                      className={`text-[9px] font-extrabold px-2.5 py-1.5 rounded-md transition-all uppercase tracking-wider cursor-pointer ${
                        relayLogicMode === 'high' 
                          ? 'bg-orange-550 text-white shadow-md font-black' 
                          : 'text-zinc-450 hover:text-zinc-300'
                      }`}
                    >
                      Active High (1/ON)
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase">Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setInputBrokerUrl('wss://broker.emqx.io:8084/mqtt');
                        setInputPubTopic('esp32/relay/control');
                        setInputSubTopic('esp32/relay/status');
                      }}
                      className="text-[9px] bg-zinc-800 hover:bg-zinc-750 font-bold px-2 py-1 rounded text-zinc-300 cursor-pointer"
                    >
                      EMQX Public
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputBrokerUrl('wss://broker.hivemq.com:8884/mqtt');
                        setInputPubTopic('esp32/relay/control');
                        setInputSubTopic('esp32/relay/status');
                      }}
                      className="text-[9px] bg-zinc-800 hover:bg-zinc-750 font-bold px-2 py-1 rounded text-zinc-300 cursor-pointer"
                    >
                      HiveMQ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInputBrokerUrl('ws://192.168.1.104:9001');
                        setInputPubTopic('esp32/relay/control');
                        setInputSubTopic('esp32/relay/status');
                      }}
                      className="text-[9px] bg-zinc-800 hover:bg-zinc-750 font-bold px-2 py-1 rounded text-zinc-300 cursor-pointer"
                      title="Gunakan IP lokal (port WS default local MQTT)"
                    >
                      Local WS IP
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setBrokerUrl(inputBrokerUrl);
                      setPubTopic(inputPubTopic);
                      setSubTopic(inputSubTopic);

                      // Sync custom credentials live to back-end node bridge
                      try {
                        const response = await fetch('/api/relay/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            brokerUrl: inputBrokerUrl,
                            pubTopic: inputPubTopic,
                            subTopic: inputSubTopic
                          })
                        });

                        const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
                        
                        if (response.ok) {
                          setLogs(prev => [
                            ...prev,
                            {
                              id: generateLogId('bridge_updated'),
                              time: timestamp,
                              type: 'SYSTEM',
                              msg: `🔄 BRIDGE OK: Konfigurasi broker & topik berhasil disinkronkan ke server backend.`
                            }
                          ]);
                        }
                      } catch (e) {
                        console.error("Failed to post configuration to backend", e);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase tracking-wider px-3.5 py-1.5 font-bold rounded-xl cursor-pointer transition-colors active:scale-95 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-200" />
                    Hubungkan Jaringan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsCalibrating(c => !c)}
          className={`flex items-center gap-2 py-1.5 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
            isCalibrating 
              ? 'bg-orange-500/10 text-orange-400 border-orange-500/45 hover:bg-orange-500/20' 
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isCalibrating ? 'Sembunyikan Pengaturan MQTT & Batas Alarm' : 'Buka Pengaturan MQTT & Kalibrasi Hambatan'}</span>
        </button>
      </div>

      {/* 3. Main Interlocking Bento Grid Component */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 md:grid-rows-6 gap-4 min-h-[580px] mb-4" id="bento_container">
        
        {/* CARD A: Temp Card (col-span-4 row-span-3) */}
        <div 
          className={`col-span-1 md:col-span-4 md:row-span-3 rounded-[2rem] p-6 flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 group overflow-hidden relative border ${
            tempAlarmLive 
              ? 'bg-red-950/20 border-red-500/50 hover:border-red-400/80 shadow-red-950/10 shadow-lg' 
              : 'bg-zinc-900/60 border-zinc-850 shadow-md'
          }`}
          id="card_temperature"
        >
          {/* Card Accent Glow */}
          <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 rounded-full transition-colors ${tempAlarmLive ? 'bg-red-500' : 'bg-orange-500'}`} />

          <div className="flex justify-between items-start z-10">
            <div className={`p-3 rounded-2xl transition-colors ${tempAlarmLive ? 'bg-red-500/10 text-red-400 animate-pulse' : 'bg-orange-500/10 text-orange-400'}`}>
              <Thermometer className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">SUHU RUANGAN</span>
              
              {tempAlarmLive ? (
                <span className="text-[9px] font-semibold bg-red-500/25 border border-red-500/30 text-red-400 px-2.5 py-0.5 rounded-full animate-pulse mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> OVERHEAT
                </span>
              ) : (
                <span className="text-[9px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full mt-1.5">
                  STATUS: OPTIMAL
                </span>
              )}
            </div>
          </div>

          <div className="my-3 z-10">
            <div className={`text-6xl md:text-7.5xl font-light tracking-tighter flex items-baseline leading-none transition-colors ${tempAlarmLive ? 'text-red-400' : 'text-zinc-100'}`}>
              {temp.toFixed(1)}
              <span className="text-3xl text-zinc-500 ml-0.5">°C</span>
            </div>
            
            {/* Quick adjusters inside the card to override simulation values */}
            <div className="mt-4 flex items-center justify-between bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/40">
              <span className="text-[10px] text-zinc-500 font-medium">Kalibrasi Suhu:</span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setTemp(parseFloat((temp - 0.5).toFixed(1)))}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-[6px] text-sm font-bold cursor-pointer transition-colors active:scale-95"
                  title="Kurangi suhu 0.5°C"
                >
                  -
                </button>
                <span className="text-[11px] font-mono font-bold text-zinc-300 w-9 text-center bg-zinc-950 px-1 py-0.5 rounded">
                  {temp > 0 ? '+' : ''}{temp.toFixed(1)}
                </span>
                <button 
                  onClick={() => setTemp(parseFloat((temp + 0.5).toFixed(1)))}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-[6px] text-sm font-bold cursor-pointer transition-colors active:scale-95"
                  title="Tambah suhu 0.5°C"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="w-full space-y-1.5 z-10">
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Batas Bawah ({tempThreshold - 10}°C)</span>
              <span className="font-semibold text-zinc-400">Limit Redline: {tempThreshold}°C</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
              <div 
                className={`h-full transition-all duration-300 rounded-full ${
                  tempAlarmLive 
                    ? 'bg-gradient-to-r from-red-600 to-rose-400 animate-pulse' 
                    : 'bg-gradient-to-r from-orange-500 to-amber-400'
                }`}
                style={{ width: `${tempPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* CARD B: Humidity Card (col-span-4 row-span-3) */}
        <div 
          className={`col-span-1 md:col-span-4 md:row-span-3 rounded-[2rem] p-6 flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 group overflow-hidden relative border ${
            humidityAlarmLive 
              ? 'bg-blue-950/25 border-blue-500/40 hover:border-blue-400/80 shadow-blue-950/10 shadow-lg' 
              : 'bg-zinc-900/60 border-zinc-850 shadow-md'
          }`}
          id="card_humidity"
        >
          {/* Card Accent Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/15 blur-3xl opacity-10 rounded-full" />

          <div className="flex justify-between items-start z-10">
            <div className={`p-3 rounded-2xl transition-colors ${humidityAlarmLive ? 'bg-blue-500/10 text-blue-400 animate-pulse' : 'bg-blue-500/10 text-blue-400'}`}>
              <Droplet className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">KELEMBAPAN</span>
              
              {humidityAlarmLive ? (
                <span className="text-[9px] font-semibold bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-2.5 py-0.5 rounded-full animate-pulse mt-1.5 flex items-center gap-1">
                  💡 KONDISI KERING
                </span>
              ) : (
                <span className="text-[9px] font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full mt-1.5">
                  KONDISI: LEMBAP
                </span>
              )}
            </div>
          </div>

          <div className="my-3 z-10">
            <div className={`text-6xl md:text-7.5xl font-light tracking-tighter flex items-baseline leading-none transition-colors ${humidityAlarmLive ? 'text-blue-400' : 'text-zinc-100'}`}>
              {humidity.toFixed(1)}
              <span className="text-3xl text-zinc-500 ml-0.5">%</span>
            </div>

            {/* Quick adjusters inside the humidity card */}
            <div className="mt-4 flex items-center justify-between bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/40">
              <span className="text-[10px] text-zinc-500 font-medium">Kalibrasi Lembap:</span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setHumidity(parseFloat((humidity - 1).toFixed(1)))}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-[6px] text-sm font-bold cursor-pointer transition-colors active:scale-95"
                  title="Kurangi kelembapan 1%"
                >
                  -
                </button>
                <span className="text-[11px] font-mono font-bold text-zinc-300 w-9 text-center bg-zinc-950 px-1 py-0.5 rounded">
                  {humidity.toFixed(0)}%
                </span>
                <button 
                  onClick={() => setHumidity(parseFloat((humidity + 1).toFixed(1)))}
                  className="w-7 h-7 flex items-center justify-center bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-[6px] text-sm font-bold cursor-pointer transition-colors active:scale-95"
                  title="Tambah kelembapan 1%"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="w-full space-y-1.5 z-10">
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Threshold Bawah ({humidityMinThreshold}%)</span>
              <span className="font-semibold text-zinc-400">Level Saat Ini: {humidity.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 rounded-full"
                style={{ width: `${humidityPercentage}%` }}
                      />
            </div>
          </div>
        </div>

        {/* CARD C: Relay Controls Card (col-span-4 row-span-4) - HIGHLIGHT card style with light background */}
        <div 
          className="col-span-1 md:col-span-4 md:row-span-4 bg-zinc-50 text-zinc-950 rounded-[2rem] p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden group border border-zinc-300/40"
          id="card_controls"
        >
          {/* Ambient overlay representing high-tech circuit grids */}
          <div className="absolute inset-0 bg-[radial-gradient(#e4e4e7_1.2px,transparent_1.2px)] [background-size:16px_16px] opacity-30 pointer-events-none" />

          <div>
            <div className="flex justify-between items-center mb-4 relative z-10">
              <span className="px-2.5 py-1 bg-zinc-950 text-white text-[9px] font-bold rounded-lg uppercase tracking-wider">
                KONTROL AKTUATOR
              </span>
              
              {/* Glowing smart bulb indicator */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${
                (relayLampu1 || relayLampu2 || relayLampu3 || relayLampu4)
                  ? 'bg-amber-400 text-zinc-950 shadow-amber-400/40 scale-110 animate-pulse' 
                  : 'bg-zinc-300 text-zinc-500'
              }`}>
                <Lightbulb className="w-5 h-5" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold leading-tight tracking-tight text-zinc-900">
              Relay Lampu (Ch 1 - 4)
            </h2>
            <p className="text-zinc-650 text-xs mt-1 leading-relaxed font-semibold">
              Aktifkan sirkuit relay elektromagnetik untuk Lampu 1 s/d 4 secara real-time.
            </p>
          </div>

          {/* Visualisasi Lampu Interaktif */}
          <div className="grid grid-cols-4 gap-2 mt-3 mb-1 z-10 relative">
            {[
              { id: 1 as const, label: 'Lampu 1', state: relayLampu1 },
              { id: 2 as const, label: 'Lampu 2', state: relayLampu2 },
              { id: 3 as const, label: 'Lampu 3', state: relayLampu3 },
              { id: 4 as const, label: 'Lampu 4', state: relayLampu4 }
            ].map((lamp) => (
              <button
                key={lamp.id}
                onClick={() => handleToggleLampu(lamp.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 cursor-pointer ${
                  lamp.state 
                    ? 'bg-amber-500/10 border-amber-300 shadow-[0_4px_12px_rgba(245,158,11,0.15)] scale-[1.03]' 
                    : 'bg-zinc-200/50 border-zinc-300/40 hover:bg-zinc-200/80'
                }`}
                title={`Klik untuk menyalakan/mematikan ${lamp.label}`}
              >
                <div className={`relative p-2.5 rounded-full transition-all duration-300 ${
                  lamp.state 
                    ? 'bg-amber-400 text-zinc-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]' 
                    : 'bg-zinc-300 text-zinc-500'
                }`}>
                  <Lightbulb className="w-5 h-5" />
                  {lamp.state && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-extrabold text-zinc-800 mt-2 tracking-tight uppercase leading-none">
                  {lamp.label}
                </span>
                <span className={`text-[8px] font-black tracking-wider mt-1 px-1.5 py-0.5 rounded leading-none ${
                  lamp.state ? 'bg-amber-200/80 text-amber-950' : 'bg-zinc-300/70 text-zinc-650'
                }`}>
                  {lamp.state ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Master Controls */}
          <div className="flex items-center gap-2 mt-3 mb-1.5 relative z-10 bg-zinc-200/50 p-1 rounded-xl border border-zinc-350/50">
            <button
              onClick={() => handleMasterLampu(true)}
              className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] uppercase rounded-lg tracking-wider transition-colors duration-200 cursor-pointer text-center"
              title="Nyalakan semua lampu relays"
            >
              Nyalakan Semua
            </button>
            <button
              onClick={() => handleMasterLampu(false)}
              className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-[9px] uppercase rounded-lg tracking-wider transition-colors duration-200 cursor-pointer text-center"
              title="Matikan semua lampu relays"
            >
              Matikan Semua
            </button>
          </div>

          <div className="space-y-2 my-2.5 z-10 flex-1 overflow-y-auto pr-1">
            {/* Control Toggle 1 */}
            <div className="flex items-center justify-between p-2.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${relayLampu1 ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-extrabold text-xs text-zinc-900 uppercase tracking-tight">Lampu 1 (Relay Ch 1)</h5>
                  <p className="text-[10px] text-zinc-550 font-bold">{relayLampu1 ? 'Status: ON (HIGH)' : 'Status: OFF (LOW)'} | Pin D5</p>
                </div>
              </div>

              <button 
                onClick={() => handleToggleLampu(1)}
                className={`w-14 h-7 rounded-full p-0.5 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayLampu1 ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Memicu relay lampu 1"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayLampu1 ? 'translate-x-7 bg-amber-400 text-zinc-950' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Control Toggle 2 */}
            <div className="flex items-center justify-between p-2.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${relayLampu2 ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-extrabold text-xs text-zinc-900 uppercase tracking-tight">Lampu 2 (Relay Ch 2)</h5>
                  <p className="text-[10px] text-zinc-550 font-bold">{relayLampu2 ? 'Status: ON (HIGH)' : 'Status: OFF (LOW)'} | Pin D6</p>
                </div>
              </div>

              <button 
                onClick={() => handleToggleLampu(2)}
                className={`w-14 h-7 rounded-full p-0.5 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayLampu2 ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Memicu relay lampu 2"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayLampu2 ? 'translate-x-7 bg-amber-400 text-zinc-950' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Control Toggle 3 */}
            <div className="flex items-center justify-between p-2.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${relayLampu3 ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-extrabold text-xs text-zinc-900 uppercase tracking-tight">Lampu 3 (Relay Ch 3)</h5>
                  <p className="text-[10px] text-zinc-550 font-bold">{relayLampu3 ? 'Status: ON (HIGH)' : 'Status: OFF (LOW)'} | Pin D7</p>
                </div>
              </div>

              <button 
                onClick={() => handleToggleLampu(3)}
                className={`w-14 h-7 rounded-full p-0.5 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayLampu3 ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Memicu relay lampu 3"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayLampu3 ? 'translate-x-7 bg-amber-400 text-zinc-950' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            {/* Control Toggle 4 */}
            <div className="flex items-center justify-between p-2.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${relayLampu4 ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-extrabold text-xs text-zinc-900 uppercase tracking-tight">Lampu 4 (Relay Ch 4)</h5>
                  <p className="text-[10px] text-zinc-550 font-bold">{relayLampu4 ? 'Status: ON (HIGH)' : 'Status: OFF (LOW)'} | Pin D8</p>
                </div>
              </div>

              <button 
                onClick={() => handleToggleLampu(4)}
                className={`w-14 h-7 rounded-full p-0.5 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayLampu4 ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Memicu relay lampu 4"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayLampu4 ? 'translate-x-7 bg-amber-400 text-zinc-950' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[10px] opacity-75 font-mono z-10 text-zinc-650 mt-2">
            <div className="flex justify-between border-t border-zinc-300/80 pt-2 font-bold">
              <span>DEVICE_ID:</span>
              <span>{deviceType}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>SHIELD RELAY:</span>
              <span>4-CHANNEL COUPLING RELAY</span>
            </div>
          </div>
        </div>

        {/* CARD D: Logs and Telemetry Terminal (col-span-8 row-span-3) */}
        <div 
          className="col-span-1 md:col-span-8 md:row-span-3 bg-zinc-900/60 border border-zinc-850 rounded-[2rem] p-6 flex flex-col justify-between shadow-lg overflow-hidden relative"
          id="card_logs_stream"
        >
          {/* Terminal Title Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-zinc-800 text-zinc-400 rounded-lg">
                <Terminal className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Data Aliran Sensor & PVM Syslog
                </h3>
                <p className="text-[10px] text-zinc-500 font-medium">Real-time log stream dari port serial baudrate 115200</p>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button 
                onClick={handleExportCSV}
                className="text-[10px] bg-zinc-850 hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg font-bold border border-zinc-800/80 transition-colors flex items-center gap-1.5 cursor-pointer hover:text-white"
                title="Ekspor telemetry saat ini ke format .csv"
              >
                <FileDown className="w-3 h-3 text-zinc-400" />
                EKSPOR CSV
              </button>
              
              <button 
                onClick={handleClearLogs}
                className="text-[10px] bg-zinc-850/60 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-lg border border-zinc-805/40 hover:border-red-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Clear terminal logs"
              >
                <Trash2 className="w-3 h-3 text-zinc-500" />
                CLEAR
              </button>
            </div>
          </div>

          {/* Filter badges bar */}
          <div className="flex gap-1.5 flex-wrap mb-3.5" id="log_filters">
            {(['ALL', 'SENSOR', 'CMD', 'ALERT', 'SYSTEM'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setActiveLogFilter(filter)}
                className={`text-[9px] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
                  activeLogFilter === filter 
                    ? 'bg-zinc-100 text-zinc-950 border-zinc-200 shadow-sm' 
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                {filter === 'ALL' ? 'SEMUA LOGS' : filter}
              </button>
            ))}
          </div>

          {/* Live scrolling logs area */}
          <div className="flex-1 font-mono text-[11px] space-y-2 overflow-y-auto max-h-[140px] md:max-h-[180px] bg-zinc-950/70 p-4 rounded-xl border border-zinc-900 scrollbar-thin scrollbar-thumb-zinc-800">
            {filteredLogs.length === 0 ? (
              <p className="text-zinc-650 italic text-center py-6">Tidak ada pesan log yang sesuai dengan filter filter.</p>
            ) : (
              filteredLogs.map(log => {
                let colorClass = 'text-zinc-400';
                if (log.type === 'ALERT') colorClass = 'text-rose-400 font-bold';
                if (log.type === 'CMD') colorClass = 'text-amber-400';
                if (log.type === 'SYSTEM') colorClass = 'text-cyan-400';

                return (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:gap-4 border-b border-zinc-900/30 pb-1 hover:bg-zinc-900/20 px-1 rounded transition-colors">
                    <span className="text-zinc-650 shrink-0 font-semibold">[{log.time}]</span> 
                    <span className={`px-1.5 py-0.2 select-none text-[8px] tracking-wider rounded border mr-1 font-sans font-extrabold uppercase shrink-0 min-w-[55px] text-center ${
                      log.type === 'ALERT' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      log.type === 'CMD' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      log.type === 'SYSTEM' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {log.type}
                    </span>
                    <span className={`${colorClass} mt-0.5 sm:mt-0 font-medium break-all`}>{log.msg}</span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>

          <div className="mt-3 flex justify-between items-center text-[9px] text-zinc-500 font-semibold font-mono uppercase bg-zinc-900/10 border-t border-zinc-850/45 pt-2">
            <span>BAUDRATE: 115200 KBPS</span>
            <span>AUTO-SCROLL: AKTIF</span>
          </div>
        </div>

        {/* CARD E: System Health & Asisten Suara (col-span-4 row-span-2) */}
        <div 
          className="col-span-1 md:col-span-4 md:row-span-2 bg-zinc-900/60 border border-zinc-850 rounded-[2rem] p-6 flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md"
          id="card_system_health"
        >
          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/40">
            <div className="flex bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-805/80">
              <button
                type="button"
                onClick={() => setActiveVoiceTab('voice')}
                className={`text-[9px] font-bold px-2 py-1 rounded transition-all cursor-pointer ${
                  activeVoiceTab === 'voice' ? 'bg-orange-600 text-white shadow font-extrabold' : 'text-zinc-500 hover:text-zinc-350'
                }`}
              >
                KENDALI SUARA
              </button>
              <button
                type="button"
                onClick={() => setActiveVoiceTab('system')}
                className={`text-[9px] font-bold px-2 py-1 rounded transition-all cursor-pointer ${
                  activeVoiceTab === 'system' ? 'bg-orange-600 text-white shadow font-extrabold' : 'text-zinc-500 hover:text-zinc-350'
                }`}
              >
                SISTEM
              </button>
            </div>
            
            <div className="flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-900">
              <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[8px] font-bold text-zinc-400 font-sans uppercase">
                {isListening ? 'Mendengarkan' : 'SIAP'}
              </span>
            </div>
          </div>

          {activeVoiceTab === 'voice' ? (
            <div className="flex flex-col flex-1 justify-between gap-2.5 mt-3">
              {/* Voice action controls */}
              <div className="flex items-center gap-3">
                {/* Floating pulsating microphone */}
                <button
                  type="button"
                  onClick={isListening ? stopSpeechRecognition : startSpeechRecognition}
                  className={`relative shrink-0 w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-300 cursor-pointer ${
                    isListening
                      ? 'bg-amber-500/10 border-amber-450 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] scale-105'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-750 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={isListening ? 'Hentikan asisten' : 'Ketuk untuk bicara'}
                >
                  {isListening && (
                    <span className="absolute inset-x-0 inset-y-0 rounded-full border border-amber-400/40 animate-ping" />
                  )}
                  {isListening ? <Mic className="w-5 h-5 text-amber-400" /> : <MicOff className="w-5 h-5" />}
                </button>

                {/* Assistant prompt bubble status */}
                <div className="flex-1 min-w-0">
                  <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                    TRANSKRIP AUDIO / ASISTEN
                  </span>
                  
                  {transcript ? (
                    <p className="text-zinc-200 font-bold text-xs truncate leading-tight">
                      "{transcript}"
                    </p>
                  ) : (
                    <p className="text-zinc-400 italic text-[11px] leading-tight">
                      {isListening ? 'Katakan perintah ke mikrofon...' : 'Ketuk mikrofon di kiri lalu bicara'}
                    </p>
                  )}

                  <p className="text-[9px] font-mono text-orange-400/90 tracking-wide mt-1 truncate leading-none">
                    {voiceStatus}
                  </p>
                </div>
              </div>

              {/* Commands guide legend */}
              <div className="bg-zinc-950/85 p-2.5 rounded-2xl border border-zinc-850/80">
                <div className="flex justify-between items-center mb-1 pb-1 border-b border-zinc-900">
                  <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-wider">
                    Daftar Perintah Valid
                  </span>
                  {/* TTS Switch */}
                  <label className="flex items-center gap-1 cursor-pointer text-[8px] font-bold text-zinc-400 select-none">
                    <input
                      type="checkbox"
                      checked={useSpeechSynthesis}
                      onChange={(e) => setUseSpeechSynthesis(e.target.checked)}
                      className="accent-orange-500 w-2.5 h-2.5 rounded cursor-pointer"
                    />
                    TTS Respon
                  </label>
                </div>
                
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8.5px] font-mono text-zinc-400 leading-tight">
                  <div>
                    <span className="text-orange-400/90">"Nyalakan Lampu [1-4]"</span>
                  </div>
                  <div>
                    <span className="text-orange-400/90">"Matikan Lampu [1-4]"</span>
                  </div>
                  <div>
                    <span className="text-zinc-350 font-medium">"Nyalakan Semua"</span> / <span className="text-zinc-500">all on</span>
                  </div>
                  <div>
                    <span className="text-zinc-350 font-medium">"Matikan Semua"</span> / <span className="text-zinc-500">all off</span>
                  </div>
                  <div className="col-span-2 text-zinc-350 border-t border-zinc-900 pt-1 mt-0.5 flex justify-between">
                    <span>"Cek Status Sensor"</span>
                    {lastMatchedCommand && (
                      <span className="text-emerald-400 text-[8px] font-bold uppercase shrink-0">
                        Match: {lastMatchedCommand}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 py-1 flex-1 items-center">
                {/* Signal strength element */}
                <div className="border-r border-zinc-800/55 pr-4">
                  <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-tight mb-2 flex items-center gap-1.5">
                    <Signal className="w-3.5 h-3.5 text-emerald-400" />
                    Kekuatan Sinyal
                  </p>
                  
                  <div className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-2xl font-bold font-mono tracking-tight text-zinc-200">
                      {isConnected ? rssi : '0'}
                    </span>
                    <span className="text-[9px] text-zinc-600 font-bold uppercase font-mono">dBm</span>
                  </div>

                  {/* Responsive wireless bars indicator */}
                  <div className="flex items-end gap-1 h-6">
                    <div className={`w-1.5 h-2 rounded-sm ${isConnected && rssi >= -80 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                    <div className={`w-1.5 h-3.5 rounded-sm ${isConnected && rssi >= -70 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                    <div className={`w-1.5 h-4.5 rounded-sm ${isConnected && rssi >= -65 ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
                    <div className={`w-1.5 h-5.5 rounded-sm ${isConnected && rssi >= -60 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-800'}`} />
                  </div>
                </div>

                {/* Micro timer counter */}
                <div className="pl-2">
                  <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-tight mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400 animate-spin-slow" />
                    Uptime
                  </p>
                  <p className="text-lg md:text-xl font-bold text-zinc-100 font-mono tracking-tight leading-none">
                    {formatUptimeValue(uptime)}
                  </p>
                  <div className="text-[10px] text-zinc-500 font-mono mt-2 overflow-hidden text-ellipsis whitespace-nowrap">
                    PVM_LOAD: 1.25%
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center text-[9px] text-zinc-600 font-mono border-t border-zinc-800/40 pt-2">
                <span>RSSI: {isConnected ? 'EXCELLENT' : 'RECONNECTING'}</span>
                <span>MAC: EE:22:DF:34:CC:12</span>
              </div>
            </>
          )}
        </div>

      </main>

      {/* 4. Footer Info Section */}
      <footer className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 bg-zinc-900/10 border-t border-zinc-900 rounded-2xl gap-3" id="footer_section">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5 text-center sm:text-left">
          <Layers className="w-3.5 h-3.5 text-zinc-500" />
          Hardware Connection Protocol: MQTT over secure WebSocket (Port: 8883)
        </p>
        <p className="text-[10px] text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-lg">
          Node IP: <strong className="text-zinc-200">{ipAddress}</strong>
        </p>
      </footer>
    </div>
  );
}
