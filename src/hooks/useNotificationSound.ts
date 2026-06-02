import { useCallback, useRef } from 'react';

// Simple notification sound using Web Audio API
export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      // Create or reuse audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      // Resume context if suspended (required for some browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create oscillator for a pleasant notification sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant notification tone (two-note chime)
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.frequency.setValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6
      
      oscillator.type = 'sine';
      
      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.12);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Could not play notification sound:', error);
    }
  }, []);

  return { playNotificationSound };
}
