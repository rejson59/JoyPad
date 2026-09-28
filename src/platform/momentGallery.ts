import type { GameId } from '../arcade/catalog';
import type { Moment } from './momentRecorder';

export interface GalleryMoment {
  id: string;
  game: GameId;
  title: string;
  detail: string;
  player: string;
  color: string;
  kind: Moment['kind'];
  at: number;
  createdAt: number;
  mime: string;
  duration: number;
  blob: Blob;
}

const DB_NAME = 'joypad-moments';
const STORE = 'gallery';
const DB_VERSION = 1;
export const GALLERY_MAX_BYTES = 50 * 1024 * 1024;
export const GALLERY_MAX_ITEMS = 40;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open gallery'));
  });
}

export async function listGalleryMoments(): Promise<GalleryMoment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as GalleryMoment[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error ?? new Error('Cannot read gallery'));
  });
}

export function selectGalleryMoments(items: readonly GalleryMoment[], gameFilter: string, sortOrder: 'newest' | 'oldest'): GalleryMoment[] {
  return items
    .filter(item => gameFilter === 'all' || item.game === gameFilter)
    .slice()
    .sort((a, b) => sortOrder === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
}

export function galleryFileExtension(mime: string): 'mp4' | 'webm' { return mime.includes('mp4') ? 'mp4' : 'webm'; }

export function galleryItemFromBlob(moment: Moment, game: GameId, blob: Blob, createdAt = Date.now()): GalleryMoment {
  if (!moment.replay) throw new Error('Moment has no replay');
  return {
    id: `${game}-${moment.id}-${createdAt}`,
    game,
    title: moment.title,
    detail: moment.detail,
    player: moment.name,
    color: moment.color,
    kind: moment.kind,
    at: moment.at,
    createdAt,
    mime: moment.replay.mime || blob.type || 'video/webm',
    duration: moment.replay.duration,
    blob,
  };
}

export async function saveMomentToGallery(moment: Moment, game: GameId): Promise<GalleryMoment> {
  if (!moment.replay) throw new Error('Moment has no replay');
  const response = await fetch(moment.replay.url);
  if (!response.ok) throw new Error('Cannot read replay');
  const blob = await response.blob();
  const item = galleryItemFromBlob(moment, game, blob);
  const current = await listGalleryMoments();
  const bytes = current.reduce((sum, entry) => sum + entry.blob.size, 0);
  if (current.length >= GALLERY_MAX_ITEMS || bytes + blob.size > GALLERY_MAX_BYTES) throw new Error('Gallery limit reached');
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Cannot save replay'));
  });
  return item;
}

export async function deleteGalleryMoment(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Cannot delete replay'));
  });
}
