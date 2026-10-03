/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useGhostSocket } from './hooks/useGhostSocket';
import { AudioRecorder } from './components/AudioRecorder';
import { IdentityModal, AVATAR_PALETTES } from './components/IdentityModal';
import { AdminModal } from './components/AdminModal';
import {
  Send,
  Mic,
  Image as ImageIcon,
  Share2,
  Check,
  Eye,
  EyeOff,
  WifiOff,
  Shield,
  Trash2,
  Smartphone,
  Monitor,
} from 'lucide-react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '🤐'];

export default function App() {
  const {
    connectionStatus,
    userId,
    avatar,
    onlineCount,
    activePeers,
    messages,
    typingAvatars,
    updateAvatar,
    sendMessage,
    deleteMessage,
    clearAllMessages,
    triggerTyping,
    sendReaction,
  } = useGhostSocket();

  const [inputText, setInputText] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [revealedImages, setRevealedImages] = useState<Record<string, boolean>>({});
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Admin state (persisted per session)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ghost_admin_authed') === 'true';
    } catch {
      return false;
    }
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingAvatars]);

  const handleAdminLoginSuccess = () => {
    setIsAdmin(true);
    try {
      sessionStorage.setItem('ghost_admin_authed', 'true');
    } catch {}
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem('ghost_admin_authed');
    } catch {}
    setIsAdminModalOpen(false);
  };

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

      {/* Admin banner notice when Farabi is logged in */}
      {isAdmin && (
        <div className="w-full bg-amber-500 text-white px-4 py-1 text-center text-xs font-medium flex items-center justify-center gap-2 shadow-xs shrink-0 z-30">
          <Shield className="w-3.5 h-3.5" />
          <span>Mode Admin Aktif (Farabi) • Kamu bisa menghapus chat siapa pun dan melihat perangkat</span>
          <button
            onClick={() => setIsAdminModalOpen(true)}
            className="underline ml-2 hover:text-amber-100 font-semibold cursor-pointer"
          >
            Buka Panel
          </button>
        </div>
      )}

      {/* Header: Online count on left, Admin Button, Share & Color Profile Avatar on right */}
      <header className="px-4 py-2.5 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-medium text-slate-600 tabular-nums">
            {onlineCount} online
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin Button */}
          <button
            onClick={() => setIsAdminModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              isAdmin
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
            title={isAdmin ? 'Panel Admin Farabi' : 'Masuk Admin'}
          >
            <Shield className={`w-3.5 h-3.5 ${isAdmin ? 'text-amber-600' : 'text-slate-500'}`} />
            <span>{isAdmin ? '👑 Admin' : 'Admin'}</span>
          </button>

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
                  className={`rounded-2xl p-3 text-sm transition-all relative ${
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

                {/* Sub-info below bubble: Timestamp, Device Used, and Admin Delete button */}
                <div className="flex items-center gap-2 px-1 mt-1 flex-wrap">
                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatTimestamp(msg.timestamp)}
                  </span>

                  {/* Device Used Badge */}
                  {msg.deviceInfo && (
                    <span
                      className={`text-[10px] flex items-center gap-1 font-mono px-1.5 py-0.2 rounded-md ${
                        isAdmin
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                      title={`Dikirim dari: ${msg.deviceInfo.full}`}
                    >
                      {msg.deviceInfo.isMobile ? (
                        <Smartphone className="w-2.5 h-2.5" />
                      ) : (
                        <Monitor className="w-2.5 h-2.5" />
                      )}
                      <span>{msg.deviceInfo.device}</span>
                      <span className="opacity-60">•</span>
                      <span>{msg.deviceInfo.browser}</span>
                    </span>
                  )}

                  {/* Admin Delete Action Button (Can delete ANY message) */}
                  {isAdmin && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-1.5 py-0.5 rounded-md border border-rose-200 transition-colors cursor-pointer"
                      title="Hapus pesan ini sebagai Admin"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-rose-600" />
                      <span>Hapus Chat</span>
                    </button>
                  )}
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
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <div className="flex -space-x-1.5">
              {typingAvatars.map((av, idx) => {
                const pal = AVATAR_PALETTES.find(p => p.id === av) || AVATAR_PALETTES[0];
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full ${pal.bg} ring-2 ring-white shadow-2xs animate-bounce`}
                    style={{ animationDelay: `${idx * 150}ms` }}
                  />
                );
              })}
            </div>
            <span className="font-mono text-[11px] text-slate-400">sedang mengetik...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <footer className="p-3 border-t border-slate-200 bg-white shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-2">
          {/* File upload hidden input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          {/* Picture button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
            title="Kirim Foto"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Voice note button */}
          <button
            type="button"
            onClick={() => setShowRecorder(true)}
            className="p-2.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
            title="Kirim Pesan Suara"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Text input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              triggerTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan..."
            className="flex-1 bg-slate-100 text-slate-800 placeholder-slate-400 px-4 py-2.5 rounded-2xl text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
            title="Kirim"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>

      {/* Audio Recorder overlay */}
      {showRecorder && (
        <AudioRecorder
          onSendAudio={handleAudioComplete}
          onCancel={() => setShowRecorder(false)}
        />
      )}

      {/* Color Profile Selector Modal */}
      <IdentityModal
        isOpen={isColorModalOpen}
        onClose={() => setIsColorModalOpen(false)}
        currentAvatar={avatar}
        onSave={updateAvatar}
      />

      {/* Admin Panel Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={isAdmin}
        onLoginSuccess={handleAdminLoginSuccess}
        onLogout={handleAdminLogout}
        activePeers={activePeers}
        myUserId={userId}
        messagesCount={messages.length}
        onClearAllMessages={clearAllMessages}
      />
    </div>
  );
}
