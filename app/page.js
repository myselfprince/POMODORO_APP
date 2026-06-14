"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

export default function Pomodoro() {
  // --- POMODORO STATE ---
  const [studyDuration, setStudyDuration] = useState(60);
  const [shortBreakDuration, setShortBreakDuration] = useState(10);
  const [longBreakDuration, setLongBreakDuration] = useState(30);
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState("study");
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const [previousState, setPreviousState] = useState(null);
  
  // --- STOPWATCH STATE ---
  const [stopwatchTime, setStopwatchTime] = useState(0); // In seconds (with decimals)
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);

  // --- UI STATE ---
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);

  // --- REFS ---
  // Using Date.now() prevents drift when the computer goes to sleep
  const startTimestampRef = useRef(null);
  const startTimeLeftRef = useRef(60 * 60);
  const studyStartTimestampRef = useRef(null);
  const studySecondsAtStartRef = useRef(0);
  
  const stopwatchStartRef = useRef(null);
  const stopwatchAccumRef = useRef(0);

  const rafRef = useRef(null);
  const modeRef = useRef(mode);
  const sessionsRef = useRef(sessionsCompleted);
  const totalStudyRef = useRef(totalStudySeconds);
  const isRunningRef = useRef(isRunning);
  const isStopwatchRunningRef = useRef(isStopwatchRunning);

  // Keep refs synced with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionsRef.current = sessionsCompleted; }, [sessionsCompleted]);
  useEffect(() => { totalStudyRef.current = totalStudySeconds; }, [totalStudySeconds]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isStopwatchRunningRef.current = isStopwatchRunning; }, [isStopwatchRunning]);

  // Load Persisted Data
  useEffect(() => {
    const storedData = localStorage.getItem("pomodoroStudyTime");
    if (storedData) {
      try {
        const { date, seconds } = JSON.parse(storedData);
        const today = new Date().toDateString();
        if (date === today) {
          setTotalStudySeconds(seconds);
        } else {
          localStorage.removeItem("pomodoroStudyTime");
        }
      } catch (e) {
        console.error("Error reading from local storage");
      }
    }
  }, []);

  const playSound = () => {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    audio.play().catch((err) => console.log("Audio playback was prevented:", err));
  };

  const persistStudyTime = useCallback((seconds) => {
    const today = new Date().toDateString();
    localStorage.setItem("pomodoroStudyTime", JSON.stringify({ date: today, seconds }));
  }, []);

  const handleSessionEnd = useCallback((currentTimeLeft, currentMode, currentSessionsCompleted) => {
    playSound();
    let nextMode;
    if (currentMode === "study") {
      const newCount = currentSessionsCompleted + 1;
      setSessionsCompleted(newCount);
      if (newCount % 4 === 0) {
        nextMode = "longBreak";
        setMode(nextMode);
        setTimeLeft(longBreakDuration * 60);
        startTimeLeftRef.current = longBreakDuration * 60;
      } else {
        nextMode = "shortBreak";
        setMode(nextMode);
        setTimeLeft(shortBreakDuration * 60);
        startTimeLeftRef.current = shortBreakDuration * 60;
      }
    } else {
      nextMode = "study";
      setMode(nextMode);
      setTimeLeft(studyDuration * 60);
      startTimeLeftRef.current = studyDuration * 60;
    }
    
    startTimestampRef.current = Date.now(); // Fixed: Date.now()
    if (nextMode === "study") {
      studyStartTimestampRef.current = Date.now();
      studySecondsAtStartRef.current = totalStudyRef.current;
    } else {
      studyStartTimestampRef.current = null;
    }
  }, [longBreakDuration, shortBreakDuration, studyDuration]);

  // --- UNIFIED TICK LOOP ---
  const tick = useCallback(() => {
    const now = Date.now(); // Fixed: Date.now() prevents sleep drift
    let keepTicking = false;

    // 1. Pomodoro Logic
    if (isRunningRef.current) {
      const elapsed = (now - startTimestampRef.current) / 1000;
      const newTimeLeft = Math.max(0, Math.round(startTimeLeftRef.current - elapsed));
      setTimeLeft(newTimeLeft);

      if (modeRef.current === "study" && studyStartTimestampRef.current !== null) {
        const studyElapsed = Math.floor((now - studyStartTimestampRef.current) / 1000);
        const newTotal = studySecondsAtStartRef.current + studyElapsed;
        setTotalStudySeconds(newTotal);
        totalStudyRef.current = newTotal;
        
        if (studyElapsed > 0 && studyElapsed % 5 === 0) persistStudyTime(newTotal);
      }

      if (newTimeLeft === 0) {
        if (modeRef.current === "study") persistStudyTime(totalStudyRef.current);
        handleSessionEnd(newTimeLeft, modeRef.current, sessionsRef.current);
      }
      keepTicking = true;
    }

    // 2. Stopwatch Logic
    if (isStopwatchRunningRef.current) {
      const elapsed = (now - stopwatchStartRef.current) / 1000;
      setStopwatchTime(stopwatchAccumRef.current + elapsed);
      keepTicking = true;
    }

    if (keepTicking) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, [handleSessionEnd, persistStudyTime]);

  // --- TIMER CONTROLS ---
  const toggleTimer = useCallback(() => {
    setIsRunning((prev) => {
      const next = !prev;
      if (next) {
        startTimestampRef.current = Date.now();
        startTimeLeftRef.current = timeLeft;
        if (modeRef.current === "study") {
          studyStartTimestampRef.current = Date.now();
          studySecondsAtStartRef.current = totalStudyRef.current;
        }
      } else {
        if (modeRef.current === "study" && studyStartTimestampRef.current !== null) {
          persistStudyTime(totalStudyRef.current);
          studyStartTimestampRef.current = null;
        }
      }
      return next;
    });
  }, [timeLeft, persistStudyTime]);

  const resetTimer = useCallback(() => {
    setPreviousState({ timeLeft, isRunning, mode });
    setIsRunning(false);
    setMode("study");
    const newTime = studyDuration * 60;
    setTimeLeft(newTime);
    startTimeLeftRef.current = newTime;
  }, [timeLeft, isRunning, mode, studyDuration]);

  const undoReset = useCallback(() => {
    if (previousState) {
      setTimeLeft(previousState.timeLeft);
      startTimeLeftRef.current = previousState.timeLeft;
      setIsRunning(previousState.isRunning);
      setMode(previousState.mode);
      setPreviousState(null);
    }
  }, [previousState]);

  // --- STOPWATCH CONTROLS ---
  const toggleStopwatch = useCallback(() => {
    setIsStopwatchRunning((prev) => {
      const next = !prev;
      if (next) {
        stopwatchStartRef.current = Date.now();
      } else {
        stopwatchAccumRef.current = stopwatchTime;
      }
      return next;
    });
  }, [stopwatchTime]);

  const resetStopwatch = useCallback(() => {
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
    stopwatchAccumRef.current = 0;
  }, []);

  // --- TRIGGER LOOP ---
  useEffect(() => {
    if ((isRunning || isStopwatchRunning) && !rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (!isRunning && !isStopwatchRunning && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRunning, isStopwatchRunning, tick]);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); undoReset();
      } else if (e.key.toLowerCase() === "s" || e.code === "Space") {
        e.preventDefault(); toggleTimer();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault(); resetTimer();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault(); handleSessionEnd(0, modeRef.current, sessionsRef.current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoReset, toggleTimer, resetTimer, handleSessionEnd]);

  // --- PIP API ---
  const togglePiP = async () => {
    if (pipWindow) { pipWindow.close(); return; }
    if (!("documentPictureInPicture" in window)) {
      alert("Your browser doesn't support the Always-on-Top API yet. Please use Chrome or Edge.");
      return;
    }
    try {
      const newWindow = await window.documentPictureInPicture.requestWindow({ width: 260, height: 160 });
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        newWindow.document.head.appendChild(node.cloneNode(true));
      });
      newWindow.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(newWindow);
    } catch (error) {
      console.error("Failed to open PiP window:", error);
    }
  };

  // --- FORMATTERS ---
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatStopwatchTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 100);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const bgColors = { study: "bg-black", shortBreak: "bg-green-600", longBreak: "bg-blue-600" };

  const FullTimerUI = (
    <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 py-10 ${bgColors[mode]}`}>
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-slate-800 mb-6 relative">
        {previousState && (
          <div className="absolute -top-12 left-0 right-0 flex justify-center animate-fade-in-down">
            <span className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg flex items-center space-x-2">
              <span>Timer reset.</span>
              <button onClick={undoReset} className="font-bold underline hover:text-blue-300">Undo (Ctrl+Z)</button>
            </span>
          </div>
        )}
        <h1 className="text-3xl font-bold text-center mb-6">G4Gate Timer</h1>
        
        <div className="flex justify-center space-x-2 mb-8">
          {["study", "shortBreak", "longBreak"].map((m) => (
            <span key={m} className={`px-4 py-1 rounded-full text-sm font-semibold capitalize transition ${mode === m ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-500"}`}>
              {m.replace(/([A-Z])/g, " $1").trim()}
            </span>
          ))}
        </div>
        
        <div className="text-center mb-8">
          <div className="text-7xl font-mono font-bold tracking-tight text-slate-900 mb-4">{formatTime(timeLeft)}</div>
          <div className="flex justify-center space-x-4">
            <button onClick={toggleTimer} className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-700 transition">
              {isRunning ? "Pause" : "Start"}
            </button>
            <button onClick={resetTimer} className="px-8 py-3 bg-slate-200 text-slate-800 rounded-lg font-bold hover:bg-slate-300 transition">Reset</button>
          </div>
        </div>
        
        <hr className="my-6 border-slate-200" />
        
        <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div className="text-center w-1/2 border-r border-slate-200">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Sessions</p>
            <p className="text-2xl font-bold text-slate-700">{sessionsCompleted}</p>
          </div>
          <div className="text-center w-1/2">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Study Time</p>
            <p className="text-2xl font-bold text-blue-600">{formatTime(totalStudySeconds)}</p>
          </div>
        </div>
        
        <div className="space-y-4 mb-6">
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Custom Durations (Mins)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Study</label>
              <input type="number" min="1" value={studyDuration} onChange={(e) => { const val = Number(e.target.value); setStudyDuration(val); if (!isRunning && mode === "study") { setTimeLeft(val * 60); startTimeLeftRef.current = val * 60; } }} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Short Break</label>
              <input type="number" min="1" value={shortBreakDuration} onChange={(e) => { const val = Number(e.target.value); setShortBreakDuration(val); if (!isRunning && mode === "shortBreak") { setTimeLeft(val * 60); startTimeLeftRef.current = val * 60; } }} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Long Break</label>
              <input type="number" min="1" value={longBreakDuration} onChange={(e) => { const val = Number(e.target.value); setLongBreakDuration(val); if (!isRunning && mode === "longBreak") { setTimeLeft(val * 60); startTimeLeftRef.current = val * 60; } }} className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
        </div>

        {/* STOPWATCH COMPONENT */}
        <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 text-center shadow-inner">
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">Stopwatch</h2>
          <div className="text-4xl font-mono font-bold text-slate-900 mb-4">{formatStopwatchTime(stopwatchTime)}</div>
          <div className="flex justify-center space-x-3">
            <button onClick={toggleStopwatch} className={`px-6 py-2 rounded font-bold transition ${isStopwatchRunning ? "bg-red-500 hover:bg-red-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
              {isStopwatchRunning ? "Stop" : "Start"}
            </button>
            <button onClick={resetStopwatch} className="px-6 py-2 bg-slate-200 text-slate-800 rounded font-bold hover:bg-slate-300 transition">
              Clear
            </button>
          </div>
        </div>

      </div>
      
      <div className="max-w-md w-full flex flex-col space-y-4">
        <button onClick={togglePiP} className="bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl font-bold flex items-center justify-center transition shadow-lg backdrop-blur-md">
          🚀 Open Minimal Timer
        </button>
        <button onClick={() => setShowShortcuts(!showShortcuts)} className="text-white/80 hover:text-white text-sm font-medium flex items-center justify-center w-full transition">
          {showShortcuts ? "Hide Shortcuts" : "View Shortcuts"}
        </button>
        {showShortcuts && (
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white text-sm">
            <ul className="space-y-2">
              <li className="flex justify-between"><span>Start / Pause</span><span><kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">S</kbd> or <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">Space</kbd></span></li>
              <li className="flex justify-between"><span>Reset Timer</span><kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">R</kbd></li>
              <li className="flex justify-between"><span>Undo Reset</span><kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">Ctrl + Z</kbd></li>
              <li className="flex justify-between"><span>Skip Phase</span><kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">N</kbd></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  const MinimalTimerUI = (
    <div className={`h-screen w-screen flex flex-col items-center justify-center transition-colors duration-500 overflow-hidden ${bgColors[mode]}`}>
      <span className="text-white/90 text-xs font-bold uppercase tracking-widest mb-1 shadow-sm">{mode.replace(/([A-Z])/g, " $1").trim()}</span>
      <div className="text-5xl font-mono font-bold tracking-tight text-white mb-4 drop-shadow-md">{formatTime(timeLeft)}</div>
      <div className="flex space-x-3">
        <button onClick={toggleTimer} className="px-4 py-1.5 bg-slate-900/40 hover:bg-slate-900/60 text-white rounded-md font-medium text-sm transition">{isRunning ? "Pause" : "Play"}</button>
        <button onClick={() => handleSessionEnd(0, modeRef.current, sessionsRef.current)} className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-md font-medium text-sm transition">Skip</button>
      </div>
    </div>
  );

  return (
    <>
      {!pipWindow && FullTimerUI}
      {pipWindow && createPortal(MinimalTimerUI, pipWindow.document.body)}
      {pipWindow && (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-800">
          <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
            <h2 className="text-2xl font-bold mb-4">Timer is running in Pop-up! 🚀</h2>
            <p className="text-slate-500 mb-6">Your minimal timer is currently pinned to your screen.</p>
            <button onClick={() => pipWindow.close()} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">Bring Timer Back</button>
          </div>
        </div>
      )}
    </>
  );
}