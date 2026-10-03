import React from 'react';
import { X, Check } from 'lucide-react';

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  onSave: (avatar: string) => void;
}

export const AVATAR_PALETTES = [
  { id: '0', name: 'Emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-500' },
  { id: '1', name: 'Cyan', bg: 'bg-cyan-500', ring: 'ring-cyan-500' },
  { id: '2', name: 'Violet', bg: 'bg-violet-500', ring: 'ring-violet-500' },
  { id: '3', name: 'Amber', bg: 'bg-amber-500', ring: 'ring-amber-500' },
  { id: '4', name: 'Rose', bg: 'bg-rose-500', ring: 'ring-rose-500' },
  { id: '5', name: 'Blue', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { id: '6', name: 'Indigo', bg: 'bg-indigo-500', ring: 'ring-indigo-500' },
  { id: '7', name: 'Teal', bg: 'bg-teal-500', ring: 'ring-teal-500' },
  { id: '8', name: 'Orange', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { id: '9', name: 'Pink', bg: 'bg-pink-500', ring: 'ring-pink-500' },
  { id: '10', name: 'Purple', bg: 'bg-purple-500', ring: 'ring-purple-500' },
  { id: '11', name: 'Sky', bg: 'bg-sky-500', ring: 'ring-sky-500' },
];

export const IdentityModal: React.FC<IdentityModalProps> = ({
  isOpen,
  onClose,
  currentAvatar,
  onSave,
}) => {
  if (!isOpen) return null;

  const handleSelectColor = (colorId: string) => {
    onSave(colorId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-xs bg-white border border-slate-200 rounded-2xl p-5 shadow-xl text-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <span className="text-sm font-bold text-slate-900">
            Pilih Warna Profil
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Color buttons grid */}
        <div className="grid grid-cols-4 gap-2.5 my-2">
          {AVATAR_PALETTES.map((item) => {
            const isSelected = currentAvatar === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => handleSelectColor(item.id)}
                className={`h-11 rounded-xl border border-slate-200 flex items-center justify-center transition-all cursor-pointer hover:scale-105 ${
                  isSelected ? `ring-2 ${item.ring} bg-slate-50` : 'hover:bg-slate-50'
                }`}
                title={item.name}
              >
                <div className={`w-6 h-6 rounded-full ${item.bg} flex items-center justify-center shadow-xs`}>
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
