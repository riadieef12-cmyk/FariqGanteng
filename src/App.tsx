/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  HardDrive
} from 'lucide-react';

interface LogEntry {
  id: string;
  time: string;
  type: 'SENSOR' | 'CMD' | 'ALERT' | 'SYSTEM';
  msg: string;
}

export default function App() {
  // Connection State
  const [isConnected, setIsConnected] = useState<boolean>(true);
  
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
  
  // Actuator/Control States
  const [relayLight, setRelayLight] = useState<boolean>(true);
  const [relayFan, setRelayFan] = useState<boolean>(false);
  
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

  // Scroll to bottom of terminal whenever logs array updates
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Sensor drift simulation (Real-time updates)
  useEffect(() => {
    if (!isConnected) return;

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

      // Randomly push SENSOR logs (35% probability or if threshold triggered)
      const shouldLog = Math.random() < 0.35;
      let newLogsList: LogEntry[] = [];

      // Check Alarms
      const tempAlertTriggered = nextTemp >= tempThreshold;
      const humidAlertTriggered = nextHum <= humidityMinThreshold;

      if (tempAlertTriggered) {
        newLogsList.push({
          id: Date.now().toString() + '_t_warn',
          time: timestamp,
          type: 'ALERT',
          msg: `⚠️ SUHU TINGGI MELEBIHI AMBANG BATAS: ${nextTemp}°C (Ambang: ${tempThreshold}°C)`
        });
      }

      if (humidAlertTriggered) {
        newLogsList.push({
          id: Date.now().toString() + '_h_warn',
          time: timestamp,
          type: 'ALERT',
          msg: `⚠️ KELEMBAPAN RENDAH: ${nextHum}% (Ambang Min: ${humidityMinThreshold}%)`
        });
      }

      if (shouldLog && !tempAlertTriggered && !humidAlertTriggered) {
        newLogsList.push({
          id: Date.now().toString(),
          time: timestamp,
          type: 'SENSOR',
          msg: `DATA_RECEIVED TEMP: ${nextTemp}°C | HUM: ${nextHum}% | RSSI: ${nextRssi}dBm`
        });
      }

      if (newLogsList.length > 0) {
        setLogs(prev => [...prev, ...newLogsList].slice(-40)); // Keep last 40 logs
      }

    }, 3500);

    return () => clearInterval(sensorTicker);
  }, [temp, humidity, isConnected, tempThreshold, humidityMinThreshold, rssi]);

  // Toggle controls helper
  const handleToggleLight = () => {
    const nextState = !relayLight;
    setRelayLight(nextState);
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    // Add command log
    setLogs(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        time: timestamp,
        type: 'CMD',
        msg: `CMD_SENT RELAY_MAIN_LIGHT -> ${nextState ? 'ON (HIGH)' : 'OFF (LOW)'}`
      }
    ]);
  };

  const handleToggleFan = () => {
    const nextState = !relayFan;
    setRelayFan(nextState);
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    // Add command log
    setLogs(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        time: timestamp,
        type: 'CMD',
        msg: `CMD_SENT RELAY_AUX_FAN -> ${nextState ? 'ON (HIGH)' : 'OFF (LOW)'}`
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
        id: Date.now().toString(),
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
        id: Date.now().toString(),
        time: timestamp,
        type: 'SYSTEM',
        msg: `USER_ACTION: TELEMETRY DATA EXPORTED AS CSV (${logs.length} RECORDS)`
      }
    ]);
  };

  // Simulate diagnostic failure
  const handleSimulateOutage = () => {
    setIsConnected(false);
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    
    setLogs(prev => [
      ...prev,
      { id: Date.now().toString() + '_err1', time: timestamp, type: 'ALERT', msg: '🚨 ERROR: SOCKET CONNECTION TIMEOUT over port 8883 (MQTT secure)' },
      { id: Date.now().toString() + '_err2', time: timestamp, type: 'SYSTEM', msg: '🔧 DIAGNOSTICS: ESP32 client is attempting reconnection (Attempt 1/5)...' }
    ]);

    // Automatically recover connection after 6 seconds
    setTimeout(() => {
      setIsConnected(true);
      const recoveryTime = new Date().toLocaleTimeString('id-ID', { hour12: false });
      setLogs(prev => [
        ...prev,
        { id: Date.now().toString() + '_ok1', time: recoveryTime, type: 'SYSTEM', msg: '✅ MQTT RECONNECTED: Session restored successfully.' },
        { id: Date.now().toString() + '_ok2', time: recoveryTime, type: 'SENSOR', msg: `DATA_RECEIVED SYSTEM_UPTIME_SYNC OK | IP: ${ipAddress}` }
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
                setIsConnected(true);
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
        <div className={`transition-all duration-300 rounded-2xl overflow-hidden border ${isCalibrating ? 'bg-zinc-900/85 border-zinc-700 py-4 px-6 mb-2 opacity-100 max-h-[500px]' : 'bg-transparent border-transparent max-h-0 py-0 px-0 mb-0 opacity-0 pointer-events-none'}`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                Panel Kalibrasi & Konfigurasi Batas Alarm
              </h4>
              <p className="text-xs text-zinc-400">Atur parameter dan nilai threshold sensor untuk menguji pemrosesan sinyal sirkuit otomatis.</p>
            </div>
            <div className="flex flex-wrap gap-4 w-full md:w-auto">
              <div className="flex-1 min-w-[150px]">
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

              <div className="flex-1 min-w-[150px]">
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

              <div className="flex items-end">
                <button 
                  onClick={() => {
                    setTemp(24.8);
                    setHumidity(62.0);
                    setTempThreshold(29.5);
                    setHumidityMinThreshold(45.0);
                    
                    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
                    setLogs(prev => [
                      ...prev,
                      { id: Date.now().toString(), time: timestamp, type: 'SYSTEM', msg: 'SYSTEM_RESET: Calibration constants reverted to defaults.' }
                    ]);
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-xl border border-zinc-700 font-semibold cursor-pointer transition-colors w-full md:w-auto"
                >
                  Reset Default
                </button>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setIsCalibrating(c => !c)}
          className={`flex items-center gap-2 py-1.5 px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
            isCalibrating 
              ? 'bg-orange-500/10 text-orange-400 border-orange-500/40 hover:bg-orange-500/20' 
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isCalibrating ? 'Sembunyikan Menu Kalibrasi' : 'Buka Menu Kalibrasi Hambatan'}</span>
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
          className="col-span-1 md:col-span-4 md:row-span-4 bg-zinc-50 text-zinc-950 rounded-[2rem] p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden group border border-zinc-300/40"
          id="card_controls"
        >
          {/* Ambient overlay representing high-tech circuit grids */}
          <div className="absolute inset-0 bg-[radial-gradient(#e4e4e7_1.2px,transparent_1.2px)] [background-size:16px_16px] opacity-30 pointer-events-none" />

          <div>
            <div className="flex justify-between items-center mb-6 relative z-10">
              <span className="px-2.5 py-1 bg-zinc-950 text-white text-[9px] font-bold rounded-lg uppercase tracking-wider">
                KONTROL AKTIF
              </span>
              
              {/* Glowing smart bulb indicator */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${
                relayLight 
                  ? 'bg-amber-400 text-zinc-950 shadow-amber-400/40 scale-110' 
                  : 'bg-zinc-300 text-zinc-500'
              }`}>
                <Power className="w-5 h-5 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold leading-tight tracking-tight text-zinc-900">
              Lampu Ruang Utama
            </h2>
            <p className="text-zinc-650 text-xs md:text-sm mt-1.5 leading-relaxed font-medium">
              Tekan tombol sakelar di bawah untuk memicu relay elektromagnetik Arduino/ESP32 secara langsung.
            </p>
          </div>

          <div className="space-y-4 my-4 z-10">
            {/* Control Toggle 1: Main Bulb Relay */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-2xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${relayLight ? 'bg-amber-500 animate-ping' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-bold text-xs text-zinc-900 uppercase tracking-tight">Main Relay (D5)</h5>
                  <p className="text-[10px] text-zinc-650 font-semibold">{relayLight ? 'Status: AKTIF' : 'Status: NONAKTIF'}</p>
                </div>
              </div>

              <button 
                onClick={handleToggleLight}
                className={`w-16 h-8 rounded-full p-1 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayLight ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Toggle Relay Lampu"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayLight ? 'translate-x-8 bg-amber-400 text-zinc-950' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5 font-bold" />
                </div>
              </button>
            </div>

            {/* Control Toggle 2: Exhaust Fan Relay */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-200/60 hover:bg-zinc-200/90 rounded-2xl transition-all border border-zinc-300/60">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${relayFan ? 'bg-blue-500 animate-spin' : 'bg-zinc-400'}`} />
                <div>
                  <h5 className="font-bold text-xs text-zinc-900 uppercase tracking-tight">Aux Fan Relay (D6)</h5>
                  <p className="text-[10px] text-zinc-650 font-semibold">{relayFan ? 'Sirkulasi: BERPUTAR' : 'Sirkulasi: BERHENTI'}</p>
                </div>
              </div>

              <button 
                onClick={handleToggleFan}
                className={`w-16 h-8 rounded-full p-1 transition-colors duration-300 cursor-pointer flex items-center relative ${
                  relayFan ? 'bg-zinc-950' : 'bg-zinc-300'
                }`}
                title="Toggle Relay Kipas"
              >
                <div 
                  className={`w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                    relayFan ? 'translate-x-8 bg-blue-500 text-white' : 'translate-x-0 bg-white text-zinc-400'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[10px] opacity-75 font-mono z-10 text-zinc-600 mt-2">
            <div className="flex justify-between border-t border-zinc-300/80 pt-2 font-bold">
              <span>DEVICE_ID:</span>
              <span>{deviceType}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>HARDWARE:</span>
              <span>ESP8266 / ESP32 SOCKET API</span>
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

        {/* CARD E: System Health & Outages (col-span-4 row-span-2) */}
        <div 
          className="col-span-1 md:col-span-4 md:row-span-2 bg-zinc-900/60 border border-zinc-850 rounded-[2rem] p-6 flex flex-col justify-between hover:border-zinc-700 transition-all duration-300 shadow-md"
          id="card_system_health"
        >
          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/40">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">KESEHATAN SISTEM</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[9px] font-semibold text-zinc-400">CPU UPTIME OK</span>
            </div>
          </div>

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
