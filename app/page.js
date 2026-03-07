"use client";

import { useState, useEffect } from "react";

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

  // Timer logic
  useEffect(() => {
    let interval;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        if (mode === "study") {
          setTotalStudySeconds((prev) => prev + 1);
        }
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      handleSessionEnd();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode, sessionsCompleted]);

  // Update timer display immediately if durations are customized while stopped
  useEffect(() => {
    if (!isRunning) {
      if (mode === "study") setTimeLeft(studyDuration * 60);
      else if (mode === "shortBreak") setTimeLeft(shortBreakDuration * 60);
      else if (mode === "longBreak") setTimeLeft(longBreakDuration * 60);
    }
  }, [studyDuration, shortBreakDuration, longBreakDuration, mode, isRunning]);

  const handleSessionEnd = () => {
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
  };

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setMode("study");
    setTimeLeft(studyDuration * 60);
  };

  // Helper to format seconds into HH:MM:SS or MM:SS
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

  // Dynamic background colors based on mode
  const bgColors = {
    study: "bg-blue-500",
    shortBreak: "bg-green-500",
    longBreak: "bg-purple-500",
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${bgColors[mode]}`}
    >
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-slate-800">
        <h1 className="text-3xl font-bold text-center mb-6">Focus Timer</h1>

        {/* Mode Indicator */}
        <div className="flex justify-center space-x-2 mb-8">
          {["study", "shortBreak", "longBreak"].map((m) => (
            <span
              key={m}
              className={`px-4 py-1 rounded-full text-sm font-semibold capitalize ${
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
          <div className="text-center">
            <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">
              Sessions
            </p>
            <p className="text-xl font-bold">{sessionsCompleted}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">
              Total Study Time
            </p>
            <p className="text-xl font-bold text-blue-600">
              {formatTime(totalStudySeconds)}
            </p>
          </div>
        </div>

        {/* Customization Settings */}
        <div className="space-y-4">
          <h2 className="font-bold text-slate-700">Custom Durations (Mins)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Study</label>
              <input
                type="number"
                min="1"
                value={studyDuration}
                onChange={(e) => setStudyDuration(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Short Break
              </label>
              <input
                type="number"
                min="1"
                value={shortBreakDuration}
                onChange={(e) => setShortBreakDuration(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Long Break
              </label>
              <input
                type="number"
                min="1"
                value={longBreakDuration}
                onChange={(e) => setLongBreakDuration(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}