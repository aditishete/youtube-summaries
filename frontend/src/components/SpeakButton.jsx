import { useState, useEffect, useRef } from 'react';

export function useSpeech() {
  const [speakingId, setSpeakingId] = useState(null);
  const utteranceRef = useRef(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const speak = (id, text) => {
    window.speechSynthesis.cancel();
    if (speakingId === id) { setSpeakingId(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.onend = () => setSpeakingId(null);
    u.onerror = () => setSpeakingId(null);
    utteranceRef.current = u;
    setSpeakingId(id);
    window.speechSynthesis.speak(u);
  };

  return { speakingId, speak };
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function SpeakButton({ id, text, speakingId, onSpeak }) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return null;
  const active = speakingId === id;
  return (
    <button
      onClick={() => onSpeak(id, text)}
      title={active ? 'Stop' : 'Read aloud'}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
        active
          ? 'bg-violet-600/30 border-violet-500 text-violet-300 hover:bg-violet-600/50'
          : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-400'
      }`}
    >
      {active ? <StopIcon /> : <PlayIcon />}
      {active ? 'Stop' : 'Play'}
    </button>
  );
}
