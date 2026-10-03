import React, { useState, useRef, useEffect } from 'react';
import { Square, Trash2, Send } from 'lucide-react';

interface AudioRecorderProps {
  onSendAudio: (audioBase64: string, durationSeconds: number) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSendAudio, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = async () => {
    setPermissionError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const localUrl = URL.createObjectURL(audioBlob);
        setAudioUrl(localUrl);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setAudioBase64(reader.result as string);
        };

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setPermissionError('Akses mikrofon tidak diizinkan.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSend = () => {
    if (audioBase64) {
      onSendAudio(audioBase64, Math.max(1, recordSeconds));
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (permissionError) {
    return (
      <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
        <span>{permissionError}</span>
        <button
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-800 px-2 py-1 bg-white border border-red-200 rounded-lg"
        >
          Tutup
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-2 bg-slate-100 border border-slate-200 rounded-2xl gap-3">
      <div className="flex items-center gap-2 pl-2">
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-mono text-slate-700 tabular-nums">
              {formatTime(recordSeconds)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <audio src={audioUrl || undefined} controls className="h-8 max-w-[200px]" />
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {formatTime(recordSeconds)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Berhenti"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!audioBase64}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Kirim</span>
          </button>
        )}

        <button
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
          title="Batal"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
