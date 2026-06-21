import { useState, useEffect, useRef } from 'react';
import Tooltip from './Tooltip.jsx';

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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function SpeakButton({ id, text, speakingId, onSpeak, tooltipPosition = 'top' }) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return null;
  const active = speakingId === id;
  return (
    <Tooltip label={active ? 'Stop reading aloud' : 'Read summary aloud'} position={tooltipPosition}>
      <button
        onClick={() => onSpeak(id, text)}
        className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
          active
            ? 'bg-violet-600/40 border-violet-500 text-violet-200 hover:bg-violet-600/60'
            : 'bg-zinc-700 border-zinc-500 text-zinc-200 hover:bg-zinc-600 hover:border-zinc-400'
        }`}
      >
        {active ? <StopIcon /> : <PlayIcon />}
        {active ? 'Stop' : 'Play'}
      </button>
    </Tooltip>
  );
}
