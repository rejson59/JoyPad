/**
 * BlockCraft 2.18 – moby 1:1 z Minecrafta.
 *
 * Do 2.17 moby były zlepkiem kolorowych klocków, a tekstura z paczki trafiała
 * na nie tylko jako „wzór” (sierść, runo, pancerz). Tutaj odwzorowujemy
 * **prawdziwe modele** z gry: te same prostopadłościany, te same punkty
 * zawiasów i ten sam układ UV, więc każdy piksel tekstury z paczki ląduje
 * dokładnie tam, gdzie w Minecrafcie – oczy, ryjek, łaty krowy, twarz creepera.
 *
 * Współrzędne modelu są w pikselach tekstury (16 px = 1 blok), oś Y rośnie
 * w dół, a stopy leżą na y = 24. Konwersja do świata Three:
 *
 *   x =  x / 16
 *   y = (24 − y) / 16      (oś Y w Three rośnie do góry)
 *   z =  z / 16            (korzeń modelu obrócony o π, bo waniliowe moby
 *                           patrzą w −Z, a nasze w +Z)
 *
 * Układ UV pudełka jest waniliowy (`faceRects`): góra, dół, prawa, lewa,
 * przód i tył leżą w prostokątach zaczynających się w (u, v). Dzięki temu
 * jedna funkcja obsługuje wszystkie modele – od świni po ghasta.
 */

import * as THREE from 'three';
import { MOB_SKINS } from './art/vanillaArt.generated';
import { decodePng } from './art/miniPng';

export type Vec3 = readonly [number, number, number];

export interface MobBox {
  /** Lewy górny róg prostokąta w teksturze. */
  uv: readonly [number, number];
  /** Rozmiar pudełka w pikselach modelu (bez dylatacji). */
  size: Vec3;
  /** Róg pudełka (jak `cuboid(x, y, z, w, h, d)` w wanilii). */
  at: Vec3;
  /** Dylatacja – „spuchnięcie” o N pikseli z każdej strony (wełna, czapka). */
  inflate?: number;
  /** Lustrzane odbicie UV (lewe kończyny w wanilii). */
  mirror?: boolean;
  /** Półprzezroczysta warstwa (zewnętrzny „żel” slime’a). */
  alpha?: number;
  /** Zamiast tekstury – jednolity kolor (np. ptasie nóżki w cienkich UV). */
  color?: number;
}

export interface MobPart {
  name: string;
  pivot: Vec3;
  /** Nazwa części nadrzędnej – jak `PartDefinition` zagnieżdżony w wanilii. */
  parent?: string;
  /** Obrót w radianach: [pitch (X), yaw (Y), roll (Z)] – jak w wanilii. */
  rot?: Vec3;
  boxes: MobBox[];
}

export interface MobModel {
  /** Klucz skórki w `MOB_SKINS` (mieszkaniec: `villager0..4`). */
  skin: string;
  parts: MobPart[];
  /** Skala modelu (piksele modelu → bloki); 1 = 16 px na blok. */
  scale?: number;
  /** Uniesienie modelu nad ziemię w blokach (ghast lata). */
  lift?: number;
  /** Skala układu UV – tekstury 2× (np. ghast 128×64) mają podwojone UV. */
  uvScale?: number;
}

// ---------------------------------------------------------------------------
// pomocnicze skróty do zapisu modeli
// ---------------------------------------------------------------------------
const box = (uv: readonly [number, number], at: Vec3, size: Vec3, extra: Partial<MobBox> = {}): MobBox => ({ uv, at, size, ...extra });
const mir = (uv: readonly [number, number], at: Vec3, size: Vec3, extra: Partial<MobBox> = {}): MobBox => ({ uv, at, size, mirror: true, ...extra });
const part = (name: string, pivot: Vec3, boxes: MobBox[], rot?: Vec3, parent?: string): MobPart => ({ name, pivot, rot, boxes, parent });

const PI = Math.PI;

// ---------------------------------------------------------------------------
// modele
// ---------------------------------------------------------------------------

/**
 * Mieszkańcy: 5 zawodów z gry, każdy z własną teksturą (baza + biom + zawód).
 * Model z `VillagerResemblingModel` 1.21: głowa 8×10×8, nos 2×4×2, szata
 * z „jacketem”, złożone ręce i połykająca czapka.
 */
function villagerModel(): MobPart[] {
  return [
    part('head', [0, 0, 0], [
      box([0, 0], [-4, -10, -4], [8, 10, 8]),
      box([32, 0], [-4, -10, -4], [8, 10, 8], { inflate: 0.51 }),
      box([24, 0], [-1, -3, -6], [2, 4, 2]),
    ]),
    // 2.23: płaski rond kapelusza (w wanilii osobne pudełko obrócone o 90°).
    part('hat_rim', [0, -0.5, 0], [box([30, 47], [-8, -8, -6], [16, 16, 1])], [-PI / 2, 0, 0], 'head'),
    part('body', [0, 0, 0], [
      box([16, 20], [-4, 0, -3], [8, 12, 6]),
      box([0, 38], [-4, 0, -3], [8, 20, 6], { inflate: 0.5 }),
    ]),
    part('arms', [0, 3, -1], [
      box([44, 22], [-8, -2, -2], [4, 8, 4]),
      mir([44, 22], [4, -2, -2], [4, 8, 4]),
      box([40, 38], [-4, 2, -2], [8, 4, 4]),
    ], [-0.75, 0, 0]),
    part('rightLeg', [-2, 12, 0], [box([0, 22], [-2, 0, -2], [4, 12, 4])]),
    part('leftLeg', [2, 12, 0], [mir([0, 22], [-2, 0, -2], [4, 12, 4])]),
  ];
}

export const MOB_MODELS: Readonly<Record<string, MobModel>> = {
  pig: {
    skin: 'pig',
    // 2.23: dokładnie `PigModel` z 26.2 – tułów na zawiasie y=11, głowa
    // y=12, ryjek [16,16], a lewe nogi mają lustrzane UV (tak jak w grze).
    parts: [
      part('head', [0, 12, -6], [
        box([0, 0], [-4, -4, -8], [8, 8, 8]),
        box([16, 16], [-2, 0, -9], [4, 3, 1]),
      ]),
      part('body', [0, 11, 2], [box([28, 8], [-5, -10, -7], [10, 16, 8])], [PI / 2, 0, 0]),
      part('rightHindLeg', [-3, 18, 7], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftHindLeg', [3, 18, 7], [mir([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('rightFrontLeg', [-3, 18, -5], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftFrontLeg', [3, 18, -5], [mir([0, 16], [-2, 0, -2], [4, 6, 4])]),
    ],
  },
  cow: {
    skin: 'cow',
    parts: [
      part('head', [0, 4, -8], [
        box([0, 0], [-4, -4, -6], [8, 8, 6]),
        // 2.23: 1.21.5+ (a więc i 26.2) dokłada krowie wystający pysk – bez
        // tego pudełka tekstura `cow_temperate` miała nozdrza na płaskiej twarzy.
        box([1, 33], [-3, 1, -7], [6, 3, 1]),
        box([22, 0], [-5, -5, -5], [1, 3, 1]),
        box([22, 0], [4, -5, -5], [1, 3, 1]),
      ]),
      part('body', [0, 5, 2], [
        box([18, 4], [-6, -10, -7], [12, 18, 10]),
        box([52, 0], [-2, 2, -8], [4, 6, 1]),
      ], [PI / 2, 0, 0]),
      // 2.23: wanilia od 1.21.5 lustrzy UV lewych nóg krowy (tekstura nóg jest
      // teraz symetryczna) – bez tego „łatki” na nogach nie pasowały do ciała.
      part('rightHindLeg', [-4, 12, 7], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftHindLeg', [4, 12, 7], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('rightFrontLeg', [-4, 12, -5], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftFrontLeg', [4, 12, -5], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
    ],
  },
  /** 2.23: krowa ciepła (sawanna, dżungla, pustynia) – inne rogi niż zwykła. */
  cow_warm: {
    skin: 'cow_warm',
    parts: [
      part('head', [0, 4, -8], [
        box([0, 0], [-4, -4, -6], [8, 8, 6]),
        box([1, 33], [-3, 1, -7], [6, 3, 1]),
        box([27, 0], [-8, -3, -5], [4, 2, 2]),
        box([39, 0], [-8, -5, -5], [2, 2, 2]),
        mir([27, 0], [4, -3, -5], [4, 2, 2]),
        mir([39, 0], [6, -5, -5], [2, 2, 2]),
      ]),
      part('body', [0, 5, 2], [
        box([18, 4], [-6, -10, -7], [12, 18, 10]),
        box([52, 0], [-2, 2, -8], [4, 6, 1]),
      ], [PI / 2, 0, 0]),
      part('rightHindLeg', [-4, 12, 7], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftHindLeg', [4, 12, 7], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('rightFrontLeg', [-4, 12, -5], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftFrontLeg', [4, 12, -5], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
    ],
  },
  /** 2.23: krowa zimowa (tundra, góry) – kudłaty tułów i grube rogi. */
  cow_cold: {
    skin: 'cow_cold',
    parts: [
      part('head', [0, 4, -8], [
        box([0, 0], [-4, -4, -6], [8, 8, 6]),
        box([9, 33], [-3, 1, -7], [6, 3, 1]),
      ]),
      part('leftHorn', [5.5, 1.5, -13], [box([0, 32], [-1.5, -3, -0.5], [2, 6, 2])], [PI / 2, 0, 0], 'head'),
      part('rightHorn', [-4.5, 1.5, -11.5], [box([0, 40], [-1.5, -4.5, -0.5], [2, 6, 2])], [PI / 2, 0, 0], 'head'),
      part('body', [0, 5, 2], [
        box([20, 32], [-6, -10, -7], [12, 18, 10], { inflate: 0.5 }),
        box([18, 4], [-6, -10, -7], [12, 18, 10]),
        box([52, 0], [-2, 2, -8], [4, 6, 1]),
      ], [PI / 2, 0, 0]),
      part('rightHindLeg', [-4, 12, 7], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftHindLeg', [4, 12, 7], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('rightFrontLeg', [-4, 12, -5], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftFrontLeg', [4, 12, -5], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
    ],
  },
  /** 2.23: zimowa świnia ma dodatkową warstwę futra (ten sam szkielet). */
  pig_cold: {
    skin: 'pig_cold',
    parts: [
      part('head', [0, 12, -6], [
        box([0, 0], [-4, -4, -8], [8, 8, 8]),
        box([16, 16], [-2, 0, -9], [4, 3, 1]),
      ]),
      part('body', [0, 11, 2], [
        box([28, 8], [-5, -10, -7], [10, 16, 8]),
        box([28, 32], [-5, -10, -7], [10, 16, 8], { inflate: 0.5 }),
      ], [PI / 2, 0, 0]),
      part('rightHindLeg', [-3, 18, 7], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftHindLeg', [3, 18, 7], [mir([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('rightFrontLeg', [-3, 18, -5], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftFrontLeg', [3, 18, -5], [mir([0, 16], [-2, 0, -2], [4, 6, 4])]),
    ],
  },
  /** 2.23: zimowa kura – czapka z piór i dodatkowe pióra ogona. */
  chicken_cold: {
    skin: 'chicken_cold',
    parts: [
      part('body', [0, 16, 0], [
        box([0, 9], [-3, -4, -3], [6, 8, 6]),
        box([38, 9], [0, 3, -1], [0, 3, 5]),
      ], [PI / 2, 0, 0]),
      part('head', [0, 15, -4], [
        box([0, 0], [-2, -6, -2], [4, 6, 3]),
        box([44, 0], [-3, -7, -2.015], [6, 3, 4]),
      ]),
      part('beak', [0, 15, -4], [box([14, 0], [-2, -4, -4], [4, 2, 2])], undefined, 'head'),
      part('red_thing', [0, 15, -4], [box([14, 4], [-1, -2, -3], [2, 2, 2])], undefined, 'head'),
      part('rightLeg', [-2, 19, 1], [box([26, 0], [-1, 0, -3], [3, 5, 3])]),
      part('leftLeg', [1, 19, 1], [box([26, 0], [-1, 0, -3], [3, 5, 3])]),
      part('rightWing', [-4, 13, 0], [box([24, 13], [0, 0, -3], [1, 4, 6])]),
      part('leftWing', [4, 13, 0], [box([24, 13], [-1, 0, -3], [1, 4, 6])]),
    ],
  },
  sheep: {
    skin: 'sheep',
    // 2.21.1: `QuadrupedEntityModel.getModelData(12)` – owca ma 12-pikselowe
    // nogi (uv 0,16 → 4×12×4), a nie 6-pikselowe. Wcześniej stała na krótkich
    // nóżkach, a tułów wisiał tuż nad ziemią.
    parts: [
      part('head', [0, 6, -8], [box([0, 0], [-3, -4, -6], [6, 6, 8])]),
      part('body', [0, 5, 2], [box([28, 8], [-4, -10, -7], [8, 16, 6])], [PI / 2, 0, 0]),
      // prawa strona w wanilii ma lustrzane UV (lewa nie)
      part('rightHindLeg', [-3, 12, 7], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftHindLeg', [3, 12, 7], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('rightFrontLeg', [-3, 12, -5], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftFrontLeg', [3, 12, -5], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
    ],
  },
  /** Wełna owcy – osobny model, „spuchnięty” o 1.75 px na torsie. */
  sheep_wool: {
    skin: 'sheep_wool',
    parts: [
      part('head', [0, 6, -8], [box([0, 0], [-3, -4, -4], [6, 6, 6], { inflate: 0.6 })]),
      part('body', [0, 5, 2], [box([28, 8], [-4, -10, -7], [8, 16, 6], { inflate: 1.75 })], [PI / 2, 0, 0]),
      part('rightHindLeg', [-3, 12, 7], [box([0, 16], [-2, 0, -2], [4, 6, 4], { inflate: 0.5 })]),
      part('leftHindLeg', [3, 12, 7], [box([0, 16], [-2, 0, -2], [4, 6, 4], { inflate: 0.5 })]),
      part('rightFrontLeg', [-3, 12, -5], [box([0, 16], [-2, 0, -2], [4, 6, 4], { inflate: 0.5 })]),
      part('leftFrontLeg', [3, 12, -5], [box([0, 16], [-2, 0, -2], [4, 6, 4], { inflate: 0.5 })]),
    ],
  },
  chicken: {
    skin: 'chicken',
    parts: [
      part('head', [0, 15, -4], [
        box([0, 0], [-2, -6, -2], [4, 6, 3]),
        box([14, 0], [-2, -4, -4], [4, 2, 2]),
        box([14, 4], [-1, -2, -3], [2, 2, 2]),
      ]),
      part('body', [0, 16, 0], [box([0, 9], [-3, -4, -3], [6, 8, 6])], [PI / 2, 0, 0]),
      part('rightLeg', [-2, 19, 1], [box([26, 0], [-1, 0, -3], [3, 5, 3])]),
      part('leftLeg', [1, 19, 1], [box([26, 0], [-1, 0, -3], [3, 5, 3])]),
      part('rightWing', [-4, 13, 0], [box([24, 13], [0, 0, -3], [1, 4, 6])]),
      part('leftWing', [4, 13, 0], [box([24, 13], [-1, 0, -3], [1, 4, 6])]),
    ],
  },
  creeper: {
    skin: 'creeper',
    parts: [
      part('head', [0, 6, 0], [box([0, 0], [-4, -8, -4], [8, 8, 8])]),
      part('body', [0, 6, 0], [box([16, 16], [-4, 0, -2], [8, 12, 4])]),
      part('rightHindLeg', [-2, 18, 4], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftHindLeg', [2, 18, 4], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('rightFrontLeg', [-2, 18, -4], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
      part('leftFrontLeg', [2, 18, -4], [box([0, 16], [-2, 0, -2], [4, 6, 4])]),
    ],
  },
  zombie: {
    skin: 'zombie',
    // Wanilia rysuje modele humanoidalne w skali 15/16 (1,95 bloku wzrostu).
    scale: 0.9375,
    parts: [
      part('head', [0, 0, 0], [box([0, 0], [-4, -8, -4], [8, 8, 8])]),
      // 2.23: zewnętrzna warstwa głowy („czapka”) – w wanilii to osobne
      // pudełko o 0,5 px większe, z tekstury [32,0].
      part('hat', [0, 0, 0], [box([32, 0], [-4, -8, -4], [8, 8, 8], { inflate: 0.5 })], undefined, 'head'),
      part('body', [0, 0, 0], [box([16, 16], [-4, 0, -2], [8, 12, 4])]),
      part('rightArm', [-5, 2, 0], [box([40, 16], [-3, -2, -2], [4, 12, 4])], [-PI / 2, 0, 0]),
      part('leftArm', [5, 2, 0], [mir([40, 16], [-1, -2, -2], [4, 12, 4])], [-PI / 2, 0, 0]),
      part('rightLeg', [-1.9, 12, 0], [box([0, 16], [-2, 0, -2], [4, 12, 4])]),
      part('leftLeg', [1.9, 12, 0], [mir([0, 16], [-2, 0, -2], [4, 12, 4])]),
    ],
  },
  skeleton: {
    skin: 'skeleton',
    scale: 0.9375,
    parts: [
      part('head', [0, 0, 0], [box([0, 0], [-4, -8, -4], [8, 8, 8])]),
      part('body', [0, 0, 0], [box([16, 16], [-4, 0, -2], [8, 12, 4])]),
      // 2.21.1: w wanilii ręce szkieletu zwisają wzdłuż tułowia (BipedEntityModel
      // ustawia tylko kołysanie w chodzie) – wcześniej były uniesione jak u zombie.
      part('rightArm', [-5, 2, 0], [box([40, 16], [-1, -2, -1], [2, 12, 2])]),
      part('leftArm', [5, 2, 0], [mir([40, 16], [-1, -2, -1], [2, 12, 2])]),
      part('rightLeg', [-2, 12, 0], [box([0, 16], [-1, 0, -1], [2, 12, 2])]),
      part('leftLeg', [2, 12, 0], [mir([0, 16], [-1, 0, -1], [2, 12, 2])]),
    ],
  },
  spider: {
    skin: 'spider',
    parts: [
      part('head', [0, 15, -3], [box([32, 4], [-4, -4, -8], [8, 8, 8])]),
      // 2.21.1: głowotułów i odwłok to dwa osobne zawiasy – w wanilii odwłok
      // (`body1`) siedzi na z = 9, więc pająk ma tułów z przodu, a nie w środku.
      part('body', [0, 15, 0], [box([0, 0], [-3, -3, -3], [6, 6, 6])]),
      part('body1', [0, 15, 9], [box([0, 12], [-5, -4, -6], [10, 8, 12])]),
      // osiem nóg: prawa strona zwykła, lewa lustrzana; roll/yaw jak w grze
      part('rightHindLeg', [-4, 15, 2], [box([18, 0], [-15, -1, -1], [16, 2, 2])], [0, PI / 4, -PI / 4]),
      part('rightMiddleHindLeg', [-4, 15, 1], [box([18, 0], [-15, -1, -1], [16, 2, 2])], [0, PI / 8, -0.58]),
      part('rightMiddleFrontLeg', [-4, 15, 0], [box([18, 0], [-15, -1, -1], [16, 2, 2])], [0, -PI / 8, -0.58]),
      part('rightFrontLeg', [-4, 15, -1], [box([18, 0], [-15, -1, -1], [16, 2, 2])], [0, -PI / 4, -PI / 4]),
      part('leftHindLeg', [4, 15, 2], [mir([18, 0], [-1, -1, -1], [16, 2, 2])], [0, -PI / 4, PI / 4]),
      part('leftMiddleHindLeg', [4, 15, 1], [mir([18, 0], [-1, -1, -1], [16, 2, 2])], [0, -PI / 8, 0.58]),
      part('leftMiddleFrontLeg', [4, 15, 0], [mir([18, 0], [-1, -1, -1], [16, 2, 2])], [0, PI / 8, 0.58]),
      part('leftFrontLeg', [4, 15, -1], [mir([18, 0], [-1, -1, -1], [16, 2, 2])], [0, PI / 4, PI / 4]),
    ],
  },
  wolf: {
    skin: 'wolf',
    parts: [
      part('head', [-1, 13.5, -7], [
        box([0, 0], [-2, -3, -2], [6, 6, 4]),
        box([16, 14], [-2, -5, 0], [2, 2, 1]),
        box([16, 14], [2, -5, 0], [2, 2, 1]),
        box([0, 10], [-0.5, 0, -5], [3, 3, 4]),
      ]),
      part('body', [-1, 14, -3], [box([21, 0], [-3, -3, -3], [8, 6, 7])], [PI / 2, 0, 0]),
      part('torso', [0, 14, 2], [box([18, 14], [-3, -2, -3], [6, 9, 6])], [PI / 2, 0, 0]),
      part('rightHindLeg', [-2.5, 16, 7], [box([0, 18], [0, 0, -1], [2, 8, 2])]),
      part('leftHindLeg', [0.5, 16, 7], [box([0, 18], [0, 0, -1], [2, 8, 2])]),
      part('rightFrontLeg', [-2.5, 16, -4], [box([0, 18], [0, 0, -1], [2, 8, 2])]),
      part('leftFrontLeg', [0.5, 16, -4], [box([0, 18], [0, 0, -1], [2, 8, 2])]),
      part('tail', [-1, 12, 8], [box([9, 18], [0, 0, -1], [2, 8, 2])], [PI / 5, 0, 0]),
    ],
  },
  villager: { skin: 'villager0', scale: 0.9375, parts: villagerModel() },
  golem: {
    skin: 'golem',
    parts: [
      part('head', [0, -7, -2], [
        box([0, 0], [-4, -12, -5.5], [8, 10, 8]),
        box([24, 0], [-1, -5, -7.5], [2, 4, 2]),
      ]),
      part('body', [0, -7, 0], [
        box([0, 40], [-9, -2, -6], [18, 12, 11]),
        box([0, 70], [-4.5, 10, -3], [9, 5, 6], { inflate: 0.5 }),
      ]),
      part('rightArm', [0, -7, 0], [box([60, 21], [-13, -2.5, -3], [4, 30, 6])]),
      part('leftArm', [0, -7, 0], [box([60, 58], [9, -2.5, -3], [4, 30, 6])]),
      part('rightLeg', [-4, 11, 0], [box([37, 0], [-3.5, -3, -3], [6, 16, 5])]),
      part('leftLeg', [5, 11, 0], [mir([60, 0], [-3.5, -3, -3], [6, 16, 5])]),
    ],
  },
  enderman: {
    skin: 'enderman',
    scale: 0.9375,
    parts: [
      part('head', [0, -13, 0], [box([0, 0], [-4, -8, -4], [8, 8, 8])]),
      part('body', [0, -14, 0], [box([32, 16], [-4, 0, -2], [8, 12, 4])]),
      part('rightArm', [-5, -12, 0], [box([56, 0], [-1, -2, -1], [2, 30, 2])]),
      part('leftArm', [5, -12, 0], [mir([56, 0], [-1, -2, -1], [2, 30, 2])]),
      part('rightLeg', [-2, -5, 0], [box([56, 0], [-1, 0, -1], [2, 30, 2])]),
      part('leftLeg', [2, -5, 0], [mir([56, 0], [-1, 0, -1], [2, 30, 2])]),
    ],
  },
  slime: {
    skin: 'slime',
    scale: 1.8,
    parts: [
      part('body', [0, 24, 0], [
        // 2.23: warstwa `outer` z modelu slime'a (8×8×8, UV [0,0]) – w tej
        // paczce to na niej narysowana jest twarz, więc nie może być w pełni
        // przezroczysta.
        box([0, 0], [-4, -8, -4], [8, 8, 8], { alpha: 0.92 }),
        box([0, 16], [-3, -7, -3], [6, 6, 6]),
        box([32, 0], [-3.25, -6, -3.5], [2, 2, 2]),
        box([32, 4], [1.25, -6, -3.5], [2, 2, 2]),
        box([32, 8], [0, -3, -3.5], [1, 1, 1]),
      ]),
    ],
  },
  ghast: {
    skin: 'ghast',
    scale: 2.0,
    lift: 0.5,
    uvScale: 2,
    parts: [
      part('body', [0, 17.6, 0], [box([0, 0], [-8, -8, -8], [16, 16, 16])]),
      // 2.23: dokładne macki z `GhastModel` (x = ±3,75 / ±1,25 / ±6,25,
      // długości 8–13 px). Wcześniej były losowane i nie trafiały w teksturę.
      ...[
        [-3.75, -5, 8], [1.25, -5, 13], [6.25, -5, 9],
        [-6.25, 0, 11], [-1.25, 0, 11], [3.75, 0, 10],
        [-3.75, 5, 12], [1.25, 5, 9], [6.25, 5, 12],
      ].map(([tx, tz, len], i) =>
        part(`tentacle${i}`, [tx, 24.6, tz], [box([0, 0], [-1, 0, -1], [2, len, 2])], [0.4, 0, 0])),
    ],
  },
};

// ---------------------------------------------------------------------------
// budowanie geometrii
// ---------------------------------------------------------------------------

const toWorld = (v: Vec3): Vec3 => [v[0] / 16, (24 - v[1]) / 16, v[2] / 16];

export interface SkinUv {
  x0: number; y0: number; x1: number; y1: number;
}

/**
 * Sześć prostokątów UV pudełka w kolejności ścian `BoxGeometry`:
 * +X, −X, +Y, −Y, +Z, −Z (waniliowo: prawa, lewa, góra, dół, tył, przód).
 */
export function boxFaces(uv: readonly [number, number], w: number, h: number, d: number, mirror = false, uvScale = 1): SkinUv[] {
  const u = uv[0] * uvScale;
  const v = uv[1] * uvScale;
  const scaleRect = uvScale !== 1;
  if (scaleRect) {
    w *= uvScale; h *= uvScale; d *= uvScale;
  }
  const rect = (x: number, y: number, rw: number, rh: number): SkinUv => ({ x0: x, y0: y, x1: x + rw, y1: y + rh });
  const faces = [
    rect(u, v + d, d, h), // +X – prawa strona
    rect(u + d + w, v + d, d, h), // −X – lewa strona
    rect(u + d, v, w, d), // +Y – góra
    rect(u + d + w, v, w, d), // −Y – dół
    rect(u + d + w + d, v + d, w, h), // +Z – tył
    rect(u + d, v + d, w, h), // −Z – przód
  ];
  if (!mirror) return faces;
  // Lustro w wanilii odbija tylko oś U, nie zmieniając układu ścian.
  return faces.map((f) => ({ x0: f.x1, y0: f.y0, x1: f.x0, y1: f.y1 }));
}

/** Nakłada prostokąty UV na geometrię pudełka (tekstura „od góry”, flipY = false). */
export function applyBoxUv(geometry: THREE.BoxGeometry, faces: SkinUv[], texW: number, texH: number) {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const { x0, y0, x1, y1 } = faces[f];
    const u0 = Math.min(x0, x1) / texW;
    const u1 = Math.max(x0, x1) / texW;
    const v0 = y0 / texH;
    const v1 = y1 / texH;
    const base = f * 4;
    // BoxGeometry: lewy-górny, prawy-górny, lewy-dolny, prawy-dolny
    const left = x0 <= x1 ? u0 : u1;
    const right = x0 <= x1 ? u1 : u0;
    uv.setXY(base + 0, left, v0);
    uv.setXY(base + 1, right, v0);
    uv.setXY(base + 2, left, v1);
    uv.setXY(base + 3, right, v1);
  }
  uv.needsUpdate = true;
}

const textures = new Map<string, THREE.Texture | null>();

/** Tekstura moba z paczki (wspólna dla wszystkich egzemplarzy danego typu). */
export function mobSkinTexture(key: string): THREE.Texture | null {
  if (textures.has(key)) return textures.get(key) ?? null;
  const skin = MOB_SKINS[key];
  if (!skin) {
    textures.set(key, null);
    return null;
  }
  try {
    const img = decodePng(skin.png);
    const tex = new THREE.DataTexture(new Uint8Array(img.data), img.width, img.height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    textures.set(key, tex);
    return tex;
  } catch (e) {
    console.warn('Nie udało się odczytać tekstury moba z paczki.', e);
    textures.set(key, null);
    return null;
  }
}

export interface BuiltMob {
  root: THREE.Group;
  parts: Record<string, THREE.Group>;
  meshes: THREE.Mesh[];
}

/**
 * Buduje model moba z teksturą z paczki. Zwraca `null`, gdy skórki brak –
 * wtedy `Mob` zostaje przy starym, kolorowym modelu.
 */
export function buildMobModel(model: MobModel, skinKey = model.skin, opts: { alphaTest?: number } = {}): BuiltMob | null {
  const tex = mobSkinTexture(skinKey);
  if (!tex) return null;
  const img = tex.image as { width: number; height: number };
  const root = new THREE.Group();
  root.rotation.y = Math.PI; // waniliowe moby patrzą w −Z, nasze w +Z
  const scale = model.scale ?? 1;
  root.scale.setScalar(scale);
  root.position.y = model.lift ?? 0;
  const parts: Record<string, THREE.Group> = {};
  const meshes: THREE.Mesh[] = [];

  for (const p of model.parts) {
    const group = new THREE.Group();
    const pivot = toWorld(p.pivot);
    // 2.23: części mogą być zagnieżdżone (`parent`) – tak jak
    // `PartDefinition` w wanilii. Dziecko dostaje pozycję względem zawiasu
    // rodzica, więc obrót rodzica (np. głowy) pociąga za sobą czapkę czy rond
    // kapelusza, dokładnie jak w grze.
    const parent = p.parent ? parts[p.parent] : undefined;
    if (parent) {
      const pp = model.parts.find((q) => q.name === p.parent)!;
      const parentPivot = toWorld(pp.pivot);
      group.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
    } else {
      group.position.set(pivot[0], pivot[1], pivot[2]);
    }
    if (p.rot) {
      // Waniliowy model ma oś Y skierowaną w dół, a Three – w górę. Odbicie
      // osi Y zmienia znak obrotów wokół X i Z, a yaw (wokół Y) zostaje bez
      // zmian. Bez tego tułów świni „stawał” dębem zamiast leżeć wzdłuż Z.
      group.rotation.set(-p.rot[0], p.rot[1], -p.rot[2]);
    }
    for (const b of p.boxes) {
      const dil = b.inflate ?? 0;
      // Płaskie pudełka (np. pióra zimowej kury mają szerokość 0) muszą mieć
      // minimalną grubość, inaczej geometria BoxGeometry jest zdegenerowana.
      const w = Math.max(0.02, b.size[0] + dil * 2);
      const h = Math.max(0.02, b.size[1] + dil * 2);
      const d = Math.max(0.02, b.size[2] + dil * 2);
      const geometry = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
      applyBoxUv(geometry, boxFaces(b.uv, b.size[0], b.size[1], b.size[2], b.mirror, model.uvScale ?? 1), img.width, img.height);
      // `at` jest względem zawiasu, więc środek pudełka liczymy w układzie
      // modelu (oś Y w dół), a potem przenosimy do świata – bez tego kończyny
      // „uciekały” nad tułów.
      const cx = p.pivot[0] + b.at[0] + b.size[0] / 2;
      const cy = p.pivot[1] + b.at[1] + b.size[1] / 2;
      const cz = p.pivot[2] + b.at[2] + b.size[2] / 2;
      const center = toWorld([cx, cy, cz]);
      const material = b.color !== undefined
        ? new THREE.MeshLambertMaterial({ color: b.color })
        : new THREE.MeshLambertMaterial({
          map: tex,
          alphaTest: b.alpha !== undefined ? 0 : opts.alphaTest ?? 0.5,
          transparent: b.alpha !== undefined,
          opacity: b.alpha ?? 1,
          depthWrite: b.alpha === undefined,
        });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(center[0] - pivot[0], center[1] - pivot[1], center[2] - pivot[2]);
      group.add(mesh);
      meshes.push(mesh);
    }
    (parent ?? root).add(group);
    parts[p.name] = group;
  }
  return { root, parts, meshes };
}

/** Ile modeli mobów jest gotowych (diagnostyka i testy). */
export function mobModelCount(): number {
  return Object.keys(MOB_MODELS).length;
}
