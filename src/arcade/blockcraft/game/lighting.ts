import * as THREE from 'three';

/**
 * BlockCraft 2.8.2 „Zdrowe drzewa” – model oświetlenia.
 *
 * Do 2.8 shader dzielił kolor wierzchołka przez „niebo”, więc **każde**
 * zacienienie (AO, ściany, korony drzew) było skracane do 1. Efekt: płaski,
 * „wyklejony” świat, a wieczorem drzewa i inne ciemne powierzchnie zlewały
 * się w czarne plamy.
 *
 * Teraz:
 *  - kolor wierzchołka to *zacienienie* (AO × kierunek ściany × ekspozycja
 *    na niebo), a nie „jasność do podzielenia”,
 *  - słońce świeci kierunkowo: każda ściana ma swój numer (`aFace`), a shader
 *    liczy `dot(ściana, kierunek słońca)`, więc światło naprawdę wędruje po
 *    świecie razem z porą dnia (ściany od słońca jaśnieją, przeciwne gasną),
 *  - światło bloku (pochodnie, lawa) dodaje ciepły, pomarańczowy blask,
 *  - trzymana pochodnia/latarnia oświetla okolicę (uniformy `uHeld*`),
 *  - noc ma podłogę jasności, więc da się grać bez pochodni, ale jaskinie
 *    i lasy nadal są wyraźnie ciemniejsze niż otwarte pole.
 *
 * Wartości liczbowe są zdublowane w GLSL-u poniżej; `lightFactor()` to ten sam
 * wzór w JavaScripcie, używany przez testy (żeby „czarne drzewa” nie wróciły).
 */

/** Zasięg światła trzymanego przedmiotu w blokach (uniform `uHeldRange`). */
export const HELD_RANGE = 14;
/** Maksymalny blask trzymanego źródła światła. */
export const HELD_POWER = 0.72;
/** Podłoga światła otoczenia – dzięki niej noc nie jest czarna. */
export const AMBIENT = 0.13;
/**
 * 2.8.2: „księżycówka”. Nocą otwarte niebo dostaje odrobinę światła więcej,
 * ale jaskinie (mała ekspozycja na niebo) zostają ciemne. Bez tego nocne
 * korony drzew zlewały się w czarne plamy.
 */
export const MOON_SKY = 0.22;
/** Jak mocno słońce rozjaśnia ścianę ustawioną prostopadle do niego. */
export const SUN_GAIN = 0.45;
/** Bazowy poziom światła nieba, zanim dojdzie słońce (1.0 = bez zmian). */
export const SKY_BASE = 0.75;

/**
 * Wzór z fragment shadera w wersji JS (testy + dokumentacja).
 *
 * @param skyAttr   atrybut `color.r` (zacienienie do kwadratu, 0–1)
 * @param blockAttr atrybut `aBlock` (światło bloku do kwadratu, 0–1)
 * @param uDay      jasność nieba (1 = południe, ~0.16 = noc)
 * @param held      światło trzymanego przedmiotu (0–HELD_POWER), po spadku
 * @param sun       udział słońca na tej ścianie (0–1), już po `dot()`
 */
export function lightFactor(skyAttr: number, blockAttr: number, uDay: number, held = 0, sun = 0): number {
  const shade = Math.sqrt(Math.max(skyAttr, 0));
  const sky = shade * Math.max(uDay, 0);
  const block = Math.sqrt(Math.max(blockAttr, 0));
  // Słońce działa tylko tam, gdzie blok widzi niebo (jaskinia go nie łapie)
  // i tylko na ścianach odwróconych w jego stronę.
  const sunFactor = Math.max(0, Math.min(1, sun)) * Math.min(1, sky * 4);
  // Słońce moduluje tylko światło NIEBA – blask pochodni świeci pełnią siły,
  // niezależnie od tego, czy blok widzi niebo.
  const lit = Math.max(sky * (SKY_BASE + SUN_GAIN * sunFactor), block) + Math.max(held, 0);
  const moon = shade * MOON_SKY * Math.max(0, 1 - Math.max(uDay, 0));
  return Math.min(2.4, lit + AMBIENT + moon);
}

/**
 * Spadek światła trzymanego przedmiotu z odległością (identyczny w GLSL-u).
 * Zwraca 0 poza zasięgiem, ~1 tuż przy graczu.
 */
export function heldFalloff(distance: number, strength: number, range = HELD_RANGE): number {
  if (strength <= 0 || range <= 0) return 0;
  const t = Math.max(0, Math.min(1, 1 - distance / range));
  return strength * Math.pow(t, 1.6);
}

export interface HeldLightState {
  /** Pozycja światła (zwykle oczy gracza) – współdzielona z uniformem. */
  pos: THREE.Vector3;
  /** 0 = brak źródła, 1 = pochodnia/latarnia; lekko migocze. */
  strength: number;
}

export interface SunState {
  /** Kierunek NA słońce (znormalizowany) – wspólny ze sceną. */
  dir: THREE.Vector3;
  /** 0 w nocy, 1 w południe. */
  power: number;
}

/**
 * Podpina model światła do materiału chunków.
 *
 * `opts.held` i `opts.sun` są opcjonalne (testy i narzędzia mogą tworzyć
 * materiał bez gracza). Woda dostaje dodatkowo falę (`aWave` + `uTime`).
 */
export function patchChunkMaterial(
  mat: THREE.MeshBasicMaterial,
  uDay: { value: number },
  opts: { water?: boolean; time?: { value: number }; held?: HeldLightState; sun?: SunState } = {}
) {
  const water = !!opts.water;
  const uTime = opts.time ?? { value: 0 };
  const heldPos = opts.held?.pos ?? new THREE.Vector3(0, -1000, 0);
  const uHeldStrength = { value: 0 };
  if (opts.held?.strength !== undefined) uHeldStrength.value = opts.held.strength;
  const sunDir = { value: opts.sun?.dir ?? new THREE.Vector3(0.35, 1, 0.2).normalize() };
  const uSun = { value: opts.sun?.power ?? 1 };

  mat.userData.uDay = uDay;
  mat.userData.uTime = uTime;
  mat.userData.uHeldStrength = uHeldStrength;
  mat.userData.uSun = uSun;
  mat.color.setRGB(1, 1, 1);
  mat.customProgramCacheKey = () => (water ? 'blockcraft-light-4-water' : 'blockcraft-light-4');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDay = uDay;
    shader.uniforms.uHeldPos = { value: heldPos };
    shader.uniforms.uHeldStrength = uHeldStrength;
    shader.uniforms.uHeldRange = { value: HELD_RANGE };
    shader.uniforms.uSunDir = sunDir;
    shader.uniforms.uSun = uSun;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBlock;\nattribute float aFace;\n' +
          (water ? 'attribute float aWave;\nuniform float uTime;\n' : '') +
          'varying float vBlock;\nvarying float vFace;\nvarying vec3 vWorldPos;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvBlock = aBlock;\n\tvFace = aFace;' +
          (water
            ? '\n\tif (aWave > 0.5) {\n\t\ttransformed.y += sin(uTime * 1.7 + transformed.x * 0.8 + transformed.z * 0.65) * 0.045;\n\t}'
            : '') +
          '\n\tvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDay;
uniform vec3 uHeldPos;
uniform float uHeldStrength;
uniform float uHeldRange;
uniform vec3 uSunDir;
uniform float uSun;
varying float vBlock;
varying float vFace;
varying vec3 vWorldPos;

// 2.8.2: numer ściany (0..5) → jej normalna. Bez tablic, żeby działało
// na każdym sterowniku (WebGL1 i WebGL2).
vec3 faceNormal(float f) {
	if (f < 0.5) return vec3(-1.0, 0.0, 0.0);
	if (f < 1.5) return vec3(1.0, 0.0, 0.0);
	if (f < 2.5) return vec3(0.0, -1.0, 0.0);
	if (f < 3.5) return vec3(0.0, 1.0, 0.0);
	if (f < 4.5) return vec3(0.0, 0.0, -1.0);
	return vec3(0.0, 0.0, 1.0);
}`
      )
      .replace(
        // 2.8.1: świadomie *nie* wstawiamy `#include <color_fragment>`.
        // Ten fragment robi `diffuseColor *= vColor`, a vColor to już
        // zacienienie do kwadratu – po dodaniu naszego światła cień byłby
        // liczony podwójnie (shade³) i las wracałby do czerni.
        '#include <color_fragment>',
        `{
		// vColor to zacienienie do kwadratu: pierwiastek wraca do liniowej skali.
		float shade = sqrt(max(vColor.r, 0.0));
		float sky = shade * max(uDay, 0.0);
		float block = sqrt(max(vBlock, 0.0));

		// Trzymana pochodnia/latarnia – łagodny spadek z odległością.
		float held = 0.0;
		if (uHeldStrength > 0.001) {
			float d = distance(vWorldPos, uHeldPos);
			float t = clamp(1.0 - d / uHeldRange, 0.0, 1.0);
			held = uHeldStrength * pow(t, 1.6);
		}

		// Słońce: ściany zwrócone do niego jaśnieją, odwrotne zostają w cieniu.
		// sky * 4 sprawia, że jaskinia (sky ≈ 0.04) nie łapie światła dziennego.
		float ndl = max(dot(faceNormal(vFace), uSunDir), 0.0);
		float sun = ndl * uSun * clamp(sky * 4.0, 0.0, 1.0);

		// Słońce moduluje tylko światło nieba – pochodnia świeci pełnią siły.
		float lit = max(sky * (${SKY_BASE.toFixed(2)} + ${SUN_GAIN.toFixed(2)} * sun), block) + held;
		// 2.8.2: księżycówka – nocą otwarte niebo jaśniejsze, jaskinie bez zmian.
		float moon = shade * ${MOON_SKY.toFixed(2)} * max(0.0, 1.0 - max(uDay, 0.0));
		// Ciepły odcień światła bloków i trzymanego przedmiotu; słońce lekko złoci.
		float warm = clamp(block + held - sky, 0.0, 1.0);
		vec3 tint = mix(vec3(1.0), vec3(1.06, 0.86, 0.62), warm * 0.85);
		tint = mix(tint, vec3(1.06, 1.0, 0.9), sun * 0.45);
		vec3 lightColor = tint * min(lit + ${AMBIENT.toFixed(3)} + moon, 2.4);
		diffuseColor.rgb *= lightColor;
	}`
      );
  };
}
