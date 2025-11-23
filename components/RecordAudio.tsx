"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export default function RecordButton() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>("Ready");

  const audioContext = useRef<AudioContext | null>(null);
  const audioWorkletNode = useRef<AudioWorkletNode | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const websocket = useRef<WebSocket | null>(null);

  // Audio playback references
  const playbackContext = useRef<AudioContext | null>(null);
  const nextPlaybackTime = useRef<number>(0);
  const isPlayingAudio = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContext.current || websocket.current) {
        mediaStream.current?.getTracks().forEach((track) => track.stop());
        audioWorkletNode.current?.disconnect();
        audioContext.current?.close();
        websocket.current?.close();
      }
      if (playbackContext.current) {
        playbackContext.current.close();
      }
    };
  }, []);

  // Initialize audio playback context
  const initPlaybackContext = useCallback(() => {
    if (!playbackContext.current) {
      playbackContext.current = new AudioContext({ sampleRate: 24000 });
      nextPlaybackTime.current = playbackContext.current.currentTime;
    }
  }, []);

  // Decode base64 PCM16 to AudioBuffer
  const decodeBase64PCM16 = useCallback(
    (base64Audio: string, sampleRate: number = 24000): AudioBuffer => {
      // Decode base64 to binary string
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert bytes to Int16Array (PCM16)
      const pcm16 = new Int16Array(bytes.buffer);

      // Convert PCM16 to Float32 for Web Audio API
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }

      // Create AudioBuffer
      if (!playbackContext.current) {
        throw new Error("Playback context not initialized");
      }

      const audioBuffer = playbackContext.current.createBuffer(
        1, // mono
        float32.length,
        sampleRate
      );

      audioBuffer.copyToChannel(float32, 0);
      return audioBuffer;
    },
    []
  );

  // Play audio buffer with smooth scheduling
  const playAudioBuffer = useCallback(
    (audioBuffer: AudioBuffer) => {
      if (!playbackContext.current || isRecording) return;

      const source = playbackContext.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.current.destination);

      // Schedule playback
      const currentTime = playbackContext.current.currentTime;
      const scheduleTime = Math.max(currentTime, nextPlaybackTime.current);

      source.start(scheduleTime);

      // Update next playback time for smooth continuation
      nextPlaybackTime.current = scheduleTime + audioBuffer.duration;

      // Track playing state
      isPlayingAudio.current = true;
      source.onended = () => {
        isPlayingAudio.current = false;
      };
    },
    [isRecording]
  );

  // Handle incoming audio data from WebSocket
  const handleIncomingAudio = useCallback(
    (base64Audio: string) => {
      if (isRecording) {
        // Don't play audio while recording
        return;
      }

      try {
        initPlaybackContext();
        const audioBuffer = decodeBase64PCM16(base64Audio);
        playAudioBuffer(audioBuffer);
      } catch (error) {
        console.error("Error playing audio:", error);
      }
    },
    [isRecording, initPlaybackContext, decodeBase64PCM16, playAudioBuffer]
  );

  // Connect to WebSocket (only once, reused for multiple recordings)
  const connectWebSocket = useCallback(async () => {
    // Don't create a new connection if one already exists and is open/connecting
    if (
      websocket.current?.readyState === WebSocket.OPEN ||
      websocket.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      setStatus("Connecting...");

      // Fetch WebSocket URL from API
      const response = await fetch("/api/v1/realtime", { method: "POST" });
      const { socketUrl } = await response.json();

      // Create WebSocket connection
      websocket.current = new WebSocket(socketUrl);
      websocket.current.binaryType = "arraybuffer";

      websocket.current.onopen = () => {
        setStatus("Connected");
        // Initialize playback context for incoming audio
        initPlaybackContext();
      };

      websocket.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setStatus("WebSocket error");
      };

      websocket.current.onclose = () => {
        setStatus("Disconnected");
        setIsRecording(false);
      };

      websocket.current.onmessage = (event) => {
        // Handle incoming messages from the server
        try {
          const message = JSON.parse(event.data);

          // Handle OpenAI Realtime API audio delta events
          if (message.type === "response.audio.delta" && message.delta) {
            // Play incoming audio chunk
            handleIncomingAudio(message.delta);
          } else if (message.type === "error") {
            console.error("Server error:", message.error);
            setStatus(`Error: ${message.error.message || "Unknown error"}`);
          } else {
            // Log other message types for debugging
            console.log("Received message:", message);
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
        }
      };

      // Wait for connection to open
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        
        const checkConnection = () => {
          if (websocket.current?.readyState === WebSocket.OPEN) {
            clearTimeout(timeout);
            resolve(true);
          } else if (websocket.current?.readyState === WebSocket.CLOSED) {
            clearTimeout(timeout);
            reject(new Error("Connection failed"));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        
        checkConnection();
      });
    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      setStatus("Connection failed");
      throw error;
    }
  }, [initPlaybackContext, handleIncomingAudio]);

  // Convert ArrayBuffer to base64 string
  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  // Start microphone recording
  const startMicRecording = useCallback(async () => {
    try {
      // Create audio context for recording
      audioContext.current = new AudioContext({
        sampleRate: 24000, // 24kHz for optimal quality/performance balance
      });

      // Load the AudioWorklet processor
      await audioContext.current.audioWorklet.addModule("/audio-processor.js");

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
          // Convert PCM16 ArrayBuffer to base64
          const base64Audio = arrayBufferToBase64(event.data.data);
          
          // Send base64 encoded PCM16 audio through WebSocket
          // OpenAI expects the field to be named 'audio', not 'data'
          websocket.current.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Audio,
            })
          );
        }
      };

      // Connect the audio nodes
      source.connect(audioWorkletNode.current);

      setStatus("Recording...");
      setIsRecording(true);
    } catch (error) {
      console.error("Error setting up microphone:", error);
      setStatus("Microphone error");
      throw error;
    }
  }, [arrayBufferToBase64]);

  // Stop microphone recording (but keep WebSocket open)
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

    // Reset playback timing when stopping
    if (playbackContext.current) {
      nextPlaybackTime.current = playbackContext.current.currentTime;
    }

    setIsRecording(false);
    
    // Update status only if we're still connected
    if (websocket.current?.readyState === WebSocket.OPEN) {
      setStatus("Connected");
    }
  }, []);

  // Start recording (connect WebSocket if needed, then start mic)
  const startRecording = useCallback(async () => {
    try {
      // Ensure WebSocket is connected
      await connectWebSocket();
      
      // Start microphone recording
      await startMicRecording();
    } catch (error) {
      console.error("Error starting recording:", error);
      setStatus("Error starting recording");
      stopRecording();
    }
  }, [connectWebSocket, startMicRecording, stopRecording]);

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
