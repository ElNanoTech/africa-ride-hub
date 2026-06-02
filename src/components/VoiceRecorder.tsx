import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob) => void;
  isSending?: boolean;
  disabled?: boolean;
}

function WaveformBars({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 24;

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barWidth = Math.max(2, (w / barCount) - 2);
      const gap = 2;

      for (let i = 0; i < barCount; i++) {
        // Sample from different frequency ranges for visual variety
        const dataIndex = Math.floor((i / barCount) * bufferLength * 0.7);
        const value = dataArray[dataIndex] || 0;
        const barHeight = Math.max(3, (value / 255) * h * 0.85);

        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        // Use CSS variable color via computed style
        ctx.fillStyle = 'hsl(0, 84%, 60%)'; // destructive color
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={28}
      className="flex-1 max-w-[140px]"
    />
  );
}

export function VoiceRecorder({ onSend, isSending = false, disabled = false }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analyser for waveform
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      
      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordedBlob(null);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch {
      console.error('Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAnalyser(null);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(recordingDuration);
  }, [recordingDuration]);

  const discardRecording = useCallback(() => {
    setRecordedBlob(null);
    setDuration(0);
    setRecordingDuration(0);
  }, []);

  const handleSend = useCallback(() => {
    if (recordedBlob) {
      onSend(recordedBlob);
      setRecordedBlob(null);
      setDuration(0);
    }
  }, [recordedBlob, onSend]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isSending) {
    return (
      <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Envoi du vocal...</span>
      </div>
    );
  }

  if (recordedBlob) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={discardRecording}
          className="text-destructive min-h-[44px] min-w-[44px]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-center gap-2 bg-primary/5 rounded-full px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium">{formatTime(duration)}</span>
          <span className="text-xs text-muted-foreground">Message vocal prêt</span>
        </div>
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          className="min-h-[44px] min-w-[44px] rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-destructive/5 rounded-full px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium text-destructive flex-shrink-0">
            {formatTime(recordingDuration)}
          </span>
          <WaveformBars analyser={analyser} />
        </div>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          onClick={stopRecording}
          className="min-h-[44px] min-w-[44px] rounded-full"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={startRecording}
      disabled={disabled}
      className={cn("min-h-[44px] min-w-[44px] rounded-full text-muted-foreground hover:text-primary")}
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}
