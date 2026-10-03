/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useGhostSocket } from './hooks/useGhostSocket';
import { AudioRecorder } from './components/AudioRecorder';
import { IdentityModal, AVATAR_PALETTES } from './components/IdentityModal';
import {
  Send,
  Mic,
  Image as ImageIcon,
  Share2,
  Check,
  Eye,
  EyeOff,
  WifiOff,
} from 'lucide-react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '🤐'];

export default function App() {
  const {
    connectionStatus,
    userId,
    avatar,
    onlineCount,
    messages,
    typingAvatars,
    updateAvatar,
    sendMessage,
    triggerTyping,
    sendReaction,
  } = useGhostSocket();

  const [inputText, setInputText] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [revealedImages, setRevealedImages] = useState<Record<string, boolean>>({});
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingAvatars]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    sendMessage(inputText, { msgType: 'text' });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      triggerTyping();
    }
  };

  const handleAudioComplete = (audioBase64: string, durationSeconds: number) => {
    sendMessage('', {
      msgType: 'audio',
      mediaUrl: audioBase64,
      duration: durationSeconds,
    });
    setShowRecorder(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        sendMessage('', {
          msgType: 'image',
          mediaUrl: compressedBase64,
        });
      };
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleImageReveal = (messageId: string) => {
    setRevealedImages(prev => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const myPalette = AVATAR_PALETTES.find(p => p.id === avatar) || AVATAR_PALETTES[0];

  return (
    <div className="h-screen w-screen bg-slate-50 text-slate-800 flex flex-col font-sans overflow-hidden">
      {/* Connection notice if disconnected */}
      {connectionStatus === 'disconnected' && (
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-800 flex items-center justify-center gap-1.5 font-mono shrink-0">
          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          <span>Menghubungkan kembali...</span>
        </div>
      )}

      {/* Header: Online count on left, Share & Color Profile Avatar on right */}
      <header className="px-4 py-2.5 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
            {onlineCount} online
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Share Link button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            title="Salin Link"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Tersalin</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Salin Link</span>
              </>
            )}
          </button>

          {/* Color profile circle button */}
          <button
            onClick={() => setIsColorModalOpen(true)}
            className="p-0.5 rounded-full hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            title="Pilih Warna Profil"
          >
            <div className={`w-7 h-7 rounded-full ${myPalette.bg} ring-2 ring-slate-200 shadow-xs flex items-center justify-center`} />
          </button>
        </div>
      </header>

      {/* Messages area - ONLY chat content with color profile avatars */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg) => {
          if (msg.msgType === 'system') {
            return (
              <div key={msg.id} className="text-center my-1">
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
            );
          }

          const isSelf = msg.isSelf || msg.senderId === userId;
          const senderPalette = AVATAR_PALETTES.find(p => p.id === msg.senderAvatar) || AVATAR_PALETTES[0];

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'} group`}
            >
              {/* Other person's color profile avatar on the LEFT */}
              {!isSelf && (
                <div
                  className={`w-7 h-7 rounded-full ${senderPalette.bg} shadow-xs shrink-0 mb-1`}
                  title="Profil Warna"
                />
              )}

              {/* Message body container */}
              <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-[82%] md:max-w-[70%]`}>
                {/* Bubble */}
                <div
                  className={`rounded-2xl p-3 text-sm transition-all ${
                    isSelf
                      ? 'bg-emerald-600 text-white rounded-br-xs shadow-xs'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
                  }`}
                >
                  {/* Text */}
                  {msg.text && (
                    <p className="whitespace-pre-wrap break-words leading-relaxed select-text">
                      {msg.text}
                    </p>
                  )}

                  {/* Voice memo */}
                  {msg.msgType === 'audio' && msg.mediaUrl && (
                    <div className="py-0.5">
                      <audio src={msg.mediaUrl} controls className="h-8 max-w-[240px]" />
                    </div>
                  )}

                  {/* Image */}
                  {msg.msgType === 'image' && msg.mediaUrl && (
                    <div className="space-y-1.5">
                      <div className="relative rounded-xl overflow-hidden bg-slate-100 min-h-[140px] flex items-center justify-center">
                        <img
                          src={msg.mediaUrl}
                          alt="Image"
                          className={`max-h-64 object-contain rounded-xl transition-all duration-200 ${
                            revealedImages[msg.id] ? 'filter-none' : 'blur-lg scale-105'
                          }`}
                        />
                        {!revealedImages[msg.id] && (
                          <div
                            onClick={() => toggleImageReveal(msg.id)}
                            className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center cursor-pointer hover:bg-slate-900/40 transition-colors"
                          >
                            <Eye className="w-5 h-5 text-white mb-1" />
                            <span className="text-xs text-white font-medium">Buka gambar</span>
                          </div>
                        )}
                      </div>
                      {revealedImages[msg.id] && (
                        <button
                          onClick={() => toggleImageReveal(msg.id)}
                          className={`text-[11px] flex items-center gap-1 cursor-pointer ${
                            isSelf ? 'text-emerald-100 hover:text-white' : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>Tutup gambar</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Reactions */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-black/10">
                      {Object.entries(msg.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          onClick={() => sendReaction(msg.id, emoji)}
                          className={`text-xs px-1.5 py-0.5 rounded-lg flex items-center gap-1 border transition-colors cursor-pointer ${
                            users.includes(userId)
                              ? 'bg-black/15 border-transparent text-current font-bold'
                              : 'bg-black/5 border-transparent text-current opacity-80 hover:opacity-100'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="font-mono text-[10px]">{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp below bubble */}
                <div className="px-1 mt-1 text-[10px] text-slate-400 font-mono">
                  {formatTimestamp(msg.timestamp)}
                </div>

                {/* Quick emoji on hover */}
                <div className="flex items-center gap-0.5 px-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(msg.id, emoji)}
                      className="hover:scale-125 transition-transform text-xs p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Own color profile avatar on the RIGHT */}
              {isSelf && (
                <div
                  className={`w-7 h-7 rounded-full ${myPalette.bg} shadow-xs shrink-0 mb-1`}
                  title="Profil Warna Kamu"
                />
              )}
            </div>
          );
        })}

        {/* Live typing status with color dots */}
        {typingAvatars.length > 0 && (
          <div className="flex items-center gap-2 pl-1">
            {typingAvatars.map((colorId, idx) => {
              const pal = AVATAR_PALETTES.find(p => p.id === colorId) || AVATAR_PALETTES[0];
              return (
                <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3 py-1.5 shadow-xs">
                  <div className={`w-3.5 h-3.5 rounded-full ${pal.bg}`} />
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-slate-200 bg-white shrink-0">
        {showRecorder ? (
          <AudioRecorder
            onSendAudio={handleAudioComplete}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Kirim Foto"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowRecorder(true)}
              className="p-2.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Kirim Pesan Suara"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pesan..."
              maxLength={2000}
              autoFocus
              className="flex-1 bg-slate-100 border border-slate-200 focus:border-slate-300 focus:bg-white rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors"
            />

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white rounded-xl transition-all cursor-pointer shrink-0"
              title="Kirim"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Color picker modal (Pure color picker, no names) */}
      <IdentityModal
        isOpen={isColorModalOpen}
        onClose={() => setIsColorModalOpen(false)}
        currentAvatar={avatar}
        onSave={updateAvatar}
      />
    </div>
  );
}
