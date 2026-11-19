import { Crosshair, Flame, PackageOpen, Radar, RefreshCw, ShieldPlus, ArrowUp, ArrowDownUp } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { FpsEngine } from '../engine/FpsEngine.ts';
import type { HudState } from '../game/types.ts';
import { triggerHapticFeedback } from '../utils/haptics.ts';

interface TouchControlsProps {
  engine: FpsEngine;
  hud: HudState;
}

export function TouchControls({ engine, hud }: TouchControlsProps) {
  const movePointerId = useRef<number | null>(null);
  const moveOrigin = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const lookPointerId = useRef<number | null>(null);
  const lookPrev = useRef({ x: 0, y: 0 });

  const maxRadius = 46;

  const onMoveDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    movePointerId.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    moveOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateMoveKnob(e.clientX, e.clientY);
  };

  const updateMoveKnob = (cx: number, cy: number) => {
    const dx = cx - moveOrigin.current.x;
    const dy = cy - moveOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxRadius, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 0 ? Math.sin(angle) * clamped : 0;
    setKnob({ x: kx, y: ky });
    engine.setTouchMove(kx / maxRadius, -ky / maxRadius);
  };

  const onMoveMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (movePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateMoveKnob(e.clientX, e.clientY);
  };

  const onMoveUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (movePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    movePointerId.current = null;
    setKnob({ x: 0, y: 0 });
    engine.setTouchMove(0, 0);
  };

  const onLookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerId.current = e.pointerId;
    lookPrev.current = { x: e.clientX, y: e.clientY };
  };

  const onLookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lookPrev.current.x;
    const dy = e.clientY - lookPrev.current.y;
    lookPrev.current = { x: e.clientX, y: e.clientY };
    engine.addTouchLook(dx, dy);
  };

  const onLookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== e.pointerId) return;
    lookPointerId.current = null;
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none touch-none">
      {/* Right-half look drag surface */}
      <div
        className="absolute right-0 top-14 bottom-0 w-1/2 pointer-events-auto touch-none"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* Left virtual thumbstick */}
      <div
        className="absolute left-6 bottom-8 w-32 h-32 rounded-full bg-[#141920]/70 border-2 border-slate-400/35 pointer-events-auto flex items-center justify-center touch-none"
        onPointerDown={onMoveDown}
        onPointerMove={onMoveMove}
        onPointerUp={onMoveUp}
        onPointerCancel={onMoveUp}
      >
        <div
          className="w-12 h-12 rounded-full bg-amber-500/80 border border-amber-200/70 shadow-lg"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      {/* Left quick utility buttons */}
      <div className="absolute left-40 bottom-8 flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
            engine.useArmorPlate();
          }}
          className="w-12 h-12 rounded-full bg-[#141920]/85 border border-sky-400/50 text-sky-300 flex flex-col items-center justify-center active:scale-95"
        >
          <ShieldPlus className="w-4 h-4" />
          <span className="text-[10px] font-mono-tabular">{hud.player.armorPlates}</span>
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
            engine.throwGrenade();
          }}
          className="w-12 h-12 rounded-full bg-[#141920]/85 border border-amber-400/50 text-amber-300 flex flex-col items-center justify-center active:scale-95"
        >
          <Flame className="w-4 h-4" />
          <span className="text-[10px] font-mono-tabular">{hud.player.grenades}</span>
        </button>
      </div>

      {/* Context interact button when near crate / exfil */}
      {hud.interactPrompt && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
            engine.setInteractHeld(true);
          }}
          onPointerUp={(e) => { e.stopPropagation(); engine.setInteractHeld(false); }}
          onPointerCancel={() => engine.setInteractHeld(false)}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 px-5 py-3 bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded border border-amber-200 pointer-events-auto flex items-center gap-2 shadow-xl"
        >
          <PackageOpen className="w-4 h-4" />
          Hold to Interact
        </button>
      )}

      {/* Right combat buttons */}
      <div className="absolute right-5 bottom-6 flex items-end gap-3 pointer-events-auto">
        <div className="flex flex-col gap-2.5 items-end">
          {hud.player.streakKills >= 3 && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                engine.activateUav();
              }}
              className="w-12 h-12 rounded-full bg-emerald-600/90 border border-emerald-200 text-white flex items-center justify-center active:scale-95"
            >
              <Radar className="w-5 h-5" />
            </button>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                engine.swapWeapon();
              }}
              className="w-12 h-12 rounded-full bg-[#141920]/85 border border-slate-500/50 text-slate-200 flex items-center justify-center active:scale-95"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                engine.toggleCrouch();
              }}
              className={`w-12 h-12 rounded-full border flex items-center justify-center text-[11px] font-bold uppercase active:scale-95 ${
                hud.player.stance === 'crouch' || hud.player.stance === 'slide'
                  ? 'bg-amber-500 text-slate-950 border-amber-200'
                  : 'bg-[#141920]/85 text-slate-200 border-slate-500/50'
              }`}
            >
              {hud.player.stance === 'slide' ? 'SLD' : 'CRH'}
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                engine.triggerJump();
              }}
              className="w-12 h-12 rounded-full bg-[#141920]/85 border border-slate-500/50 text-slate-200 flex items-center justify-center active:scale-95"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-3 items-center">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('reload', { enabled: hud.hapticsEnabled });
                engine.triggerReload();
              }}
              className="w-13 h-13 rounded-full bg-[#141920]/85 border border-slate-400/60 text-slate-100 flex items-center justify-center active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
                engine.setTouchAds(!hud.player.ads);
              }}
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-xs font-bold uppercase active:scale-95 ${
                hud.player.ads
                  ? 'bg-sky-500 text-slate-950 border-sky-200'
                  : 'bg-[#141920]/85 text-sky-300 border-sky-400/60'
              }`}
            >
              ADS
            </button>
          </div>
        </div>

        {/* Dedicated large FIRE trigger */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            triggerHapticFeedback('ui', { enabled: hud.hapticsEnabled });
            engine.setTouchFire(true);
          }}
          onPointerUp={(e) => { e.stopPropagation(); engine.setTouchFire(false); }}
          onPointerCancel={() => engine.setTouchFire(false)}
          className="w-20 h-20 rounded-full bg-amber-500/90 active:bg-amber-400 border-2 border-amber-200 text-slate-950 flex flex-col items-center justify-center shadow-2xl active:scale-95"
        >
          <Crosshair className="w-7 h-7" />
          <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5">FIRE</span>
        </button>
      </div>
    </div>
  );
}
