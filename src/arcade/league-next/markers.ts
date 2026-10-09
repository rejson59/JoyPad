import * as THREE from 'three';

/**
 * Etykieta nad autem gracza.
 *
 * Silnik z paczki miał kamerę pościgową jednego gracza, więc nie potrzebował podpisów. Na wspólnym
 * ekranie każdy człowiek musi wiedzieć, które auto jest jego: nick w kolorze slotu ze strzałką
 * w dół. Rozmiar jest stały względem ekranu (skala rośnie z odległością od kamery), więc napis jest
 * czytelny zarówno przy ścisłym kadrze, jak i gdy kamera pokazuje całe boisko.
 */

/** Wysokość etykiety jako ułamek wysokości ekranu. */
const SCREEN_FRACTION = 0.05;
/** Ile jednostek nad środkiem auta ma stać czubek strzałki. */
const LIFT = 1.5;

export class NameTag {
  readonly sprite: THREE.Sprite;
  private readonly texture: THREE.CanvasTexture;
  private readonly ratio: number;

  constructor(name: string, color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 112;
    const g = canvas.getContext('2d');
    if (g) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      // tabliczka z nickiem
      g.fillStyle = 'rgba(6,10,18,0.82)';
      g.strokeStyle = color;
      g.lineWidth = 5;
      g.beginPath();
      if (typeof g.roundRect === 'function') g.roundRect(8, 6, 304, 70, 18);
      else g.rect(8, 6, 304, 70);
      g.fill();
      g.stroke();
      // strzałka w dół
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(144, 80);
      g.lineTo(176, 80);
      g.lineTo(160, 106);
      g.closePath();
      g.fill();
      // nick
      g.fillStyle = color;
      g.font = '800 40px system-ui, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name.toUpperCase().slice(0, 10), 160, 43);
    }
    this.ratio = canvas.width / canvas.height;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // `depthTest: false` — etykieta ma być widoczna także za szybą, trybuną i słupkiem bramki.
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
  }

  /** Ustawia etykietę nad autem i skaluje ją do stałego rozmiaru na ekranie. */
  place(carPos: THREE.Vector3, cameraPos: THREE.Vector3, fovDeg: number, visible: boolean) {
    this.sprite.visible = visible;
    if (!visible) return;
    this.sprite.position.set(carPos.x, carPos.y + LIFT, carPos.z);
    const distance = cameraPos.distanceTo(this.sprite.position);
    const height = distance * 2 * Math.tan((fovDeg * Math.PI) / 360) * SCREEN_FRACTION;
    this.sprite.scale.set(height * this.ratio, height, 1);
  }

  dispose() {
    this.sprite.removeFromParent();
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
