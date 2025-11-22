"use client";

import { useState } from "react";

export default function RecordAudio() {
  const [isRecording, setIsRecording] = useState(false);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // TODO: Add actual recording logic
  };

  return (
    
    <div className="flex flex-col items-center">
    <button
      onClick={toggleRecording}
      className={`
        group relative flex h-20 w-20 items-center justify-center rounded-full
        transition-all duration-300 ease-in-out mb-6
        ${
          isRecording
            ? "bg-red-500 shadow-lg shadow-red-500/50 hover:bg-red-600"
            : "bg-blue-500 shadow-lg shadow-blue-500/50 hover:bg-blue-600 hover:scale-110"
        }
      `}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
    >
      {isRecording ? (
        // Stop icon (square)
        <div className="h-6 w-6 rounded-sm bg-white" />
      ) : (
        // Microphone icon
        <svg
          className="h-10 w-10 text-white transition-transform group-hover:scale-110"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
      
      {/* Pulse animation when recording */}
      {isRecording && (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-red-400 opacity-75" />
        </>
      )}
    </button>
    <h1>Chat with AI</h1>
    </div>
  );
}