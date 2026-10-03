import React, { useState } from 'react';
import { Shield, Lock, Trash2, Smartphone, Monitor, CheckCircle2, AlertCircle, X, LogOut, Info } from 'lucide-react';
import { PeerUser } from '../types';
import { getDeviceInfo } from '../utils/device';
import { AVATAR_PALETTES } from './IdentityModal';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onLoginSuccess: () => void;
  onLogout: () => void;
  activePeers: PeerUser[];
  myUserId: string;
  messagesCount: number;
  onClearAllMessages: () => void;
}

export function AdminModal({
  isOpen,
  onClose,
  isAdmin,
  onLoginSuccess,
  onLogout,
  activePeers,
  myUserId,
  messagesCount,
  onClearAllMessages,
}: AdminModalProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === 'Farabi24') {
      setErrorMessage('');
      setPasswordInput('');
      onLoginSuccess();
    } else {
      setErrorMessage('Kata sandi admin salah! Silakan coba lagi.');
    }
  };

  const myDevice = getDeviceInfo();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'
            }`}>
              {isAdmin ? <Shield className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                {isAdmin ? 'Panel Kontrol Admin' : 'Masuk Admin'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Otentikasi: Farabi' : 'Khusus pengelola obrolan'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!isAdmin ? (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password Admin
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Masukkan password..."
                  className="w-full px-4 py-3 bg-slate-100 rounded-xl text-slate-900 border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white text-sm transition-all"
                  autoFocus
                />
                {errorMessage && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-600 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white font-medium rounded-xl text-sm transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                <span>Masuk Mode Admin</span>
              </button>
            </form>
          ) : (
            /* Admin Panel Dashboard */
            <div className="space-y-5">
              {/* Status Banner */}
              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 space-y-1">
                  <p className="font-semibold text-amber-950">Mode Admin Aktif</p>
                  <p className="text-amber-800/90 leading-relaxed">
                    Kamu sekarang dapat <strong>menghapus chat orang lain</strong> langsung di ruang obrolan menggunakan tombol sampah merah <span className="text-rose-600 font-bold">🗑️</span> pada setiap balon pesan.
                  </p>
                </div>
              </div>

              {/* Online Devices Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-slate-500" />
                    <span>Perangkat yang Dipakai ({activePeers.length + 1})</span>
                  </h4>
                  <span className="text-[11px] font-mono text-emerald-600 font-medium">
                    Live
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Current Admin device */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        👑
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">Farabi (Kamu / Admin)</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md font-mono">
                            Owner
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                          {myDevice.isMobile ? <Smartphone className="w-3 h-3 text-slate-400" /> : <Monitor className="w-3 h-3 text-slate-400" />}
                          <span className="font-medium text-slate-700">{myDevice.device}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500">{myDevice.browser}</span>
                        </p>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>

                  {/* Other connected peers */}
                  {activePeers.length === 0 ? (
                    <div className="p-4 text-center rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
                      <p className="text-xs text-slate-400">
                        Belum ada pengguna lain yang online saat ini.
                      </p>
                    </div>
                  ) : (
                    activePeers.map((peer) => {
                      const palette = AVATAR_PALETTES.find(p => p.id === peer.avatar) || AVATAR_PALETTES[0];
                      const dev = peer.deviceInfo;
                      return (
                        <div
                          key={peer.userId}
                          className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-2xs hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full ${palette.bg} shadow-xs shrink-0 flex items-center justify-center text-white text-[10px] font-mono`} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-800">
                                  {peer.alias || 'Pengguna'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  #{peer.userId.slice(-4)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                                {dev?.isMobile ? (
                                  <Smartphone className="w-3 h-3 text-slate-400" />
                                ) : (
                                  <Monitor className="w-3 h-3 text-slate-400" />
                                )}
                                <span className="font-medium text-slate-700">
                                  {dev?.device || 'Perangkat Web'}
                                </span>
                                {dev?.browser && (
                                  <>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500">{dev.browser}</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Aktif
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Moderation Controls */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Tindakan Obrolan
                </h4>

                {!confirmClear ? (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="w-full py-2.5 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Semua Chat Ruangan ({messagesCount} pesan)</span>
                  </button>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                    <p className="text-xs text-rose-800 font-medium text-center">
                      Yakin ingin menghapus seluruh pesan di obrolan ini untuk semua orang?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onClearAllMessages();
                          setConfirmClear(false);
                        }}
                        className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium cursor-pointer"
                      >
                        Ya, Hapus Semua
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="flex-1 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={onLogout}
                  className="w-full py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar dari Mode Admin</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
