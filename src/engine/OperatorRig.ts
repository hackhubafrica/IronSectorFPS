import * as THREE from 'three';
import type { CombatantSnapshot, GameMode, TeamId, WeaponId } from '../game/types.ts';

interface SharedRigAssets {
  contactShadowTex: THREE.CanvasTexture;
  shadowPlaneGeo: THREE.PlaneGeometry;
  pelvisGeo: THREE.BoxGeometry;
  beltGeo: THREE.BoxGeometry;
  holsterGeo: THREE.BoxGeometry;
  thighGeo: THREE.CapsuleGeometry;
  kneePadGeo: THREE.BoxGeometry;
  shinGeo: THREE.CapsuleGeometry;
  bootGeo: THREE.BoxGeometry;
  torsoGeo: THREE.CapsuleGeometry;
  vestGeo: THREE.BoxGeometry;
  pouchGeo: THREE.BoxGeometry;
  packGeo: THREE.BoxGeometry;
  antennaGeo: THREE.CylinderGeometry;
  neckGeo: THREE.CylinderGeometry;
  headGeo: THREE.SphereGeometry;
  helmetGeo: THREE.SphereGeometry;
  helmetRimGeo: THREE.CylinderGeometry;
  visorGeo: THREE.BoxGeometry;
  nvgMountGeo: THREE.BoxGeometry;
  nvgTubeGeo: THREE.CylinderGeometry;
  pauldronGeo: THREE.SphereGeometry;
  upperArmGeo: THREE.CapsuleGeometry;
  forearmGeo: THREE.CapsuleGeometry;
  gloveGeo: THREE.BoxGeometry;
  tagGeo: THREE.BoxGeometry;
  rifleReceiverGeo: THREE.BoxGeometry;
  rifleBarrelGeo: THREE.CylinderGeometry;
  rifleHandguardGeo: THREE.BoxGeometry;
  rifleMagGeo: THREE.BoxGeometry;
  rifleStockGeo: THREE.BoxGeometry;
  rifleOpticGeo: THREE.BoxGeometry;
  pistolSlideGeo: THREE.BoxGeometry;
  pistolGripGeo: THREE.BoxGeometry;
}

let cachedAssets: SharedRigAssets | null = null;

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSharedAssets(): SharedRigAssets {
  if (cachedAssets) return cachedAssets;

  const shadowPlaneGeo = new THREE.PlaneGeometry(1.15, 1.15);
  shadowPlaneGeo.rotateX(-Math.PI / 2);

  const helmetGeo = new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const pauldronGeo = new THREE.SphereGeometry(0.095, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);

  cachedAssets = {
    contactShadowTex: createContactShadowTexture(),
    shadowPlaneGeo,
    pelvisGeo: new THREE.BoxGeometry(0.36, 0.16, 0.22),
    beltGeo: new THREE.BoxGeometry(0.39, 0.065, 0.245),
    holsterGeo: new THREE.BoxGeometry(0.07, 0.16, 0.11),
    thighGeo: new THREE.CapsuleGeometry(0.088, 0.26, 6, 10),
    kneePadGeo: new THREE.BoxGeometry(0.125, 0.11, 0.075),
    shinGeo: new THREE.CapsuleGeometry(0.072, 0.27, 6, 10),
    bootGeo: new THREE.BoxGeometry(0.125, 0.11, 0.23),
    torsoGeo: new THREE.CapsuleGeometry(0.19, 0.28, 6, 12),
    vestGeo: new THREE.BoxGeometry(0.41, 0.42, 0.28),
    pouchGeo: new THREE.BoxGeometry(0.085, 0.14, 0.055),
    packGeo: new THREE.BoxGeometry(0.28, 0.34, 0.14),
    antennaGeo: new THREE.CylinderGeometry(0.008, 0.011, 0.28, 6),
    neckGeo: new THREE.CylinderGeometry(0.068, 0.078, 0.12, 8),
    headGeo: new THREE.SphereGeometry(0.138, 14, 12),
    helmetGeo,
    helmetRimGeo: new THREE.CylinderGeometry(0.167, 0.172, 0.035, 14, 1, true),
    visorGeo: new THREE.BoxGeometry(0.23, 0.068, 0.12),
    nvgMountGeo: new THREE.BoxGeometry(0.065, 0.055, 0.05),
    nvgTubeGeo: new THREE.CylinderGeometry(0.02, 0.022, 0.09, 8),
    pauldronGeo,
    upperArmGeo: new THREE.CapsuleGeometry(0.066, 0.18, 6, 8),
    forearmGeo: new THREE.CapsuleGeometry(0.056, 0.17, 6, 8),
    gloveGeo: new THREE.BoxGeometry(0.075, 0.085, 0.085),
    tagGeo: new THREE.BoxGeometry(0.32, 0.045, 0.045),
    rifleReceiverGeo: new THREE.BoxGeometry(0.062, 0.085, 0.34),
    rifleBarrelGeo: new THREE.CylinderGeometry(0.013, 0.015, 0.36, 8),
    rifleHandguardGeo: new THREE.BoxGeometry(0.054, 0.068, 0.26),
    rifleMagGeo: new THREE.BoxGeometry(0.038, 0.16, 0.065),
    rifleStockGeo: new THREE.BoxGeometry(0.046, 0.11, 0.2),
    rifleOpticGeo: new THREE.BoxGeometry(0.042, 0.046, 0.14),
    pistolSlideGeo: new THREE.BoxGeometry(0.036, 0.046, 0.22),
    pistolGripGeo: new THREE.BoxGeometry(0.032, 0.11, 0.052),
  };
  return cachedAssets;
}

export class OperatorRig {
  public readonly root = new THREE.Group();
  public readonly hitMeshes: THREE.Object3D[] = [];

  private readonly actorPivot = new THREE.Group();
  private readonly contactShadow: THREE.Mesh;
  private readonly pelvisPivot = new THREE.Group();
  private readonly torsoPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly leftHipPivot = new THREE.Group();
  private readonly leftKneePivot = new THREE.Group();
  private readonly rightHipPivot = new THREE.Group();
  private readonly rightKneePivot = new THREE.Group();
  private readonly leftShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();
  private readonly weaponGroup = new THREE.Group();
  private readonly barrelMesh: THREE.Mesh;
  private readonly handguardMesh: THREE.Mesh;
  private readonly magMesh: THREE.Mesh;
  private readonly stockMesh: THREE.Mesh;
  private readonly opticMesh: THREE.Mesh;
  private readonly tagMesh: THREE.Mesh;

  private readonly uniformMat: THREE.MeshStandardMaterial;
  private readonly rigMat: THREE.MeshStandardMaterial;
  private readonly armorMat: THREE.MeshStandardMaterial;
  private readonly visorMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly weaponMat: THREE.MeshStandardMaterial;
  private readonly tagMat: THREE.MeshBasicMaterial;
  private readonly shadowMat: THREE.MeshBasicMaterial;

  private initialized = false;
  private smoothX = 0;
  private smoothY = 0;
  private smoothZ = 0;
  private smoothYaw = 0;
  private smoothPitch = 0;
  private walkPhase = Math.random() * Math.PI * 2;
  private hitFlashTimer = 0;
  private recoilKick = 0;
  private prevAlive = true;
  private deathProgress = 0;
  private deathTimer = 0;
  private deathRollSign = Math.random() > 0.5 ? 1 : -1;
  private currentWeaponId: WeaponId = 'm4a1';

  constructor(combatantId: string) {
    const a = getSharedAssets();

    // Varied roughness/metalness PBR materials per surface class
    this.uniformMat = new THREE.MeshStandardMaterial({
      color: 0x3b4954,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.rigMat = new THREE.MeshStandardMaterial({
      color: 0x262c33,
      roughness: 0.58,
      metalness: 0.14,
    });
    this.armorMat = new THREE.MeshStandardMaterial({
      color: 0x1e242b,
      roughness: 0.34,
      metalness: 0.38,
    });
    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.52,
    });
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xb98f70,
      roughness: 0.72,
      metalness: 0.02,
    });
    this.weaponMat = new THREE.MeshStandardMaterial({
      color: 0x161a1f,
      roughness: 0.28,
      metalness: 0.82,
    });
    this.tagMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: a.contactShadowTex,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    // Grounded contact shadow decal
    this.contactShadow = new THREE.Mesh(a.shadowPlaneGeo, this.shadowMat);
    this.contactShadow.position.set(0, 0.025, 0);
    this.root.add(this.contactShadow);

    // Bottom-center pivot at y = 0
    this.root.add(this.actorPivot);

    // Pelvis at hip height (0.88m)
    this.pelvisPivot.position.set(0, 0.88, 0);
    this.actorPivot.add(this.pelvisPivot);

    const pelvisMesh = new THREE.Mesh(a.pelvisGeo, this.uniformMat);
    pelvisMesh.castShadow = true;
    this.pelvisPivot.add(pelvisMesh);

    const beltMesh = new THREE.Mesh(a.beltGeo, this.rigMat);
    beltMesh.position.set(0, 0.055, 0);
    this.pelvisPivot.add(beltMesh);

    const holsterMesh = new THREE.Mesh(a.holsterGeo, this.armorMat);
    holsterMesh.position.set(0.2, -0.11, 0.02);
    this.pelvisPivot.add(holsterMesh);

    // Legs (Hip -> Thigh -> Knee -> Shin -> Boot)
    const buildLeg = (hipPivot: THREE.Group, kneePivot: THREE.Group, sideSign: number) => {
      hipPivot.position.set(sideSign * 0.125, -0.04, 0);
      this.pelvisPivot.add(hipPivot);

      const thigh = new THREE.Mesh(a.thighGeo, this.uniformMat);
      thigh.position.set(0, -0.2, 0);
      thigh.castShadow = true;
      hipPivot.add(thigh);

      kneePivot.position.set(0, -0.41, 0);
      hipPivot.add(kneePivot);

      const kneePad = new THREE.Mesh(a.kneePadGeo, this.armorMat);
      kneePad.position.set(0, 0.0, -0.068);
      kneePivot.add(kneePad);

      const shin = new THREE.Mesh(a.shinGeo, this.uniformMat);
      shin.position.set(0, -0.19, 0);
      shin.castShadow = true;
      kneePivot.add(shin);

      const boot = new THREE.Mesh(a.bootGeo, this.armorMat);
      boot.position.set(0, -0.375, -0.045);
      boot.castShadow = true;
      kneePivot.add(boot);

      return [thigh, shin, boot];
    };

    const leftLegParts = buildLeg(this.leftHipPivot, this.leftKneePivot, -1);
    const rightLegParts = buildLeg(this.rightHipPivot, this.rightKneePivot, 1);

    // Torso (Pelvis -> Spine/Chest -> Plate Carrier -> Pouches -> Comms Pack)
    this.torsoPivot.position.set(0, 0.08, 0);
    this.pelvisPivot.add(this.torsoPivot);

    const torsoMesh = new THREE.Mesh(a.torsoGeo, this.uniformMat);
    torsoMesh.position.set(0, 0.24, 0);
    torsoMesh.scale.set(1.06, 1, 0.72);
    torsoMesh.castShadow = true;
    this.torsoPivot.add(torsoMesh);

    const plateVest = new THREE.Mesh(a.vestGeo, this.rigMat);
    plateVest.position.set(0, 0.27, 0);
    plateVest.castShadow = true;
    this.torsoPivot.add(plateVest);

    for (let i = -1; i <= 1; i++) {
      const pouch = new THREE.Mesh(a.pouchGeo, this.armorMat);
      pouch.position.set(i * 0.105, 0.18, -0.155);
      this.torsoPivot.add(pouch);
    }

    const pack = new THREE.Mesh(a.packGeo, this.rigMat);
    pack.position.set(0, 0.28, 0.19);
    pack.castShadow = true;
    this.torsoPivot.add(pack);

    const antenna = new THREE.Mesh(a.antennaGeo, this.weaponMat);
    antenna.position.set(-0.11, 0.54, 0.18);
    this.torsoPivot.add(antenna);

    // Head + Helmet + NVG + Ballistic Visor
    this.headPivot.position.set(0, 0.53, 0);
    this.torsoPivot.add(this.headPivot);

    const neck = new THREE.Mesh(a.neckGeo, this.skinMat);
    neck.position.set(0, 0.03, 0);
    this.headPivot.add(neck);

    const headMesh = new THREE.Mesh(a.headGeo, this.skinMat);
    headMesh.position.set(0, 0.16, 0);
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    const helmet = new THREE.Mesh(a.helmetGeo, this.armorMat);
    helmet.position.set(0, 0.185, 0.01);
    helmet.castShadow = true;
    this.headPivot.add(helmet);

    const helmetRim = new THREE.Mesh(a.helmetRimGeo, this.rigMat);
    helmetRim.position.set(0, 0.18, 0.01);
    this.headPivot.add(helmetRim);

    const visor = new THREE.Mesh(a.visorGeo, this.visorMat);
    visor.position.set(0, 0.165, -0.095);
    this.headPivot.add(visor);

    const nvgMount = new THREE.Mesh(a.nvgMountGeo, this.weaponMat);
    nvgMount.position.set(0, 0.26, -0.155);
    this.headPivot.add(nvgMount);

    for (const side of [-0.038, 0.038]) {
      const tube = new THREE.Mesh(a.nvgTubeGeo, this.weaponMat);
      tube.rotation.x = Math.PI * 0.5;
      tube.position.set(side, 0.265, -0.2);
      this.headPivot.add(tube);
    }

    // IFF / UAV Status Bar above helmet
    this.tagMesh = new THREE.Mesh(a.tagGeo, this.tagMat);
    this.tagMesh.position.set(0, 0.44, 0);
    this.headPivot.add(this.tagMesh);

    // Articulated Arms
    const buildArm = (shoulderPivot: THREE.Group, elbowPivot: THREE.Group, sideSign: number) => {
      shoulderPivot.position.set(sideSign * 0.255, 0.44, 0);
      this.torsoPivot.add(shoulderPivot);

      const pauldron = new THREE.Mesh(a.pauldronGeo, this.armorMat);
      pauldron.position.set(sideSign * 0.015, 0.01, 0);
      shoulderPivot.add(pauldron);

      const upperArm = new THREE.Mesh(a.upperArmGeo, this.uniformMat);
      upperArm.position.set(0, -0.13, 0);
      upperArm.castShadow = true;
      shoulderPivot.add(upperArm);

      elbowPivot.position.set(0, -0.26, 0);
      shoulderPivot.add(elbowPivot);

      const forearm = new THREE.Mesh(a.forearmGeo, this.uniformMat);
      forearm.position.set(0, -0.12, 0);
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      const glove = new THREE.Mesh(a.gloveGeo, this.rigMat);
      glove.position.set(0, -0.24, 0);
      elbowPivot.add(glove);

      return [upperArm, forearm];
    };

    const leftArmParts = buildArm(this.leftShoulderPivot, this.leftElbowPivot, -1);
    const rightArmParts = buildArm(this.rightShoulderPivot, this.rightElbowPivot, 1);

    // Default two-handed tactical rifle hold pose
    this.rightShoulderPivot.rotation.set(0.95, 0.06, -0.08);
    this.rightElbowPivot.rotation.set(0.55, 0, 0.14);
    this.leftShoulderPivot.rotation.set(1.05, -0.35, 0.18);
    this.leftElbowPivot.rotation.set(0.62, 0.18, -0.25);

    // Composite 3D weapon attached to torso/right hand reference
    this.weaponGroup.position.set(0.14, 0.34, -0.33);
    this.torsoPivot.add(this.weaponGroup);

    const receiver = new THREE.Mesh(a.rifleReceiverGeo, this.weaponMat);
    this.weaponGroup.add(receiver);

    this.barrelMesh = new THREE.Mesh(a.rifleBarrelGeo, this.weaponMat);
    this.barrelMesh.rotation.x = Math.PI / 2;
    this.barrelMesh.position.set(0, 0.014, -0.34);
    this.weaponGroup.add(this.barrelMesh);

    this.handguardMesh = new THREE.Mesh(a.rifleHandguardGeo, this.armorMat);
    this.handguardMesh.position.set(0, 0.005, -0.26);
    this.weaponGroup.add(this.handguardMesh);

    this.magMesh = new THREE.Mesh(a.rifleMagGeo, this.armorMat);
    this.magMesh.position.set(0, -0.1, -0.05);
    this.magMesh.rotation.x = 0.18;
    this.weaponGroup.add(this.magMesh);

    this.stockMesh = new THREE.Mesh(a.rifleStockGeo, this.rigMat);
    this.stockMesh.position.set(0, -0.015, 0.25);
    this.weaponGroup.add(this.stockMesh);

    this.opticMesh = new THREE.Mesh(a.rifleOpticGeo, this.weaponMat);
    this.opticMesh.position.set(0, 0.068, -0.02);
    this.weaponGroup.add(this.opticMesh);

    // Register Raycast Hitboxes cleanly
    const tagHitbox = (obj: THREE.Object3D, hitbox: 'head' | 'body') => {
      obj.userData = { combatantId, hitbox };
      this.hitMeshes.push(obj);
    };

    tagHitbox(headMesh, 'head');
    tagHitbox(helmet, 'head');
    tagHitbox(visor, 'head');

    tagHitbox(pelvisMesh, 'body');
    tagHitbox(torsoMesh, 'body');
    tagHitbox(plateVest, 'body');
    tagHitbox(pack, 'body');
    for (const p of leftLegParts) tagHitbox(p, 'body');
    for (const p of rightLegParts) tagHitbox(p, 'body');
    for (const p of leftArmParts) tagHitbox(p, 'body');
    for (const p of rightArmParts) tagHitbox(p, 'body');
  }

  public flashHit(): void {
    this.hitFlashTimer = 0.12;
    this.uniformMat.emissive.setHex(0x991b1b);
    this.rigMat.emissive.setHex(0x450a0a);
  }

  public triggerFireKick(): void {
    this.recoilKick = 1.0;
  }

  private applyWeaponSilhouette(weaponId: WeaponId): void {
    if (this.currentWeaponId === weaponId) return;
    this.currentWeaponId = weaponId;
    if (weaponId === 'msr7') {
      this.barrelMesh.scale.set(1.0, 1.45, 1.0);
      this.barrelMesh.position.z = -0.44;
      this.stockMesh.visible = true;
      this.handguardMesh.visible = true;
      this.opticMesh.scale.set(1.15, 1.15, 1.55);
      this.magMesh.scale.set(1.0, 0.78, 1.1);
    } else if (weaponId === 'vector9') {
      this.barrelMesh.scale.set(0.9, 0.55, 0.9);
      this.barrelMesh.position.z = -0.22;
      this.stockMesh.visible = true;
      this.handguardMesh.visible = true;
      this.opticMesh.scale.set(0.85, 0.85, 0.65);
      this.magMesh.scale.set(0.9, 1.25, 0.8);
    } else if (weaponId === 'p220') {
      this.barrelMesh.scale.set(0.8, 0.38, 0.8);
      this.barrelMesh.position.z = -0.18;
      this.stockMesh.visible = false;
      this.handguardMesh.visible = false;
      this.opticMesh.scale.set(0.65, 0.65, 0.45);
      this.magMesh.scale.set(0.8, 0.7, 0.7);
    } else {
      this.barrelMesh.scale.set(1, 1, 1);
      this.barrelMesh.position.z = -0.34;
      this.stockMesh.visible = true;
      this.handguardMesh.visible = true;
      this.opticMesh.scale.set(1, 1, 1);
      this.magMesh.scale.set(1, 1, 1);
    }
  }

  public updateFromSnapshot(
    snap: CombatantSnapshot,
    localTeam: TeamId,
    mode: GameMode,
    dt: number
  ): void {
    this.applyWeaponSilhouette(snap.weaponId);

    const isFriendly = mode !== 'ffa' && snap.team === localTeam;
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.uniformMat.emissive.setHex(0x000000);
        this.rigMat.emissive.setHex(0x000000);
      }
    }

    // Distinct tactical faction palettes
    if (isFriendly) {
      this.uniformMat.color.setHex(0x2c4a63);
      this.rigMat.color.setHex(0x1b2836);
      this.armorMat.color.setHex(0x16202b);
      this.visorMat.emissive.setHex(0x0284c7);
      this.tagMat.color.setHex(0x38bdf8);
    } else {
      this.uniformMat.color.setHex(0x5b4436);
      this.rigMat.color.setHex(0x2a2623);
      this.armorMat.color.setHex(0x1f1d1b);
      this.visorMat.emissive.setHex(0xd97706);
      this.tagMat.color.setHex(0xf43f5e);
    }

    if (!this.initialized) {
      this.initialized = true;
      this.smoothX = snap.x;
      this.smoothY = snap.y;
      this.smoothZ = snap.z;
      this.smoothYaw = snap.yaw;
      this.smoothPitch = snap.pitch;
      this.prevAlive = snap.alive;
    }

    // Handle respawn reset
    if (snap.alive && !this.prevAlive) {
      this.smoothX = snap.x;
      this.smoothY = snap.y;
      this.smoothZ = snap.z;
      this.deathProgress = 0;
      this.deathTimer = 0;
      this.actorPivot.rotation.set(0, 0, 0);
      this.actorPivot.position.set(0, 0, 0);
      this.shadowMat.opacity = 0.44;
    }

    // Handle death transition -> collapse animation on ground
    if (!snap.alive) {
      if (this.prevAlive) {
        this.deathRollSign = Math.random() > 0.5 ? 1 : -1;
        this.deathTimer = 0;
      }
      this.prevAlive = false;
      this.deathTimer += dt;
      this.deathProgress = Math.min(1, this.deathProgress + dt * 3.4);

      if (this.deathTimer > 2.0) {
        this.root.visible = false;
        return;
      }

      this.root.visible = true;
      this.tagMesh.visible = false;
      const ease = 1 - Math.pow(1 - this.deathProgress, 3);
      this.actorPivot.rotation.x = -ease * (Math.PI * 0.48);
      this.actorPivot.rotation.z = ease * 0.24 * this.deathRollSign;
      this.actorPivot.position.y = ease * 0.14;
      this.shadowMat.opacity = Math.max(0.1, 0.44 * (1 - Math.max(0, (this.deathTimer - 1.2) / 0.8)));
      return;
    }

    this.prevAlive = true;
    this.root.visible = true;

    // Frame-rate independent position & angle damping
    const prevX = this.smoothX;
    const prevZ = this.smoothZ;
    this.smoothX = THREE.MathUtils.damp(this.smoothX, snap.x, 16, dt);
    this.smoothY = THREE.MathUtils.damp(this.smoothY, snap.y, 18, dt);
    this.smoothZ = THREE.MathUtils.damp(this.smoothZ, snap.z, 16, dt);

    let yawDiff = snap.yaw - this.smoothYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.smoothYaw += yawDiff * (1 - Math.exp(-16 * dt));
    this.smoothPitch = THREE.MathUtils.damp(this.smoothPitch, snap.pitch, 16, dt);

    this.root.position.set(this.smoothX, this.smoothY, this.smoothZ);
    this.root.rotation.y = this.smoothYaw;

    this.tagMesh.visible = isFriendly || snap.uavRevealUntil > Date.now();

    const horizSpeed = Math.hypot(this.smoothX - prevX, this.smoothZ - prevZ) / Math.max(0.001, dt);
    const isMoving = horizSpeed > 0.35;

    // Stance-driven pelvis drop & torso lean (no ugly non-uniform scale squash!)
    let targetPelvisY = 0.88;
    let targetTorsoLean = 0.04;
    let targetActorLean = 0;

    if (snap.stance === 'slide') {
      targetPelvisY = 0.46;
      targetTorsoLean = -0.35;
      targetActorLean = -0.15;
    } else if (snap.stance === 'crouch') {
      targetPelvisY = 0.62;
      targetTorsoLean = 0.22;
    } else if (snap.stance === 'sprint' && isMoving) {
      targetTorsoLean = 0.2;
    }

    this.pelvisPivot.position.y = THREE.MathUtils.damp(this.pelvisPivot.position.y, targetPelvisY, 14, dt);
    this.actorPivot.rotation.x = THREE.MathUtils.damp(this.actorPivot.rotation.x, targetActorLean, 12, dt);
    this.actorPivot.rotation.z = THREE.MathUtils.damp(this.actorPivot.rotation.z, 0, 14, dt);
    this.actorPivot.position.y = THREE.MathUtils.damp(this.actorPivot.position.y, 0, 14, dt);

    // Recoil decay
    this.recoilKick = THREE.MathUtils.damp(this.recoilKick, 0, 16, dt);

    if (snap.stance === 'slide') {
      this.leftHipPivot.rotation.x = THREE.MathUtils.damp(this.leftHipPivot.rotation.x, 1.15, 14, dt);
      this.leftKneePivot.rotation.x = THREE.MathUtils.damp(this.leftKneePivot.rotation.x, -0.25, 14, dt);
      this.rightHipPivot.rotation.x = THREE.MathUtils.damp(this.rightHipPivot.rotation.x, 0.35, 14, dt);
      this.rightKneePivot.rotation.x = THREE.MathUtils.damp(this.rightKneePivot.rotation.x, -1.35, 14, dt);
    } else if (snap.stance === 'crouch') {
      const crouchStride = isMoving ? Math.sin(this.walkPhase) * 0.28 : 0;
      if (isMoving) this.walkPhase += dt * 7.5;
      this.leftHipPivot.rotation.x = THREE.MathUtils.damp(this.leftHipPivot.rotation.x, 0.68 + crouchStride, 14, dt);
      this.leftKneePivot.rotation.x = THREE.MathUtils.damp(this.leftKneePivot.rotation.x, -1.18, 14, dt);
      this.rightHipPivot.rotation.x = THREE.MathUtils.damp(this.rightHipPivot.rotation.x, 0.68 - crouchStride, 14, dt);
      this.rightKneePivot.rotation.x = THREE.MathUtils.damp(this.rightKneePivot.rotation.x, -1.18, 14, dt);
    } else if (isMoving) {
      const speedNorm = Math.min(1.4, horizSpeed / 5.4);
      this.walkPhase += dt * (snap.stance === 'sprint' ? 11.5 : 8.2) * Math.max(0.7, speedNorm);
      const stride = Math.sin(this.walkPhase) * (snap.stance === 'sprint' ? 0.66 : 0.45);
      const leftKneeBend = -Math.max(0, -Math.cos(this.walkPhase)) * 0.85 - 0.12;
      const rightKneeBend = -Math.max(0, Math.cos(this.walkPhase)) * 0.85 - 0.12;

      this.leftHipPivot.rotation.x = stride;
      this.rightHipPivot.rotation.x = -stride;
      this.leftKneePivot.rotation.x = leftKneeBend;
      this.rightKneePivot.rotation.x = rightKneeBend;

      // Subtle vertical bounce in stride
      this.pelvisPivot.position.y += Math.abs(Math.cos(this.walkPhase)) * 0.035;
      this.torsoPivot.rotation.y = Math.sin(this.walkPhase) * 0.07;
    } else {
      this.leftHipPivot.rotation.x = THREE.MathUtils.damp(this.leftHipPivot.rotation.x, 0.04, 12, dt);
      this.rightHipPivot.rotation.x = THREE.MathUtils.damp(this.rightHipPivot.rotation.x, -0.04, 12, dt);
      this.leftKneePivot.rotation.x = THREE.MathUtils.damp(this.leftKneePivot.rotation.x, -0.08, 12, dt);
      this.rightKneePivot.rotation.x = THREE.MathUtils.damp(this.rightKneePivot.rotation.x, -0.08, 12, dt);
      this.torsoPivot.rotation.y = THREE.MathUtils.damp(this.torsoPivot.rotation.y, 0, 12, dt);
    }

    // Upper-body pitch aim + ADS weapon posture
    const clampedPitch = Math.max(-0.9, Math.min(0.9, this.smoothPitch));
    this.torsoPivot.rotation.x = THREE.MathUtils.damp(
      this.torsoPivot.rotation.x,
      -targetTorsoLean + clampedPitch * 0.48 + this.recoilKick * 0.06,
      14,
      dt
    );
    this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, clampedPitch * 0.45, 14, dt);

    const isSprinting = snap.stance === 'sprint' && isMoving && !snap.ads;
    const targetWeaponZ = snap.ads ? -0.29 : isSprinting ? -0.24 : -0.34;
    const targetWeaponX = snap.ads ? 0.07 : isSprinting ? 0.03 : 0.14;
    const targetWeaponY = snap.ads ? 0.39 : isSprinting ? 0.28 : 0.34;

    this.weaponGroup.position.x = THREE.MathUtils.damp(this.weaponGroup.position.x, targetWeaponX, 14, dt);
    this.weaponGroup.position.y = THREE.MathUtils.damp(this.weaponGroup.position.y, targetWeaponY, 14, dt);
    this.weaponGroup.position.z = THREE.MathUtils.damp(
      this.weaponGroup.position.z,
      targetWeaponZ + this.recoilKick * 0.06,
      16,
      dt
    );
    this.weaponGroup.rotation.x = THREE.MathUtils.damp(
      this.weaponGroup.rotation.x,
      isSprinting ? -0.32 : clampedPitch * 0.35 + this.recoilKick * 0.14,
      14,
      dt
    );
    this.weaponGroup.rotation.y = THREE.MathUtils.damp(
      this.weaponGroup.rotation.y,
      isSprinting ? 0.58 : snap.ads ? 0.02 : 0.08,
      14,
      dt
    );

    const sprintArmSwing = isSprinting ? Math.sin(this.walkPhase) * 0.16 : 0;
    const rShoulderX = (snap.ads ? 1.12 : isSprinting ? 0.65 : 0.95) + clampedPitch * 0.25 + this.recoilKick * 0.12 - sprintArmSwing;
    const lShoulderX = (snap.ads ? 1.18 : isSprinting ? 0.72 : 1.05) + clampedPitch * 0.25 + this.recoilKick * 0.1 + sprintArmSwing;
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.damp(this.rightShoulderPivot.rotation.x, rShoulderX, 14, dt);
    this.rightShoulderPivot.rotation.y = THREE.MathUtils.damp(this.rightShoulderPivot.rotation.y, isSprinting ? 0.38 : 0.06, 14, dt);
    this.leftShoulderPivot.rotation.x = THREE.MathUtils.damp(this.leftShoulderPivot.rotation.x, lShoulderX, 14, dt);
    this.leftShoulderPivot.rotation.y = THREE.MathUtils.damp(this.leftShoulderPivot.rotation.y, isSprinting ? -0.52 : -0.35, 14, dt);
    this.rightElbowPivot.rotation.x = THREE.MathUtils.damp(this.rightElbowPivot.rotation.x, snap.ads ? 0.72 : 0.55, 14, dt);
    this.leftElbowPivot.rotation.x = THREE.MathUtils.damp(this.leftElbowPivot.rotation.x, snap.ads ? 0.75 : 0.62, 14, dt);
  }

  public dispose(): void {
    this.uniformMat.dispose();
    this.rigMat.dispose();
    this.armorMat.dispose();
    this.visorMat.dispose();
    this.skinMat.dispose();
    this.weaponMat.dispose();
    this.tagMat.dispose();
    this.shadowMat.dispose();
  }
}
