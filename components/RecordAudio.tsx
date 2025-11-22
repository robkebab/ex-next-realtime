"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export default function RecordAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("Ready");

  const audioContext = useRef<AudioContext | null>(null);
  const audioWorkletNode = useRef<AudioWorkletNode | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const websocket = useRef<WebSocket | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContext.current || websocket.current) {
        mediaStream.current?.getTracks().forEach((track) => track.stop());
        audioWorkletNode.current?.disconnect();
        audioContext.current?.close();
        websocket.current?.close();
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    // Stop all tracks in the media stream
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((track) => track.stop());
      mediaStream.current = null;
    }

    // Close audio worklet node
    if (audioWorkletNode.current) {
      audioWorkletNode.current.disconnect();
      audioWorkletNode.current = null;
    }

    // Close audio context
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }

    // Close WebSocket connection
    if (websocket.current) {
      websocket.current.close();
      websocket.current = null;
    }

    setIsRecording(false);
    setStatus("Ready");
  }, []);

  const startRecording = async () => {
    try {
      setStatus("Connecting...");

      // Fetch WebSocket URL from API
      const response = await fetch("/api/v1/realtime", { method: "POST" });
      const { socketUrl } = await response.json();

      // Create WebSocket connection
      websocket.current = new WebSocket(socketUrl);

      websocket.current.onopen = async () => {
        setStatus("Connected to server");

        try {
          // Create audio context
          audioContext.current = new AudioContext({
            sampleRate: 24000, // 24kHz for optimal quality/performance balance
          });

          // Load the AudioWorklet processor
          await audioContext.current.audioWorklet.addModule(
            "/audio-processor.js"
          );

          // Get microphone access
          mediaStream.current = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1, // Mono audio
              sampleRate: 24000,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          // Create audio source from microphone
          const source = audioContext.current.createMediaStreamSource(
            mediaStream.current
          );

          // Create AudioWorklet node
          audioWorkletNode.current = new AudioWorkletNode(
            audioContext.current,
            "audio-stream-processor"
          );

          // Handle messages from the audio processor
          audioWorkletNode.current.port.onmessage = (event) => {
            if (
              event.data.type === "audio" &&
              websocket.current?.readyState === WebSocket.OPEN
            ) {
              // Send base64 encoded PCM16 audio through WebSocket
              websocket.current.send(
                JSON.stringify({
                  type: "audio",
                  data: event.data.data,
                })
              );
            }
          };

          // Connect the audio nodes
          source.connect(audioWorkletNode.current);

          setStatus("Recording...");
          setIsRecording(true);
        } catch (error) {
          console.error("Error setting up audio:", error);
          setStatus("Error setting up audio");
          stopRecording();
        }
      };

      websocket.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setStatus("WebSocket error");
        stopRecording();
      };

      websocket.current.onclose = () => {
        setStatus("Disconnected");
        stopRecording();
      };

      websocket.current.onmessage = (event) => {
        // Handle incoming messages from the server
        console.log("Received:", event.data);
      };
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatus("Error starting recording");
      stopRecording();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
        Chat with AI
      </h1>

      <button
        onClick={toggleRecording}
        className={`
        group relative flex h-20 w-20 items-center justify-center rounded-full
        transition-all duration-300 ease-in-out
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

      <div className="text-sm text-gray-600 dark:text-gray-400 min-h-[20px]">
        {status}
      </div>
    </div>
  );
}
