"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export default function ObsOverlay() {
  const [mounted, setMounted] = useState(false);
  
  // 1. STATE: Defaults (Dictates what the NEXT phase will be)
  const [defaultStudyStr, setDefaultStudyStr] = useState("50");
  const [defaultBreakStr, setDefaultBreakStr] = useState("10");

  // 2. STATE: Custom Inputs (For one-off custom starts)
  const [customStudyStr, setCustomStudyStr] = useState("50");
  const [customBreakStr, setCustomBreakStr] = useState("10");

  // 3. STATE: Active Timer State
  const [phase, setPhase] = useState("study"); // "study" or "break"
  const [currentDuration, setCurrentDuration] = useState(50);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // 4. STATE: Audio Volume
  const [volume, setVolume] = useState(0.5); // Default 50% volume

  // Refs
  const targetTimeRef = useRef(null);
  const pauseTimeLeftRef = useRef(null);
  const requestRef = useRef(null);
  const audioRef = useRef(null);

  // Helper to persist state to local storage
  const saveState = (newState) => {
    if (typeof window !== "undefined") {
      const currentState = JSON.parse(localStorage.getItem("obsTimerState") || "{}");
      localStorage.setItem("obsTimerState", JSON.stringify({ ...currentState, ...newState }));
    }
  };

  // Initialize from LocalStorage and setup Audio
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      // --- AUDIO SETUP ---
      // TO USE A LOCAL FILE: Change this URL to "/timer-bell.mp3" and put the file in your Next.js public folder.
      audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
      
      const savedState = localStorage.getItem("obsTimerState");
      
      if (savedState) {
        const parsed = JSON.parse(savedState);
        
        setDefaultStudyStr(parsed.defaultStudyStr || "50");
        setDefaultBreakStr(parsed.defaultBreakStr || "10");
        setCustomStudyStr(parsed.defaultStudyStr || "50");
        setCustomBreakStr(parsed.defaultBreakStr || "10");
        
        setPhase(parsed.phase || "study");
        setCurrentDuration(parsed.currentDuration || 50);
        setIsRunning(parsed.isRunning || false);
        
        if (parsed.volume !== undefined) {
          setVolume(parsed.volume);
          audioRef.current.volume = parsed.volume;
        }

        if (parsed.isRunning && parsed.targetTime) {
          targetTimeRef.current = parsed.targetTime;
          const remaining = Math.floor((parsed.targetTime - Date.now()) / 1000);
          if (remaining > 0) {
            setTimeLeft(remaining);
            pauseTimeLeftRef.current = remaining;
          } else {
            setTimeLeft(0); 
            pauseTimeLeftRef.current = 0;
          }
        } else {
          pauseTimeLeftRef.current = parsed.pauseTimeLeft || (50 * 60);
          setTimeLeft(parsed.pauseTimeLeft || (50 * 60));
        }
      } else {
        const initialSeconds = 50 * 60;
        setTimeLeft(initialSeconds);
        pauseTimeLeftRef.current = initialSeconds;
        saveState({
          defaultStudyStr: "50",
          defaultBreakStr: "10",
          phase: "study",
          currentDuration: 50,
          isRunning: false,
          pauseTimeLeft: initialSeconds,
          volume: 0.5
        });
      }
    }
  }, []);

  // Sync volume state to audio object
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // The Zero-Drift Tick Engine
  const tick = useCallback(() => {
    if (!isRunning || !targetTimeRef.current) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.floor((targetTimeRef.current - now) / 1000));
    const totalSeconds = currentDuration * 60;
    
    setTimeLeft(remaining);
    setProgress(((totalSeconds - remaining) / totalSeconds) * 100);

    // Auto-cycle when time hits zero
    if (remaining <= 0) {
      // PLAY SOUND NOTIFICATION
      if (audioRef.current) {
        audioRef.current.currentTime = 0; // Reset sound to start
        audioRef.current.play().catch(err => console.log("Audio play prevented:", err));
      }

      const nextPhase = phase === "study" ? "break" : "study";
      const nextDurationMins = nextPhase === "study" 
        ? (parseInt(defaultStudyStr) || 1) 
        : (parseInt(defaultBreakStr) || 1);
      
      const nextDurationSeconds = nextDurationMins * 60;
      
      setPhase(nextPhase);
      setCurrentDuration(nextDurationMins);
      
      const newTarget = Date.now() + nextDurationSeconds * 1000;
      targetTimeRef.current = newTarget;
      pauseTimeLeftRef.current = nextDurationSeconds;
      setProgress(0);
      
      saveState({ 
        phase: nextPhase, 
        currentDuration: nextDurationMins,
        targetTime: newTarget, 
        pauseTimeLeft: nextDurationSeconds 
      });
    } else {
      requestRef.current = requestAnimationFrame(tick);
    }
  }, [isRunning, phase, currentDuration, defaultStudyStr, defaultBreakStr]);

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(tick);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, tick]);

  // Controls: Play / Pause
  const toggleTimer = () => {
    let newIsRunning = !isRunning;
    let newTargetTime = null;

    if (isRunning) {
      pauseTimeLeftRef.current = timeLeft;
    } else {
      newTargetTime = Date.now() + (pauseTimeLeftRef.current * 1000);
      targetTimeRef.current = newTargetTime;
    }
    
    setIsRunning(newIsRunning);
    saveState({ 
      isRunning: newIsRunning, 
      targetTime: newTargetTime, 
      pauseTimeLeft: pauseTimeLeftRef.current 
    });
  };

  // Controls: Skip
  const skipPhase = () => {
    const nextPhase = phase === "study" ? "break" : "study";
    const nextDurationMins = nextPhase === "study" 
      ? (parseInt(defaultStudyStr) || 1) 
      : (parseInt(defaultBreakStr) || 1);
    const nextDurationSeconds = nextDurationMins * 60;
    
    setPhase(nextPhase);
    setCurrentDuration(nextDurationMins);
    setTimeLeft(nextDurationSeconds);
    pauseTimeLeftRef.current = nextDurationSeconds;
    setProgress(0);
    
    let newTargetTime = null;
    if (isRunning) {
      newTargetTime = Date.now() + nextDurationSeconds * 1000;
      targetTimeRef.current = newTargetTime;
    }
    
    saveState({
      phase: nextPhase,
      currentDuration: nextDurationMins,
      pauseTimeLeft: nextDurationSeconds,
      targetTime: newTargetTime
    });
  };

  // Controls: Custom Overrides
  const handleStartCustom = (targetPhase, minutesStr) => {
    const validMinutes = parseInt(minutesStr) || 1;
    
    setPhase(targetPhase);
    setCurrentDuration(validMinutes);
    
    const seconds = validMinutes * 60;
    setTimeLeft(seconds);
    pauseTimeLeftRef.current = seconds;
    setProgress(0);
    
    let newTargetTime = null;
    if (isRunning) {
      newTargetTime = Date.now() + seconds * 1000;
      targetTimeRef.current = newTargetTime;
    }
    
    saveState({
      phase: targetPhase,
      currentDuration: validMinutes,
      pauseTimeLeft: seconds,
      targetTime: newTargetTime
    });
  };

  const handleDefaultChange = (type, value) => {
    if (type === "study") {
      setDefaultStudyStr(value);
      saveState({ defaultStudyStr: value });
    } else {
      setDefaultBreakStr(value);
      saveState({ defaultBreakStr: value });
    }
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    saveState({ volume: newVol });
  };

  // Test audio button
  const testAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.log("Audio test prevented:", err));
    }
  };

  // Formatting
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!mounted) return null;

  const theme = phase === "study" 
    ? { color: "text-blue-400", bg: "bg-blue-500", shadow: "drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]", label: "Focus Study" }
    : { color: "text-amber-400", bg: "bg-amber-500", shadow: "drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]", label: "ON BREAK" };

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-between px-16 font-sans overflow-hidden">
      
      {/* ======================= */}
      {/* LEFT SIDE: VIEWERS TIMER */}
      {/* ======================= */}
      <div className="relative w-80 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-5 py-3 border-b border-white/5 bg-white/5">
          <div className="flex items-center space-x-2">
            <div className={`w-2.5 h-2.5 rounded-full ${theme.bg} animate-pulse`} />
            <span className={`text-md font-bold tracking-widest ${theme.color}`}>
              {theme.label}
            </span>
          </div>
          {!isRunning && (
            <span className="text-xs font-bold tracking-widest text-white/50 uppercase">Paused</span>
          )}
        </div>

        <div className="px-6 py-4 flex flex-col items-center">
          <div className={`text-7xl font-mono font-bold tabular-nums text-white tracking-tighter ${theme.shadow}`}>
            {formatTime(timeLeft)}
          </div>
          <div className="text-xl font-medium text-slate-300 mt-2">
            Next: {phase === "study" ? `Break (${defaultBreakStr || 0}m)` : `Study (${defaultStudyStr || 0}m)`}
          </div>
        </div>

        <div className="h-1.5 w-full bg-white/10 relative">
          <div 
            className={`h-full ${theme.bg} transition-all duration-1000 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ======================= */}
      {/* RIGHT SIDE: OBS CONTROLS */}
      {/* ======================= */}
      <div className="w-80 bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5 overflow-y-auto max-h-screen">
        
        {/* Master Controls */}
        <div className="flex gap-3">
          <button 
            onClick={toggleTimer}
            className={`flex-1 py-3 rounded-xl font-bold tracking-wider transition ${
              isRunning 
                ? "bg-white/10 text-white hover:bg-white/20" 
                : "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
            }`}
          >
            {isRunning ? "PAUSE" : "PLAY"}
          </button>
          <button 
            onClick={skipPhase}
            className="px-6 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition"
          >
            SKIP
          </button>
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        {/* Audio Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-xs text-white/60 font-bold uppercase tracking-widest">Alert Volume</label>
            <button onClick={testAudio} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white transition">Test Sound</button>
          </div>
          <input 
            type="range" 
            min="0" max="1" step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        {/* SECTION 1: DEFAULT SETTINGS */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">Default Durations</p>
            <p className="text-[10px] text-white/40 mb-1">Edits here update the viewer's screen live.</p>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col w-1/2 gap-1">
              <label className="text-[10px] text-white/60 uppercase">Study (min)</label>
              <input 
                type="number"
                value={defaultStudyStr}
                onChange={(e) => handleDefaultChange("study", e.target.value)}
                className="w-full bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex flex-col w-1/2 gap-1">
              <label className="text-[10px] text-white/60 uppercase">Break (min)</label>
              <input 
                type="number"
                value={defaultBreakStr}
                onChange={(e) => handleDefaultChange("break", e.target.value)}
                className="w-full bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-amber-500 transition"
              />
            </div>
          </div>
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        {/* SECTION 2: CUSTOM OVERRIDES */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-amber-400 font-bold uppercase tracking-widest">Custom Override</p>
            <p className="text-[10px] text-white/40 mb-1">One-time use. Will revert to defaults after.</p>
          </div>
          
          <div className="flex gap-2 items-center">
            <input 
              type="number"
              value={customStudyStr}
              onChange={(e) => setCustomStudyStr(e.target.value)}
              className="w-16 bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-blue-500 transition text-sm"
            />
            <button 
              onClick={() => handleStartCustom("study", customStudyStr)}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              Start Custom Study
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <input 
              type="number"
              value={customBreakStr}
              onChange={(e) => setCustomBreakStr(e.target.value)}
              className="w-16 bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-amber-500 transition text-sm"
            />
            <button 
              onClick={() => handleStartCustom("break", customBreakStr)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg transition text-sm"
            >
              Start Custom Break
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}