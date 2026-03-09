"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export default function Pomodoro() {
  // Customizable durations (in minutes)
  const [studyDuration, setStudyDuration] = useState(60);
  const [shortBreakDuration, setShortBreakDuration] = useState(10);
  const [longBreakDuration, setLongBreakDuration] = useState(30);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(studyDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState("study"); // 'study', 'shortBreak', 'longBreak'
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);

  // Undo, UI, and PiP state
  const [previousState, setPreviousState] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);

  // Load total study time from localStorage on initial render
  useEffect(() => {
    const storedData = localStorage.getItem("pomodoroStudyTime");
    if (storedData) {
      try {
        const { date, seconds } = JSON.parse(storedData);
        const today = new Date().toDateString();
        
        // Restore time if it's the same day, otherwise clear the stale data
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

  // Helper to play notification sound
  const playSound = () => {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    audio.play().catch((err) => console.log("Audio playback was prevented:", err));
  };

  const handleSessionEnd = useCallback(() => {
    playSound(); // Trigger sound when the session ends

    if (mode === "study") {
      const newCount = sessionsCompleted + 1;
      setSessionsCompleted(newCount);

      if (newCount % 4 === 0) {
        setMode("longBreak");
        setTimeLeft(longBreakDuration * 60);
      } else {
        setMode("shortBreak");
        setTimeLeft(shortBreakDuration * 60);
      }
    } else {
      setMode("study");
      setTimeLeft(studyDuration * 60);
    }
  }, [mode, sessionsCompleted, longBreakDuration, shortBreakDuration, studyDuration]);

  // Timer logic
  useEffect(() => {
    let interval;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        
        if (mode === "study") {
          setTotalStudySeconds((prev) => {
            const today = new Date().toDateString();
            const storedData = localStorage.getItem("pomodoroStudyTime");
            let lastDate = today;
            
            if (storedData) {
              try {
                lastDate = JSON.parse(storedData).date;
              } catch(e) {}
            }

            const newTotal = lastDate === today ? prev + 1 : 1;
            
            localStorage.setItem(
              "pomodoroStudyTime", 
              JSON.stringify({ date: today, seconds: newTotal })
            );
            
            return newTotal;
          });
        }
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      handleSessionEnd();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode, handleSessionEnd]);

  const toggleTimer = useCallback(() => setIsRunning((prev) => !prev), []);

  const resetTimer = useCallback(() => {
    setPreviousState({
      timeLeft,
      isRunning,
      mode,
    });
    
    setIsRunning(false);
    setMode("study");
    setTimeLeft(studyDuration * 60);
  }, [timeLeft, isRunning, mode, studyDuration]);

  const undoReset = useCallback(() => {
    if (previousState) {
      setTimeLeft(previousState.timeLeft);
      setIsRunning(previousState.isRunning);
      setMode(previousState.mode);
      setPreviousState(null);
    }
  }, [previousState]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoReset();
      } else if (e.key.toLowerCase() === "s" || e.code === "Space") {
        e.preventDefault();
        toggleTimer();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        resetTimer();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleSessionEnd();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoReset, toggleTimer, resetTimer, handleSessionEnd]);

  // --- Picture-in-Picture Logic ---
  const togglePiP = async () => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }

    if (!("documentPictureInPicture" in window)) {
      alert("Your browser doesn't support the Always-on-Top API yet. Please use Chrome or Edge.");
      return;
    }

    try {
      // REQUESTING A MUCH SMALLER WINDOW
      const newWindow = await window.documentPictureInPicture.requestWindow({
        width: 260,
        height: 160,
      });

      // Copy all styles (Tailwind) from the main app to the pop-up
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        newWindow.document.head.appendChild(node.cloneNode(true));
      });

      newWindow.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(newWindow);
    } catch (error) {
      console.error("Failed to open PiP window:", error);
    }
  };

  // Helper to format seconds
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m
        .toString()
        .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Dynamic background colors
  const bgColors = {
    study: "bg-blue-600",
    shortBreak: "bg-green-600",
    longBreak: "bg-purple-600",
  };

  // 1. FULL UI (Rendered when on the main page)
  const FullTimerUI = (
    <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 py-10 ${bgColors[mode]}`}>
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-slate-800 mb-6 relative">
        
        {/* Undo Toast Notification */}
        {previousState && (
          <div className="absolute -top-12 left-0 right-0 flex justify-center animate-fade-in-down">
            <span className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg flex items-center space-x-2">
              <span>Timer reset.</span>
              <button onClick={undoReset} className="font-bold underline hover:text-blue-300">
                Undo (Ctrl+Z)
              </button>
            </span>
          </div>
        )}

        <h1 className="text-3xl font-bold text-center mb-6">G4Gate Timer</h1>

        {/* Mode Indicator */}
        <div className="flex justify-center space-x-2 mb-8">
          {["study", "shortBreak", "longBreak"].map((m) => (
            <span
              key={m}
              className={`px-4 py-1 rounded-full text-sm font-semibold capitalize transition ${
                mode === m
                  ? "bg-slate-800 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {m.replace(/([A-Z])/g, " $1").trim()}
            </span>
          ))}
        </div>

        {/* Timer Display */}
        <div className="text-center mb-8">
          <div className="text-7xl font-mono font-bold tracking-tight text-slate-900 mb-4">
            {formatTime(timeLeft)}
          </div>
          <div className="flex justify-center space-x-4">
            <button
              onClick={toggleTimer}
              className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-700 transition"
            >
              {isRunning ? "Pause" : "Start"}
            </button>
            <button
              onClick={resetTimer}
              className="px-8 py-3 bg-slate-200 text-slate-800 rounded-lg font-bold hover:bg-slate-300 transition"
            >
              Reset
            </button>
          </div>
        </div>

        <hr className="my-6 border-slate-200" />

        {/* Stats */}
        <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div className="text-center w-1/2 border-r border-slate-200">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
              Sessions
            </p>
            <p className="text-2xl font-bold text-slate-700">{sessionsCompleted}</p>
          </div>
          <div className="text-center w-1/2">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
              Total Study Time
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {formatTime(totalStudySeconds)}
            </p>
          </div>
        </div>

        {/* Customization Settings */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Custom Durations (Mins)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Study</label>
              <input
                type="number"
                min="1"
                value={studyDuration}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStudyDuration(val);
                  if (!isRunning && mode === "study") setTimeLeft(val * 60);
                }}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Short Break</label>
              <input
                type="number"
                min="1"
                value={shortBreakDuration}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setShortBreakDuration(val);
                  if (!isRunning && mode === "shortBreak") setTimeLeft(val * 60);
                }}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Long Break</label>
              <input
                type="number"
                min="1"
                value={longBreakDuration}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLongBreakDuration(val);
                  if (!isRunning && mode === "longBreak") setTimeLeft(val * 60);
                }}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pop-out button */}
      <div className="max-w-md w-full flex flex-col space-y-4">
        <button 
          onClick={togglePiP}
          className="bg-white/20 hover:bg-white/30 text-white py-3 rounded-xl font-bold flex items-center justify-center transition shadow-lg backdrop-blur-md"
        >
          🚀 Open Minimal Timer
        </button>

        <button 
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="text-white/80 hover:text-white text-sm font-medium flex items-center justify-center w-full transition"
        >
          {showShortcuts ? "Hide Shortcuts" : "View Shortcuts"}
        </button>
        
        {showShortcuts && (
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white text-sm">
            <ul className="space-y-2">
              <li className="flex justify-between"><span>Start / Pause</span> <span><kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">S</kbd> or <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">Space</kbd></span></li>
              <li className="flex justify-between"><span>Reset Timer</span> <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">R</kbd></li>
              <li className="flex justify-between"><span>Undo Reset</span> <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">Ctrl + Z</kbd></li>
              <li className="flex justify-between"><span>Skip Phase</span> <kbd className="bg-white/20 px-2 py-0.5 rounded font-mono shadow-sm">N</kbd></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  // 2. MINIMAL UI (Rendered only inside the tiny pop-up window)
  const MinimalTimerUI = (
    <div className={`h-screen w-screen flex flex-col items-center justify-center transition-colors duration-500 overflow-hidden ${bgColors[mode]}`}>
      
      <span className="text-white/90 text-xs font-bold uppercase tracking-widest mb-1 shadow-sm">
        {mode.replace(/([A-Z])/g, " $1").trim()}
      </span>
      
      <div className="text-5xl font-mono font-bold tracking-tight text-white mb-4 drop-shadow-md">
        {formatTime(timeLeft)}
      </div>
      
      <div className="flex space-x-3">
        <button
          onClick={toggleTimer}
          className="px-4 py-1.5 bg-slate-900/40 hover:bg-slate-900/60 text-white rounded-md font-medium text-sm transition"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={handleSessionEnd}
          className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-md font-medium text-sm transition"
        >
          Skip
        </button>
      </div>
      
    </div>
  );

  // Determine what to render based on whether the PiP window is open
  return (
    <>
      {/* Show full UI when PiP is closed */}
      {!pipWindow && FullTimerUI}

      {/* Show tiny minimal UI when PiP is open */}
      {pipWindow && createPortal(MinimalTimerUI, pipWindow.document.body)}

      {/* Show placeholder on main tab when PiP is active */}
      {pipWindow && (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-800">
          <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
            <h2 className="text-2xl font-bold mb-4">Timer is running in Pop-up! 🚀</h2>
            <p className="text-slate-500 mb-6">Your minimal timer is currently pinned to your screen.</p>
            <button 
              onClick={() => pipWindow.close()} 
              className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
            >
              Bring Timer Back
            </button>
          </div>
        </div>
      )}
    </>
  );
}