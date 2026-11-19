import * as THREE from 'three';
import type { ComputedWeaponStats } from '../game/types.ts';
import { buildTacticalWeaponMesh } from './WeaponMeshBuilder.ts';

export class WeaponViewmodel {
  public readonly root = new THREE.Group();
  private readonly weaponGroup = new THREE.Group();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly laserBeam: THREE.Mesh;
  private readonly hipPos = new THREE.Vector3(0.24, -0.22, -0.44);
  private readonly adsPos = new THREE.Vector3(0, -0.155, -0.34);

  private builtDispose: (() => void) | null = null;
  private builtMeshGroup: THREE.Group | null = null;
  private boltCarrier: THREE.Mesh | null = null;
  private boltBaseZ = -0.01;
  private boltTravel = 0;

  private adsAlpha = 0;
  private recoilKick = 0;
  private muzzleTimer = 0;
  private walkPhase = 0;
  private reloadTilt = 0;
  private lastWeaponKey = '';

  constructor() {
    this.root.add(this.weaponGroup);

    const flashGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffc857,
      transparent: true,
      opacity: 0.9,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.visible = false;
    this.weaponGroup.add(this.muzzleFlash);

    const beamGeo = new THREE.CylinderGeometry(0.002, 0.002, 4, 6);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.32,
    });
    this.laserBeam = new THREE.Mesh(beamGeo, beamMat);
    this.laserBeam.visible = false;
    this.weaponGroup.add(this.laserBeam);
  }

  public rebuildIfNeeded(stats: ComputedWeaponStats): void {
    const key = `${stats.id}_${stats.optic}_${stats.muzzle}_${stats.magazine}_${stats.underbarrel}_${stats.camo}`;
    if (key === this.lastWeaponKey) return;
    this.lastWeaponKey = key;

    if (this.builtMeshGroup) {
      this.weaponGroup.remove(this.builtMeshGroup);
      this.builtMeshGroup = null;
    }
    if (this.builtDispose) {
      this.builtDispose();
      this.builtDispose = null;
    }

    const built = buildTacticalWeaponMesh(stats, { includeHands: true, castShadows: false, maxAnisotropy: 4 });
    this.builtMeshGroup = built.group;
    this.builtDispose = built.dispose;
    this.boltCarrier = built.boltCarrier;
    this.boltBaseZ = built.boltCarrier.position.z;
    this.weaponGroup.add(built.group);

    this.muzzleFlash.position.copy(built.muzzleLocalPos);
    this.laserBeam.visible = stats.hasLaser;
    (this.laserBeam.material as THREE.MeshBasicMaterial).color.setHex(
      stats.underbarrel === 'angled_carbon' ? 0x10b981 : 0x38bdf8
    );
    this.laserBeam.position.set(built.laserLocalPos.x, built.laserLocalPos.y, built.laserLocalPos.z - 2.0);
  }

  public triggerShot(suppressed: boolean): void {
    this.recoilKick = Math.min(0.09, this.recoilKick + 0.038);
    this.boltTravel = 0.042;
    if (!suppressed) {
      this.muzzleTimer = 0.045;
      this.muzzleFlash.visible = true;
      this.muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.5);
    }
  }

  public update(
    dt: number,
    adsTarget: boolean,
    adsSpeed: number,
    moveSpeed: number,
    sprinting: boolean,
    reloading: boolean
  ): void {
    this.adsAlpha += ((adsTarget && !reloading && !sprinting ? 1 : 0) - this.adsAlpha) * Math.min(1, dt * adsSpeed);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 0.34);
    this.boltTravel = Math.max(0, this.boltTravel - dt * 0.45);
    if (this.boltCarrier) {
      this.boltCarrier.position.z = this.boltBaseZ + this.boltTravel;
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzleFlash.visible = false;
    }

    const targetTilt = reloading ? 1 : 0;
    this.reloadTilt += (targetTilt - this.reloadTilt) * Math.min(1, dt * 8);

    if (moveSpeed > 0.25) {
      this.walkPhase += dt * (sprinting ? 11.5 : 7.5);
    } else {
      this.walkPhase += dt * 1.4;
    }

    const bobScale = (1 - this.adsAlpha * 0.82) * (moveSpeed > 0.25 ? 1 : 0.18);
    const bobX = Math.cos(this.walkPhase) * 0.008 * bobScale;
    const bobY = Math.abs(Math.sin(this.walkPhase)) * 0.01 * bobScale;

    this.weaponGroup.position.lerpVectors(this.hipPos, this.adsPos, this.adsAlpha);
    this.weaponGroup.position.x += bobX;
    this.weaponGroup.position.y -= bobY + this.reloadTilt * 0.14;
    this.weaponGroup.position.z += this.recoilKick;

    const sprintCant = sprinting && !reloading && this.adsAlpha < 0.1 ? 1 : 0;
    this.weaponGroup.rotation.x = this.recoilKick * 2.2 - this.reloadTilt * 0.65 - sprintCant * 0.16;
    this.weaponGroup.rotation.y = sprintCant * 0.45 + this.reloadTilt * 0.22;
    this.weaponGroup.rotation.z = sprintCant * 0.22 - this.reloadTilt * 0.35;
  }

  public dispose(): void {
    if (this.builtDispose) {
      this.builtDispose();
      this.builtDispose = null;
    }
    this.muzzleFlash.geometry.dispose();
    (this.muzzleFlash.material as THREE.Material).dispose();
    this.laserBeam.geometry.dispose();
    (this.laserBeam.material as THREE.Material).dispose();
  }
}
