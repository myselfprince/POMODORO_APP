"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const getLogicalDay = () => {
  const d = new Date();
  d.setHours(d.getHours() - 4);
  return d.toDateString();
};

export default function Pomodoro() {
  const [activeTab, setActiveTab] = useState("freeFlow");
  const [pipWindow, setPipWindow] = useState(null);
  
  // Pomodoro State
  const [studyDuration, setStudyDuration] = useState(60);
  const [shortBreakDuration, setShortBreakDuration] = useState(10);
  const [longBreakDuration, setLongBreakDuration] = useState(30);
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState("study");
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const [previousState, setPreviousState] = useState(null);
  
  // Free Flow State
  const [freeMode, setFreeMode] = useState("idle");
  const [freeStudyTime, setFreeStudyTime] = useState(0);
  const [freeBreakTime, setFreeBreakTime] = useState(0);

  // Stream Break Timer State (OBS)
  const [obsBreakInput, setObsBreakInput] = useState("");
  const [obsBreakActive, setObsBreakActive] = useState(false);
  const [obsTimeLeft, setObsTimeLeft] = useState(0);
  const [obsResumeTime, setObsResumeTime] = useState("");
  const [obsBreakDuration, setObsBreakDuration] = useState(0);

  // Refs
  const startTimestampRef = useRef(null);
  const startTimeLeftRef = useRef(60 * 60);
  const studyStartTimestampRef = useRef(null);
  const studySecondsAtStartRef = useRef(0);
  const blockStartRef = useRef(null);
  const studyAccumRef = useRef(0);
  const breakAccumRef = useRef(0);
  const lastSaveRef = useRef(0);
  
  const modeRef = useRef(mode);
  const sessionsRef = useRef(sessionsCompleted);
  const isRunningRef = useRef(isRunning);
  const freeModeRef = useRef(freeMode);
  const timeLeftRef = useRef(timeLeft);
  const totalStudyRef = useRef(totalStudySeconds);
  const freeStudyTimeRef = useRef(freeStudyTime);
  const freeBreakTimeRef = useRef(freeBreakTime);
  
  const obsEndTimeRef = useRef(null);
  const obsBreakActiveRef = useRef(false);

  const audioRef = useRef(null);
  const hasUnlockedAudio = useRef(false);
  const workerRef = useRef(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { sessionsRef.current = sessionsCompleted; }, [sessionsCompleted]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { freeModeRef.current = freeMode; }, [freeMode]);

  useEffect(() => {
    audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    const today = getLogicalDay();
    const storedPomodoro = localStorage.getItem("pomodoroStudyTime");
    
    if (storedPomodoro) {
      try {
        const { date, seconds } = JSON.parse(storedPomodoro);
        if (date === today) {
          setTotalStudySeconds(seconds);
          totalStudyRef.current = seconds;
        } else {
          localStorage.removeItem("pomodoroStudyTime");
        }
      } catch (e) { console.error("Error reading pomodoro local storage"); }
    }
    
    const storedFreeFlow = localStorage.getItem("freeFlowState");
    if (storedFreeFlow) {
      try {
        const parsed = JSON.parse(storedFreeFlow);
        if (parsed.date === today) {
          setFreeMode(parsed.mode || "idle");
          studyAccumRef.current = parsed.studyAccum || 0;
          breakAccumRef.current = parsed.breakAccum || 0;
          setFreeStudyTime(studyAccumRef.current);
          setFreeBreakTime(breakAccumRef.current);
          freeStudyTimeRef.current = studyAccumRef.current;
          freeBreakTimeRef.current = breakAccumRef.current;
          if (parsed.mode !== "idle" && parsed.lastTimestamp) {
            blockStartRef.current = parsed.lastTimestamp;
          }
        } else {
          localStorage.removeItem("freeFlowState");
        }
      } catch (e) { console.error("Error reading free flow local storage"); }
    }
  }, []);

  const unlockAudio = useCallback(() => {
    if (!hasUnlockedAudio.current && audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        hasUnlockedAudio.current = true;
      }).catch(() => {});
    }
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => console.log("Audio play prevented:", err));
    }
  }, []);

  const persistPomodoroTime = useCallback((seconds) => {
    localStorage.setItem("pomodoroStudyTime", JSON.stringify({ date: getLogicalDay(), seconds }));
  }, []);

  const persistFreeFlowTime = useCallback(() => {
    localStorage.setItem("freeFlowState", JSON.stringify({
      date: getLogicalDay(),
      mode: freeModeRef.current,
      studyAccum: studyAccumRef.current,
      breakAccum: breakAccumRef.current,
      lastTimestamp: blockStartRef.current
    }));
  }, []);

  const handleSessionEnd = useCallback((currentTimeLeft, currentMode, currentSessionsCompleted) => {
    playSound();
    let nextMode;
    if (currentMode === "study") {
      const newCount = currentSessionsCompleted + 1;
      setSessionsCompleted(newCount);
      nextMode = newCount % 4 === 0 ? "longBreak" : "shortBreak";
      setTimeLeft(nextMode === "longBreak" ? longBreakDuration * 60 : shortBreakDuration * 60);
      timeLeftRef.current = nextMode === "longBreak" ? longBreakDuration * 60 : shortBreakDuration * 60;
      startTimeLeftRef.current = timeLeftRef.current;
    } else {
      nextMode = "study";
      setTimeLeft(studyDuration * 60);
      timeLeftRef.current = studyDuration * 60;
      startTimeLeftRef.current = studyDuration * 60;
    }
    setMode(nextMode);
    startTimestampRef.current = Date.now();
    if (nextMode === "study") {
      studyStartTimestampRef.current = Date.now();
      studySecondsAtStartRef.current = totalStudyRef.current;
    } else {
      studyStartTimestampRef.current = null;
    }
  }, [longBreakDuration, shortBreakDuration, studyDuration, playSound]);

  const tick = useCallback(() => {
    const now = Date.now();
    
    // Pomodoro logic
    if (isRunningRef.current) {
      const elapsed = (now - startTimestampRef.current) / 1000;
      const exactTimeLeft = startTimeLeftRef.current - elapsed;
      const newTimeLeft = Math.max(0, Math.ceil(exactTimeLeft));
      if (newTimeLeft !== timeLeftRef.current) {
        setTimeLeft(newTimeLeft);
        timeLeftRef.current = newTimeLeft;
      }
      if (modeRef.current === "study" && studyStartTimestampRef.current !== null) {
        const studyElapsed = (now - studyStartTimestampRef.current) / 1000;
        const newTotal = studySecondsAtStartRef.current + studyElapsed;
        if (Math.floor(newTotal) !== Math.floor(totalStudyRef.current)) {
          setTotalStudySeconds(newTotal);
          totalStudyRef.current = newTotal;
          if (Math.floor(newTotal) > 0 && Math.floor(newTotal) % 5 === 0) persistPomodoroTime(newTotal);
        }
      }
      if (newTimeLeft === 0) {
        if (modeRef.current === "study") persistPomodoroTime(totalStudyRef.current);
        handleSessionEnd(newTimeLeft, modeRef.current, sessionsRef.current);
      }
    }
    
    // Free Flow logic
    if (freeModeRef.current !== "idle" && blockStartRef.current) {
      const elapsed = (now - blockStartRef.current) / 1000;
      if (freeModeRef.current === "study") {
        const newStudy = studyAccumRef.current + elapsed;
        if (Math.floor(newStudy) !== Math.floor(freeStudyTimeRef.current)) {
          setFreeStudyTime(newStudy);
          freeStudyTimeRef.current = newStudy;
        }
      } else if (freeModeRef.current === "break") {
        const newBreak = breakAccumRef.current + elapsed;
        if (Math.floor(newBreak) !== Math.floor(freeBreakTimeRef.current)) {
          setFreeBreakTime(newBreak);
          freeBreakTimeRef.current = newBreak;
        }
      }
      if (now - lastSaveRef.current > 2000) {
        persistFreeFlowTime();
        lastSaveRef.current = now;
      }
    }

    // OBS Stream Break Timer logic
    if (obsBreakActiveRef.current && obsEndTimeRef.current) {
      const left = obsEndTimeRef.current - now;
      if (left <= 0) {
        setObsBreakActive(false);
        obsBreakActiveRef.current = false;
        setObsTimeLeft(0);
      } else {
        setObsTimeLeft(left);
      }
    }
  }, [persistPomodoroTime, persistFreeFlowTime, handleSessionEnd]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (!timer) timer = setInterval(() => self.postMessage('tick'), 250);
        } else if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);
    workerRef.current.onmessage = (e) => {
      if (e.data === "tick") tick();
    };
    workerRef.current.postMessage("start");
    return () => {
      workerRef.current.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [tick]);

  const toggleTimer = useCallback(() => {
    unlockAudio();
    setIsRunning((prev) => {
      const next = !prev;
      if (next) {
        startTimestampRef.current = Date.now();
        startTimeLeftRef.current = timeLeftRef.current;
        if (modeRef.current === "study") {
          studyStartTimestampRef.current = Date.now();
          studySecondsAtStartRef.current = totalStudyRef.current;
        }
      } else {
        if (modeRef.current === "study" && studyStartTimestampRef.current !== null) {
          persistPomodoroTime(totalStudyRef.current);
          studyStartTimestampRef.current = null;
        }
      }
      return next;
    });
  }, [unlockAudio, persistPomodoroTime]);

  const resetTimer = useCallback(() => {
    setPreviousState({ timeLeft: timeLeftRef.current, isRunning, mode });
    setIsRunning(false);
    setMode("study");
    const newTime = studyDuration * 60;
    setTimeLeft(newTime);
    timeLeftRef.current = newTime;
    startTimeLeftRef.current = newTime;
  }, [isRunning, mode, studyDuration]);

  const undoReset = useCallback(() => {
    if (previousState) {
      setTimeLeft(previousState.timeLeft);
      timeLeftRef.current = previousState.timeLeft;
      startTimeLeftRef.current = previousState.timeLeft;
      setIsRunning(previousState.isRunning);
      setMode(previousState.mode);
      setPreviousState(null);
    }
  }, [previousState]);

  const toggleFreeStudy = useCallback(() => {
    unlockAudio();
    if (freeMode === "study") return;
    const now = Date.now();
    if (freeMode === "break" && blockStartRef.current) {
      breakAccumRef.current += (now - blockStartRef.current) / 1000;
      setFreeBreakTime(breakAccumRef.current);
      freeBreakTimeRef.current = breakAccumRef.current;
    }
    blockStartRef.current = now;
    setFreeMode("study");
    persistFreeFlowTime();
  }, [freeMode, unlockAudio, persistFreeFlowTime]);

  const toggleFreeBreak = useCallback(() => {
    unlockAudio();
    if (freeMode === "break") return;
    const now = Date.now();
    if (freeMode === "study" && blockStartRef.current) {
      studyAccumRef.current += (now - blockStartRef.current) / 1000;
      setFreeStudyTime(studyAccumRef.current);
      freeStudyTimeRef.current = studyAccumRef.current;
    }
    blockStartRef.current = now;
    setFreeMode("break");
    persistFreeFlowTime();
  }, [freeMode, unlockAudio, persistFreeFlowTime]);

  const resetFreeFlow = useCallback(() => {
    setFreeMode("idle");
    setFreeStudyTime(0);
    setFreeBreakTime(0);
    freeStudyTimeRef.current = 0;
    freeBreakTimeRef.current = 0;
    studyAccumRef.current = 0;
    breakAccumRef.current = 0;
    blockStartRef.current = null;
    localStorage.removeItem("freeFlowState");
  }, []);

  // OBS Stream Break Methods
  const startObsBreak = useCallback(() => {
    const mins = parseInt(obsBreakInput, 10);
    if (isNaN(mins) || mins <= 0) return;

    // Auto-stop study timer in free flow
    if (freeModeRef.current !== "break") {
        toggleFreeBreak();
    }

    setObsBreakDuration(mins);
    const now = new Date();
    const resumeDate = new Date(now.getTime() + mins * 60000);
    
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    setObsResumeTime(resumeDate.toLocaleTimeString('en-US', options).toLowerCase());

    obsEndTimeRef.current = resumeDate.getTime();
    obsBreakActiveRef.current = true;
    setObsBreakActive(true);
    setObsTimeLeft(mins * 60000);
    setObsBreakInput("");
  }, [obsBreakInput, toggleFreeBreak]);

  const resetObsBreak = useCallback(() => {
    obsBreakActiveRef.current = false;
    setObsBreakActive(false);
    obsEndTimeRef.current = null;
    setObsTimeLeft(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Manage key events for Inputs
      if (e.target.tagName === "INPUT") {
        if (e.key === "Enter" && activeTab === "freeFlow") startObsBreak();
        if (e.key === "Escape" && activeTab === "freeFlow") resetObsBreak();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && activeTab === "pomodoro") {
        e.preventDefault(); undoReset();
      } else if (e.key.toLowerCase() === "s" || e.code === "Space") {
        e.preventDefault();
        if (activeTab === "pomodoro") toggleTimer();
        else freeMode === "study" ? toggleFreeBreak() : toggleFreeStudy();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (activeTab === "pomodoro") resetTimer();
        else resetFreeFlow();
      } else if (e.key === "Escape" && activeTab === "freeFlow") {
        e.preventDefault();
        resetObsBreak();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoReset, toggleTimer, resetTimer, toggleFreeStudy, toggleFreeBreak, resetFreeFlow, startObsBreak, resetObsBreak, activeTab, freeMode]);

  const togglePiP = async () => {
    if (pipWindow) { pipWindow.close(); return; }
    if (!("documentPictureInPicture" in window)) {
      alert("Your browser doesn't support the Always-on-Top API yet.");
      return;
    }
    try {
      const newWindow = await window.documentPictureInPicture.requestWindow({ width: 280, height: 160 });
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        newWindow.document.head.appendChild(node.cloneNode(true));
      });
      newWindow.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(newWindow);
    } catch (error) { console.error("Failed to open PiP:", error); }
  };

  const formatTimeHHMMSS = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatTimeDynamic = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formatObsTime = (ms) => {
    if (ms <= 0) return "00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const bgColors = { study: "bg-black", shortBreak: "bg-green-600", longBreak: "bg-blue-600" };

  const FullTimerUI = (
    <div className={`min-h-screen flex flex-col items-center justify-center transition-colors duration-500 py-10 px-4 ${activeTab === 'pomodoro' ? bgColors[mode] : 'bg-slate-900'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl transition-all duration-500 w-full text-slate-800 mb-6 relative overflow-hidden ${activeTab === "freeFlow" ? "max-w-4xl" : "max-w-md"}`}>
        
        <div className="flex w-full border-b border-slate-200 bg-slate-50">
          <button
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "pomodoro" ? "bg-white text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            onClick={() => setActiveTab("pomodoro")}
          >
            Pomodoro
          </button>
          <button
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === "freeFlow" ? "bg-white text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            onClick={() => setActiveTab("freeFlow")}
          >
            Free Flow
          </button>
        </div>

        <div className="p-8">
          {activeTab === "pomodoro" && (
            <div className="animate-fade-in">
              {previousState && (
                <div className="absolute top-16 left-0 right-0 flex justify-center z-10">
                  <span className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg flex items-center space-x-2">
                    <span>Timer reset.</span>
                    <button onClick={undoReset} className="font-bold underline hover:text-blue-300">Undo (Ctrl+Z)</button>
                  </span>
                </div>
              )}
              <div className="flex justify-center space-x-2 mb-8">
                {["study", "shortBreak", "longBreak"].map((m) => (
                  <span key={m} className={`px-4 py-1 rounded-full text-sm font-semibold capitalize transition ${mode === m ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-500"}`}>
                    {m.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                ))}
              </div>
              <div className="text-center mb-8">
                <div className="text-7xl font-mono font-bold tracking-tight text-slate-900 mb-4">{formatTimeDynamic(timeLeft)}</div>
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
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Study</p>
                  <p className="text-2xl font-bold text-blue-600">{formatTimeDynamic(totalStudySeconds)}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "freeFlow" && (
            <div className="flex flex-col md:flex-row gap-8 items-stretch pt-2">
              
              {/* LEFT: Original Free Flow Stats */}
              <div className="flex-1 flex flex-col justify-center animate-fade-in text-center">
                <div className="mb-8">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Study</p>
                  <div className={`text-6xl font-mono font-bold tracking-tight transition-colors ${freeMode === 'study' ? 'text-blue-600' : 'text-slate-900'}`}>
                    {formatTimeHHMMSS(freeStudyTime)}
                  </div>
                  <div className={`mt-6 inline-block px-6 py-3 rounded-xl border transition-colors ${freeMode === 'break' ? 'border-amber-400 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Break Time</p>
                    <div className={`text-2xl font-mono font-bold ${freeMode === 'break' ? 'text-amber-600' : 'text-slate-500'}`}>
                      {formatTimeHHMMSS(freeBreakTime)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col space-y-3 mb-4">
                  <div className="flex space-x-3">
                    <button
                      onClick={toggleFreeStudy}
                      className={`flex-1 py-4 rounded-xl font-bold text-lg transition shadow-sm ${freeMode === 'study' ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      📖 Study
                    </button>
                    <button
                      onClick={toggleFreeBreak}
                      className={`flex-1 py-4 rounded-xl font-bold text-lg transition shadow-sm ${freeMode === 'break' ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      ☕ Break
                    </button>
                  </div>
                  <button
                    onClick={resetFreeFlow}
                    className="w-full py-3 bg-white border-2 border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 hover:text-red-500 transition"
                  >
                    Reset Everything
                  </button>
                </div>
              </div>

              {/* RIGHT: OBS Stream Break Timer */}
              <div className="flex-1 md:border-l-2 md:border-slate-100 md:pl-8 flex items-center justify-center">
                <div 
                  className="w-full h-full min-h-[400px] bg-black rounded-2xl flex flex-col items-center justify-center p-6 relative group overflow-hidden"
                  onDoubleClick={resetObsBreak}
                >
                  {!obsBreakActive ? (
                    <div className="flex flex-col items-center gap-6 z-10">
                      <input
                        type="number"
                        min="1"
                        value={obsBreakInput}
                        onChange={(e) => setObsBreakInput(e.target.value)}
                        placeholder="Minutes"
                        className="text-4xl py-4 px-6 rounded-xl border-2 border-slate-700 bg-slate-800 text-white text-center w-56 outline-none focus:border-blue-500 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                      />
                      <button 
                        onClick={startObsBreak}
                        className="text-2xl py-3 px-10 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 active:scale-95 transition-all"
                      >
                        Start Break
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center z-10 w-full select-none cursor-default">
                      <div className="text-[6.5rem] sm:text-[7rem] font-bold tabular-nums tracking-tighter text-white mb-2 leading-none drop-shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                        {formatObsTime(obsTimeLeft)}
                      </div>
                      <div className="text-2xl sm:text-3xl font-medium text-slate-300 my-2">
                        Break <span className="text-blue-500 font-bold">{obsBreakDuration}</span> mins
                      </div>
                      <div className="text-2xl sm:text-3xl font-medium text-slate-300">
                        Resume @ <span className="text-blue-500 font-bold">{obsResumeTime}</span>
                      </div>
                      <div className="absolute bottom-4 text-slate-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        Press ESC or Double-click to reset
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
      
      <div className={`${activeTab === "freeFlow" ? "max-w-4xl" : "max-w-md"} w-full flex flex-col space-y-4`}>
        <button onClick={togglePiP} className="bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold flex items-center justify-center transition shadow-lg backdrop-blur-md">
          🚀 Open Minimal Timer
        </button>
      </div>
    </div>
  );

  const MinimalTimerUI = activeTab === "pomodoro" ? (
    <div className={`h-screen w-screen flex flex-col items-center justify-center transition-colors duration-500 overflow-hidden ${bgColors[mode]}`}>
      <span className="text-white/90 text-xs font-bold uppercase tracking-widest mb-1">{mode.replace(/([A-Z])/g, " $1").trim()}</span>
      <div className="text-5xl font-mono font-bold text-white mb-4">{formatTimeDynamic(timeLeft)}</div>
      <div className="flex space-x-3">
        <button onClick={toggleTimer} className="px-4 py-1.5 bg-slate-900/40 hover:bg-slate-900/60 text-white rounded-md font-medium text-sm transition">{isRunning ? "Pause" : "Play"}</button>
      </div>
    </div>
  ) : (
    <div className="h-screen w-screen flex flex-col items-center justify-center transition-colors duration-500 overflow-hidden bg-slate-900">
      <span className={`text-xs font-bold uppercase tracking-widest mb-1 ${freeMode === 'study' ? 'text-blue-400' : freeMode === 'break' ? 'text-amber-400' : 'text-slate-400'}`}>
        {freeMode === "idle" ? "Free Flow" : freeMode === "study" ? "Studying" : "On Break"}
      </span>
      <div className="text-5xl font-mono font-bold text-white mb-2">{formatTimeHHMMSS(freeStudyTime)}</div>
      {freeMode === "break" && <div className="text-xl font-mono text-amber-400">{formatTimeHHMMSS(freeBreakTime)}</div>}
    </div>
  );

  return (
    <>
      {!pipWindow && FullTimerUI}
      {pipWindow && createPortal(MinimalTimerUI, pipWindow.document.body)}
      {pipWindow && (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-800">
          <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
            <h2 className="text-2xl font-bold mb-4">Timer running in Pop-up! 🚀</h2>
            <p className="text-slate-500 mb-6">Your timer is pinned to your screen.</p>
            <button onClick={() => pipWindow.close()} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">Bring Timer Back</button>
          </div>
        </div>
      )}
    </>
  );
}