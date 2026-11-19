import { Download, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export function PWAInstallButton() {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [showTip, setShowTip] = useState(false);

  if (isInstalled) {
    return (
      <span className="hidden md:inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 whitespace-nowrap shrink-0">
        App Installed
      </span>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (canInstall) void promptInstall();
          else setShowTip((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-200 bg-[#1B222C] hover:bg-[#252E3B] border border-[#2C3542] transition-colors whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        Install App
      </button>
      {showTip && !canInstall && (
        <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#141920] border border-[#2C3542] text-xs text-slate-300 shadow-2xl z-50">
          Use your browser menu (<span className="text-amber-400 font-semibold">Install Iron Sector</span> or <span className="text-amber-400 font-semibold">Add to Home Screen</span>) to install natively on Linux, Windows, or Android.
        </div>
      )}
    </div>
  );
}

export function OfflineIndicator() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-[#141920] border border-amber-500/60 text-xs font-medium text-amber-300 shadow-xl">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline Mode Ready · Local AI Bots Active</span>
    </div>
  );
}
