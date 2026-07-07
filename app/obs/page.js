"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Shift time by 3 hours so a "day" effectively resets at 3 AM.
const getLogicalDay = () => {
  const d = new Date();
  d.setHours(d.getHours() - 3);
  return d.toDateString();
};

export default function ObsOverlay() {
  const [mounted, setMounted] = useState(false);

  // Core Durations
  const [defaultStudyStr, setDefaultStudyStr] = useState("60");
  const [defaultBreakStr, setDefaultBreakStr] = useState("15");
  const [longBreakStr, setLongBreakStr] = useState("30");
  const [targetHoursStr, setTargetHoursStr] = useState("12");

  // Custom Override Durations
  const [customStudyStr, setCustomStudyStr] = useState("60");
  const [customBreakStr, setCustomBreakStr] = useState("15");

  // State
  const [phase, setPhase] = useState("study"); // "study", "break", or "longBreak"
  const [currentDuration, setCurrentDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.5);

  // New Tracking State
  const [sessionHistory, setSessionHistory] = useState([]); // Tracks chronological blocks: { phase, duration }
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  const targetTimeRef = useRef(null);
  const pauseTimeLeftRef = useRef(null);
  const requestRef = useRef(null);
  const audioRef = useRef(null);
  const currentLogicalDayRef = useRef("");

  const saveState = (newState) => {
    if (typeof window !== "undefined") {
      const currentState = JSON.parse(localStorage.getItem("obsTimerState") || "{}");
      localStorage.setItem(
        "obsTimerState",
        JSON.stringify({ ...currentState, logicalDay: getLogicalDay(), ...newState })
      );
    }
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
      const savedState = localStorage.getItem("obsTimerState");
      const today = getLogicalDay();
      currentLogicalDayRef.current = today;

      if (savedState) {
        const parsed = JSON.parse(savedState);
        const isNewDay = parsed.logicalDay !== today;

        setDefaultStudyStr(parsed.defaultStudyStr || "60");
        setDefaultBreakStr(parsed.defaultBreakStr || "15");
        setLongBreakStr(parsed.longBreakStr || "30");
        setTargetHoursStr(parsed.targetHoursStr || "12");
        setCustomStudyStr(parsed.defaultStudyStr || "60");
        setCustomBreakStr(parsed.defaultBreakStr || "15");

        if (isNewDay) {
          // Reset session daily fields
          const initialDuration = parseInt(parsed.defaultStudyStr) || 60;
          setPhase("study");
          setCurrentDuration(initialDuration);
          setIsRunning(false);
          setSessionHistory([]);
          setSessionsCompleted(0);
          const initialSeconds = initialDuration * 60;
          setTimeLeft(initialSeconds);
          pauseTimeLeftRef.current = initialSeconds;
          
          saveState({
            phase: "study", currentDuration: initialDuration, isRunning: false, 
            sessionHistory: [], sessionsCompleted: 0, pauseTimeLeft: initialSeconds, targetTime: null
          });
        } else {
          setPhase(parsed.phase || "study");
          setCurrentDuration(parsed.currentDuration || 60);
          setIsRunning(parsed.isRunning || false);
          setSessionHistory(parsed.sessionHistory || []);
          setSessionsCompleted(parsed.sessionsCompleted || 0);

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
            const fallbackSeconds = (parseInt(parsed.defaultStudyStr) || 60) * 60;
            pauseTimeLeftRef.current = parsed.pauseTimeLeft || fallbackSeconds;
            setTimeLeft(pauseTimeLeftRef.current);
          }
        }
      } else {
        const initialSeconds = 60 * 60;
        setTimeLeft(initialSeconds);
        pauseTimeLeftRef.current = initialSeconds;
        saveState({
          defaultStudyStr: "60", defaultBreakStr: "15", longBreakStr: "30", targetHoursStr: "12",
          phase: "study", currentDuration: 60, isRunning: false, pauseTimeLeft: initialSeconds,
          volume: 0.5, sessionHistory: [], sessionsCompleted: 0
        });
      }
    }
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const tick = useCallback(() => {
    // 3 AM Automatic Reset check
    const logicalDay = getLogicalDay();
    if (logicalDay !== currentLogicalDayRef.current) {
        currentLogicalDayRef.current = logicalDay;
        const resetDuration = parseInt(defaultStudyStr) || 60;
        setIsRunning(false);
        setPhase("study");
        setCurrentDuration(resetDuration);
        setTimeLeft(resetDuration * 60);
        pauseTimeLeftRef.current = resetDuration * 60;
        setSessionHistory([]);
        setSessionsCompleted(0);
        setProgress(0);
        saveState({
            isRunning: false, phase: "study", currentDuration: resetDuration,
            pauseTimeLeft: resetDuration * 60, targetTime: null,
            sessionHistory: [], sessionsCompleted: 0
        });
        return;
    }

    if (!isRunning || !targetTimeRef.current) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((targetTimeRef.current - now) / 1000));
    const totalSeconds = currentDuration * 60;

    setTimeLeft(remaining);
    setProgress(((totalSeconds - remaining) / totalSeconds) * 100);

    if (remaining <= 0) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => console.log("Audio play prevented:", err));
      }

      let nextPhase = phase;
      let nextDurationMins = 1;
      let newSessions = sessionsCompleted;
      
      // Save completed phase to history
      const newHistory = [...sessionHistory, { phase, duration: currentDuration * 60 }];

      if (phase === "study") {
        newSessions += 1;
        // 4th Session = Long Break, otherwise normal Break
        if (newSessions > 0 && newSessions % 4 === 0) {
          nextPhase = "longBreak";
          nextDurationMins = parseInt(longBreakStr) || 30;
        } else {
          nextPhase = "break";
          nextDurationMins = parseInt(defaultBreakStr) || 15;
        }
      } else {
        nextPhase = "study";
        nextDurationMins = parseInt(defaultStudyStr) || 60;
      }

      setPhase(nextPhase);
      setCurrentDuration(nextDurationMins);
      setSessionsCompleted(newSessions);
      setSessionHistory(newHistory);

      const nextDurationSeconds = nextDurationMins * 60;
      const newTarget = Date.now() + nextDurationSeconds * 1000;
      targetTimeRef.current = newTarget;
      pauseTimeLeftRef.current = nextDurationSeconds;
      setProgress(0);

      saveState({
        phase: nextPhase, currentDuration: nextDurationMins, targetTime: newTarget,
        pauseTimeLeft: nextDurationSeconds, sessionHistory: newHistory,
        sessionsCompleted: newSessions
      });
    } else {
      requestRef.current = requestAnimationFrame(tick);
    }
  }, [isRunning, phase, currentDuration, defaultStudyStr, defaultBreakStr, longBreakStr, sessionHistory, sessionsCompleted]);

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(tick);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, tick]);

  const toggleTimer = () => {
    let newIsRunning = !isRunning;
    let newTargetTime = null;
    if (isRunning) {
      pauseTimeLeftRef.current = timeLeft;
    } else {
      newTargetTime = Date.now() + pauseTimeLeftRef.current * 1000;
      targetTimeRef.current = newTargetTime;
    }
    setIsRunning(newIsRunning);
    saveState({ isRunning: newIsRunning, targetTime: newTargetTime, pauseTimeLeft: pauseTimeLeftRef.current });
  };

  const skipPhase = () => {
    let nextPhase = phase;
    let nextDurationMins = 1;
    let newSessions = sessionsCompleted;
    
    // Save partially completed phase to history if there is any elapsed time
    const elapsed = (currentDuration * 60) - timeLeft;
    const newHistory = [...sessionHistory];
    if (elapsed > 0) {
      newHistory.push({ phase, duration: elapsed });
    }

    if (phase === "study") {
      newSessions += 1;
      if (newSessions > 0 && newSessions % 4 === 0) {
        nextPhase = "longBreak";
        nextDurationMins = parseInt(longBreakStr) || 30;
      } else {
        nextPhase = "break";
        nextDurationMins = parseInt(defaultBreakStr) || 15;
      }
    } else {
      nextPhase = "study";
      nextDurationMins = parseInt(defaultStudyStr) || 60;
    }

    setPhase(nextPhase);
    setCurrentDuration(nextDurationMins);
    setSessionsCompleted(newSessions);
    setSessionHistory(newHistory);

    const nextDurationSeconds = nextDurationMins * 60;
    setTimeLeft(nextDurationSeconds);
    pauseTimeLeftRef.current = nextDurationSeconds;
    setProgress(0);

    let newTargetTime = null;
    if (isRunning) {
      newTargetTime = Date.now() + nextDurationSeconds * 1000;
      targetTimeRef.current = newTargetTime;
    }
    saveState({
      phase: nextPhase, currentDuration: nextDurationMins, pauseTimeLeft: nextDurationSeconds,
      targetTime: newTargetTime, sessionHistory: newHistory, sessionsCompleted: newSessions
    });
  };

  const handleStartCustom = (targetPhase, minutesStr) => {
    // Record current phase elapsed time before switching
    const elapsed = (currentDuration * 60) - timeLeft;
    const newHistory = [...sessionHistory];
    if (elapsed > 0) {
      newHistory.push({ phase, duration: Math.floor(elapsed) });
    }
    setSessionHistory(newHistory);

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
      phase: targetPhase, currentDuration: validMinutes, pauseTimeLeft: seconds, 
      targetTime: newTargetTime, sessionHistory: newHistory 
    });
  };

  const handleDefaultChange = (type, value) => {
    if (type === "study") {
      setDefaultStudyStr(value);
      saveState({ defaultStudyStr: value });
    } else if (type === "break") {
      setDefaultBreakStr(value);
      saveState({ defaultBreakStr: value });
    } else if (type === "longBreak") {
      setLongBreakStr(value);
      saveState({ longBreakStr: value });
    } else if (type === "targetHours") {
      setTargetHoursStr(value);
      saveState({ targetHoursStr: value });
    }
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    saveState({ volume: newVol });
  };

  const testAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => console.log("Audio test prevented:", err));
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!mounted) return null;

  // Theming Logic based on phase
  let theme;
  if (phase === "study") {
    theme = { color: "text-blue-400", bg: "bg-blue-500", shadow: "drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]", label: `Focus Study #${sessionsCompleted + 1}` };
  } else if (phase === "break") {
    theme = { color: "text-amber-400", bg: "bg-amber-500", shadow: "drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]", label: "SHORT BREAK" };
  } else {
    theme = { color: "text-emerald-400", bg: "bg-emerald-500", shadow: "drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]", label: "LONG BREAK" };
  }

  let nextPhaseText = "";
  if (phase === "study") {
    nextPhaseText = (sessionsCompleted + 1) % 4 === 0 
      ? `Long Break (${longBreakStr || 0}m)` 
      : `Break (${defaultBreakStr || 0}m)`;
  } else {
    nextPhaseText = `Study (${defaultStudyStr || 0}m)`;
  }

  // --- MULTI-PHASE TIMELINE LOGIC ---
  const targetHoursNum = parseFloat(targetHoursStr) || 12;

  // 1. Build the full chronological list of elapsed segments
  const currentElapsed = Math.max(0, (currentDuration * 60) - timeLeft);
  const fullTimeline = [...sessionHistory];
  if (currentElapsed > 0) {
    fullTimeline.push({ phase, duration: currentElapsed });
  }

  // 2. Determine how many timelines/bars to show
  let barsConfig = [];
  if (targetHoursNum > 8) {
    const half = Math.ceil(targetHoursNum / 2);
    barsConfig = [
      { labelStart: "0h", labelEnd: `${half}h`, capacity: half * 3600 },
      { labelStart: `${half}h`, labelEnd: `${targetHoursNum}h`, capacity: (targetHoursNum - half) * 3600 }
    ];
  } else {
    barsConfig = [
      { labelStart: "0h", labelEnd: `${targetHoursNum}h`, capacity: targetHoursNum * 3600 }
    ];
  }

  // 3. Distribute segments across the timeline bars
  let queue = fullTimeline.map(t => ({ ...t })); // Deep copy so we can safely split chunks
  
  const renderedBars = barsConfig.map((bar) => {
    let remainingCapacity = bar.capacity;
    const segments = [];

    while (queue.length > 0 && remainingCapacity > 0) {
      const item = queue[0];
      if (item.duration <= remainingCapacity) {
        // Fits entirely in current bar
        segments.push({ phase: item.phase, duration: item.duration });
        remainingCapacity -= item.duration;
        queue.shift(); // Remove from queue
      } else {
        // Too big, split it
        segments.push({ phase: item.phase, duration: remainingCapacity });
        queue[0].duration -= remainingCapacity; // Keep remainder in queue for next bar
        remainingCapacity = 0; // Bar is full
      }
    }
    return { ...bar, segments };
  });

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-between px-16 font-sans overflow-hidden relative">
      
      {/* 🚀 DYNAMIC MULTI-SEGMENT PROGRESS TIMELINE 🚀 */}
      <div className="absolute top-8 left-0 w-full px-16 flex flex-col gap-4 z-50 pointer-events-none">
        {renderedBars.map((bar, i) => (
          <div key={i} className="w-full h-5 bg-black/60 border border-white/20 rounded-full overflow-hidden backdrop-blur-md shadow-2xl relative flex">
            {/* Labels */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/70 uppercase tracking-widest z-10">{bar.labelStart}</div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/70 uppercase tracking-widest z-10">{bar.labelEnd}</div>
            
            {/* Render chronologic segments inline */}
            {bar.segments.map((seg, idx) => {
              const pct = (seg.duration / bar.capacity) * 100;
              
              // Colors for different phases
              let segmentClass = "";
              if (seg.phase === "study") {
                segmentClass = "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] z-0";
              } else if (seg.phase === "break") {
                segmentClass = "bg-amber-400/90 shadow-[0_0_10px_rgba(251,191,36,0.4)] z-0 opacity-80 border-l border-r border-black/30";
              } else if (seg.phase === "longBreak") {
                segmentClass = "bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.4)] z-0 opacity-80 border-l border-r border-black/30";
              }

              return (
                <div
                  key={idx}
                  className={`h-full transition-all duration-1000 ease-linear ${segmentClass}`}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* LEFT: TIMER DISPLAY */}
      <div className="relative w-80 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-5 py-3 border-b border-white/5 bg-white/5">
          <div className="flex items-center space-x-2">
            <div className={`w-2.5 h-2.5 rounded-full ${theme.bg} animate-pulse`} />
            <span className={`text-md font-bold tracking-widest ${theme.color}`}>{theme.label}</span>
          </div>
          {!isRunning && (
            <span className="text-xs font-bold tracking-widest text-white/50 uppercase">Paused</span>
          )}
        </div>
        
        <div className="px-6 py-4 flex flex-col items-center">
          <div className={`text-7xl font-mono font-bold tabular-nums text-white tracking-tighter ${theme.shadow}`}>
            {formatTime(timeLeft)}
          </div>
          <div className="text-xl font-medium text-slate-300 mt-2">Next: {nextPhaseText}</div>
        </div>
        
        <div className="h-1.5 w-full bg-white/10 relative">
          <div className={`h-full ${theme.bg} transition-all duration-1000 ease-linear`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* RIGHT: CONTROL PANEL */}
      <div className="w-[22rem] bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5 overflow-y-auto max-h-screen z-10">
        
        <div className="flex gap-3">
          <button
            onClick={toggleTimer}
            className={`flex-1 py-3 rounded-xl font-bold tracking-wider transition ${
              isRunning ? "bg-white/10 text-white hover:bg-white/20" : "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
            }`}
          >
            {isRunning ? "PAUSE" : "PLAY"}
          </button>
          <button onClick={skipPhase} className="px-6 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition">
            SKIP
          </button>
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        {/* Study Target */}
        <div className="flex flex-col gap-2">
            <div>
              <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">Study Goal</p>
              <p className="text-[10px] text-white/40 mb-1">Populates the dynamic timeline.</p>
            </div>
            <div className="flex gap-2 items-center">
                <input 
                  type="number" 
                  value={targetHoursStr} 
                  onChange={(e) => handleDefaultChange("targetHours", e.target.value)} 
                  className="w-16 bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-cyan-500 transition text-sm" 
                />
                <span className="text-xs text-white/60 font-bold uppercase tracking-widest">Hours</span>
            </div>
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-xs text-white/60 font-bold uppercase tracking-widest">Alert Volume</label>
            <button onClick={testAudio} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white transition">
              Test Sound
            </button>
          </div>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange} className="w-full accent-blue-500 cursor-pointer" />
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">Default Durations</p>
            <p className="text-[10px] text-white/40 mb-1">Edits here update the viewer's screen live.</p>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col w-1/3 gap-1">
              <label className="text-[9px] text-white/60 uppercase font-bold tracking-wider">Study (min)</label>
              <input type="number" value={defaultStudyStr} onChange={(e) => handleDefaultChange("study", e.target.value)} className="w-full bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-blue-500 transition" />
            </div>
            <div className="flex flex-col w-1/3 gap-1">
              <label className="text-[9px] text-white/60 uppercase font-bold tracking-wider">Break (min)</label>
              <input type="number" value={defaultBreakStr} onChange={(e) => handleDefaultChange("break", e.target.value)} className="w-full bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-amber-500 transition" />
            </div>
            <div className="flex flex-col w-1/3 gap-1">
              <label className="text-[9px] text-white/60 uppercase font-bold tracking-wider">L. Brk (min)</label>
              <input type="number" value={longBreakStr} onChange={(e) => handleDefaultChange("longBreak", e.target.value)} className="w-full bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-emerald-500 transition" />
            </div>
          </div>
        </div>

        <div className="w-full h-[1px] bg-white/10" />

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-amber-400 font-bold uppercase tracking-widest">Custom Override</p>
            <p className="text-[10px] text-white/40 mb-1">One-time use. Will revert to defaults after.</p>
          </div>
          <div className="flex gap-2 items-center">
            <input type="number" value={customStudyStr} onChange={(e) => setCustomStudyStr(e.target.value)} className="w-16 bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-blue-500 transition text-sm" />
            <button onClick={() => handleStartCustom("study", customStudyStr)} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition text-sm">
              Start Custom Study
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <input type="number" value={customBreakStr} onChange={(e) => setCustomBreakStr(e.target.value)} className="w-16 bg-[#1e2330] border border-slate-700 text-white text-center p-2 rounded-lg outline-none focus:border-amber-500 transition text-sm" />
            <button onClick={() => handleStartCustom("break", customBreakStr)} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg transition text-sm">
              Start Custom Break
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}