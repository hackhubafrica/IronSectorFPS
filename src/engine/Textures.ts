import * as THREE from 'three';

function createCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface ProceduralTextureSet {
  concrete: THREE.CanvasTexture;
  containerBlue: THREE.CanvasTexture;
  containerRust: THREE.CanvasTexture;
  containerOlive: THREE.CanvasTexture;
  sandbag: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  steel: THREE.CanvasTexture;
  hazard: THREE.CanvasTexture;
  groundIndustrial: THREE.CanvasTexture;
  groundDesert: THREE.CanvasTexture;
  dispose: () => void;
}

export function buildProceduralTextures(maxAnisotropy = 4): ProceduralTextureSet {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  const concrete = createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#62686e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const v = 82 + Math.floor(Math.random() * 38);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.strokeStyle = 'rgba(20,24,28,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
  }, 2, 1, aniso);

  const makeContainer = (base: string, dark: string, highlight: string) =>
    createCanvasTexture(256, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = dark;
        ctx.fillRect(x, 0, 5, s);
        ctx.fillStyle = highlight;
        ctx.fillRect(x + 5, 0, 2, s);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, s, 8);
      ctx.fillRect(0, s - 8, s, 8);
    }, 2, 1, aniso);

  const containerBlue = makeContainer('#264564', '#1a3149', '#355c82');
  const containerRust = makeContainer('#6c3826', '#4a2417', '#864a35');
  const containerOlive = makeContainer('#435238', '#2d3825', '#556748');

  const sandbag = createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#9b8765';
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row++) {
      const y = row * (s / 8);
      const offset = (row % 2) * 32;
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + offset;
        ctx.fillStyle = (row + col) % 2 === 0 ? '#a7926f' : '#8d7958';
        ctx.fillRect(x + 2, y + 2, 60, s / 8 - 4);
        ctx.strokeStyle = 'rgba(40,32,20,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, 60, s / 8 - 4);
      }
    }
  }, 2, 1, aniso);

  const wood = createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#735336';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? '#6a4b30' : '#7b593a';
      ctx.fillRect(0, y, s, 30);
      ctx.fillStyle = '#3c2817';
      ctx.fillRect(0, y + 30, s, 2);
    }
    ctx.strokeStyle = '#3c2817';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(s - 8, s - 8);
    ctx.stroke();
  }, 1, 1, aniso);

  const steel = createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#434c56';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let i = 0; i < s; i += 32) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(15,18,22,0.4)';
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }, 3, 3, aniso);

  const hazard = createCanvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#252b32';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#d99116';
    ctx.fillRect(8, 8, s - 16, 14);
    ctx.fillRect(8, s - 22, s - 16, 14);
    ctx.strokeStyle = '#d99116';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, s - 40, s - 40);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 110px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', s / 2, s / 2);
  }, 1, 1, aniso);

  const groundIndustrial = createCanvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#383f47';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      const v = 45 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.strokeStyle = 'rgba(20,24,28,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
  }, 32, 32, aniso);

  const groundDesert = createCanvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#9c835e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const r = 138 + Math.floor(Math.random() * 34);
      const g = 114 + Math.floor(Math.random() * 30);
      const b = 78 + Math.floor(Math.random() * 24);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 2);
    }
  }, 32, 32, aniso);

  return {
    concrete,
    containerBlue,
    containerRust,
    containerOlive,
    sandbag,
    wood,
    steel,
    hazard,
    groundIndustrial,
    groundDesert,
    dispose: () => {
      concrete.dispose();
      containerBlue.dispose();
      containerRust.dispose();
      containerOlive.dispose();
      sandbag.dispose();
      wood.dispose();
      steel.dispose();
      hazard.dispose();
      groundIndustrial.dispose();
      groundDesert.dispose();
    },
  };
}
