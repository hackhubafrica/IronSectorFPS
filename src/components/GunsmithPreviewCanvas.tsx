import { Crosshair, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from '../engine/AudioEngine.ts';
import { buildTacticalWeaponMesh, type BuiltWeaponMesh } from '../engine/WeaponMeshBuilder.ts';
import type { ComputedWeaponStats } from '../game/types.ts';

interface GunsmithPreviewCanvasProps {
  stats: ComputedWeaponStats;
}

type CameraPreset = 'showcase' | 'profile' | 'optic' | 'muzzle';

const PRESET_VIEWS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  showcase: { pos: [0.52, 0.22, 0.56], target: [-0.04, 0.02, 0] },
  profile: { pos: [0.76, 0.05, 0.02], target: [0, 0.02, -0.04] },
  optic: { pos: [0.24, 0.16, 0.22], target: [0, 0.08, 0.02] },
  muzzle: { pos: [0.36, 0.1, -0.58], target: [0, 0.015, -0.34] },
};

const _scratchTargetPos = new THREE.Vector3();
const _scratchTargetLook = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createBenchGridTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d1218';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = Math.min(8, Math.max(1, anisotropy));
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function GunsmithPreviewCanvas({ stats }: GunsmithPreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('showcase');
  const [autoRotate, setAutoRotate] = useState(false);

  const apiRef = useRef<{
    rebuild: (nextStats: ComputedWeaponStats) => void;
    setPreset: (p: CameraPreset) => void;
    setAutoRotate: (enabled: boolean) => void;
    triggerTestFire: (nextStats: ComputedWeaponStats) => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 290);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f15);
    scene.fog = new THREE.Fog(0x0b0f15, 2.2, 6.5);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      36,
      (container.clientWidth || 640) / (container.clientHeight || 290),
      0.03,
      20
    );
    camera.position.set(...PRESET_VIEWS.showcase.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 0.28;
    controls.maxDistance = 1.45;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = Math.PI * 0.14;
    controls.target.set(...PRESET_VIEWS.showcase.target);
    controls.autoRotateSpeed = 1.4;
    controls.update();

    // Three-point warm/cool studio rig
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e1b18, 0.7);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    keyLight.position.set(1.4, 2.2, 1.3);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -0.9;
    keyLight.shadow.camera.right = 0.9;
    keyLight.shadow.camera.top = 0.9;
    keyLight.shadow.camera.bottom = -0.9;
    keyLight.shadow.camera.near = 0.3;
    keyLight.shadow.camera.far = 5;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.015;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
    rimLight.position.set(-1.5, 1.1, -1.4);
    scene.add(rimLight);

    const warmFill = new THREE.PointLight(0xf59e0b, 0.55, 3.2);
    warmFill.position.set(0.6, 0.35, -0.6);
    scene.add(warmFill);

    // Armory workbench surface + contact shadow + weapon vice cradle
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const benchTex = createBenchGridTexture(maxAniso);
    const benchGeo = new THREE.PlaneGeometry(4.2, 4.2);
    const benchMat = new THREE.MeshStandardMaterial({
      map: benchTex,
      roughness: 0.72,
      metalness: 0.24,
    });
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.rotation.x = -Math.PI / 2;
    bench.position.y = -0.18;
    bench.receiveShadow = !isSoftwareGl;
    scene.add(bench);

    const shadowTex = createContactShadowTexture();
    const contactGeo = new THREE.PlaneGeometry(1.15, 0.52);
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const contactPlane = new THREE.Mesh(contactGeo, contactMat);
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.set(0, -0.178, -0.04);
    scene.add(contactPlane);

    const cradleMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.62, metalness: 0.45 });
    const cradleBaseGeo = new THREE.BoxGeometry(0.09, 0.02, 0.42);
    const cradleBase = new THREE.Mesh(cradleBaseGeo, cradleMat);
    cradleBase.position.set(0, -0.17, -0.03);
    cradleBase.receiveShadow = !isSoftwareGl;
    scene.add(cradleBase);

    const cradlePostGeo = new THREE.BoxGeometry(0.036, 0.095, 0.026);
    const rearPost = new THREE.Mesh(cradlePostGeo, cradleMat);
    rearPost.position.set(0, -0.115, 0.13);
    scene.add(rearPost);
    const frontPost = new THREE.Mesh(cradlePostGeo, cradleMat);
    frontPost.position.set(0, -0.115, -0.18);
    scene.add(frontPost);

    // Weapon mount pivot
    const mountPivot = new THREE.Group();
    mountPivot.position.set(0, 0.01, 0);
    scene.add(mountPivot);

    const flashGeo = new THREE.SphereGeometry(0.042, 10, 10);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.92 });
    const muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.visible = false;
    mountPivot.add(muzzleFlash);

    const laserGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 1.4, 6);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 });
    const laserBeam = new THREE.Mesh(laserGeo, laserMat);
    laserBeam.visible = false;
    mountPivot.add(laserBeam);

    let currentBuilt: BuiltWeaponMesh | null = null;
    let boltBaseZ = -0.01;
    let boltTravel = 0;
    let recoilKick = 0;
    let muzzleTimer = 0;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTime = performance.now();

    let transitionActive = false;
    let activePresetTarget: CameraPreset = 'showcase';
    let autoSpinEnabled = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        let needsMoreFrames = false;

        if (transitionActive) {
          const targetView = PRESET_VIEWS[activePresetTarget];
          _scratchTargetPos.set(...targetView.pos);
          _scratchTargetLook.set(...targetView.target);
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _scratchTargetPos.x, 8, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _scratchTargetPos.y, 8, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _scratchTargetPos.z, 8, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, _scratchTargetLook.x, 8, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _scratchTargetLook.y, 8, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _scratchTargetLook.z, 8, dt);
          if (
            camera.position.distanceTo(_scratchTargetPos) < 0.003 &&
            controls.target.distanceTo(_scratchTargetLook) < 0.003
          ) {
            transitionActive = false;
          } else {
            needsMoreFrames = true;
          }
        }

        if (boltTravel > 0.0005 || recoilKick > 0.0005 || muzzleTimer > 0) {
          boltTravel = THREE.MathUtils.damp(boltTravel, 0, 18, dt);
          recoilKick = THREE.MathUtils.damp(recoilKick, 0, 14, dt);
          if (currentBuilt) {
            currentBuilt.boltCarrier.position.z = boltBaseZ + boltTravel;
          }
          mountPivot.position.z = recoilKick;
          mountPivot.rotation.x = recoilKick * 1.45;
          if (muzzleTimer > 0) {
            muzzleTimer = Math.max(0, muzzleTimer - dt);
            if (muzzleTimer <= 0) muzzleFlash.visible = false;
          }
          if (boltTravel > 0.0005 || recoilKick > 0.0005 || muzzleTimer > 0) {
            needsMoreFrames = true;
          } else {
            mountPivot.position.z = 0;
            mountPivot.rotation.x = 0;
            if (currentBuilt) currentBuilt.boltCarrier.position.z = boltBaseZ;
          }
        }

        if (autoSpinEnabled) {
          needsMoreFrames = true;
        }

        controls.update();
        renderDirty = false;
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || needsMoreFrames)) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const rebuild = (nextStats: ComputedWeaponStats) => {
      if (currentBuilt) {
        mountPivot.remove(currentBuilt.group);
        currentBuilt.dispose();
        currentBuilt = null;
      }
      const built = buildTacticalWeaponMesh(nextStats, {
        includeHands: false,
        castShadows: !isSoftwareGl,
        maxAnisotropy: maxAniso,
      });
      currentBuilt = built;
      boltBaseZ = built.boltCarrier.position.z;
      mountPivot.add(built.group);

      muzzleFlash.position.copy(built.muzzleLocalPos);
      laserBeam.visible = nextStats.hasLaser;
      (laserBeam.material as THREE.MeshBasicMaterial).color.setHex(
        nextStats.underbarrel === 'angled_carbon' ? 0x10b981 : 0x38bdf8
      );
      laserBeam.position.set(built.laserLocalPos.x, built.laserLocalPos.y, built.laserLocalPos.z - 0.7);
      requestRender();
    };

    controls.addEventListener('start', () => {
      transitionActive = false;
    });
    controls.addEventListener('change', requestRender);

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 290;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    apiRef.current = {
      rebuild,
      setPreset: (p: CameraPreset) => {
        activePresetTarget = p;
        transitionActive = true;
        lastTime = performance.now();
        requestRender();
      },
      setAutoRotate: (enabled: boolean) => {
        autoSpinEnabled = enabled && !isSoftwareGl;
        controls.autoRotate = autoSpinEnabled;
        if (autoSpinEnabled) requestRender();
      },
      triggerTestFire: (nextStats: ComputedWeaponStats) => {
        boltTravel = 0.045;
        recoilKick = 0.032;
        if (!nextStats.suppressed) {
          muzzleTimer = 0.055;
          muzzleFlash.visible = true;
          muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.35);
        }
        AudioEngine.playGunshot(nextStats.id, nextStats.suppressed, 0);
        lastTime = performance.now();
        requestRender();
      },
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    rebuild(stats);

    return () => {
      disposed = true;
      apiRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      if (currentBuilt) currentBuilt.dispose();
      benchGeo.dispose();
      benchMat.dispose();
      benchTex.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      shadowTex.dispose();
      cradleBaseGeo.dispose();
      cradlePostGeo.dispose();
      cradleMat.dispose();
      flashGeo.dispose();
      flashMat.dispose();
      laserGeo.dispose();
      laserMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild(stats);
  }, [stats]);

  const handlePreset = (p: CameraPreset) => {
    setPreset(p);
    apiRef.current?.setPreset(p);
  };

  const toggleRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    apiRef.current?.setAutoRotate(next);
  };

  return (
    <div className="relative w-full h-[270px] sm:h-[310px] bg-[#0b0f15] border border-[#252D38] overflow-hidden select-none">
      {/* Dedicated empty Three.js canvas mount */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Minimal Top-Left Bench Spec Stamp */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-amber-400">
          3D Armory Inspection Bench · Drag Orbit / Scroll Zoom
        </div>
        <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-200 mt-0.5">
          {stats.name} · {stats.optic.replace('_', ' ').toUpperCase()}
        </div>
      </div>

      {/* Bottom Consolidated Control Dock (Zero Center Occlusion) */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 max-w-[96%] flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[#0B0E11]/90 border border-[#2C3542]">
        {(
          [
            { id: 'showcase', label: '3/4 View' },
            { id: 'profile', label: 'Side' },
            { id: 'optic', label: 'Optic' },
            { id: 'muzzle', label: 'Muzzle' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handlePreset(item.id)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
              preset === item.id
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#141920] text-slate-300 border-[#28313E] hover:border-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}

        <div className="h-4 w-px bg-[#2C3542] mx-0.5" />

        <button
          type="button"
          onClick={() => apiRef.current?.triggerTestFire(stats)}
          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/60 flex items-center gap-1"
        >
          <Crosshair className="w-3 h-3" />
          Test Fire
        </button>

        <button
          type="button"
          onClick={toggleRotate}
          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
            autoRotate
              ? 'bg-sky-500/20 text-sky-300 border-sky-400/60'
              : 'bg-[#141920] text-slate-300 border-[#28313E] hover:border-slate-500'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          Orbit
        </button>

        <button
          type="button"
          onClick={() => handlePreset('showcase')}
          className="p-1 text-slate-400 hover:text-slate-100 bg-[#141920] border border-[#28313E]"
          title="Reset Bench Camera"
          aria-label="Reset Bench Camera"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
