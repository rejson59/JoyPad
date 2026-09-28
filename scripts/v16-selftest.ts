import assert from 'node:assert/strict';
import { MATCH_MODE_LABEL, nextTournamentRound } from '../src/arcade/matchModes';
import { GALLERY_MAX_BYTES, galleryFileExtension, galleryItemFromBlob, selectGalleryMoments } from '../src/platform/momentGallery';
import { MomentRecorder } from '../src/platform/momentRecorder';
import { markWhatsNewSeen, shouldShowWhatsNew, WHATS_NEW_VERSION } from '../src/platform/whatsNewState';

assert.deepEqual(MATCH_MODE_LABEL, { classic: 'ZWYKŁA RUNDA', tournament: 'TURNIEJ', '2v2': '2V2 / DRUŻYNY' });
assert.equal(nextTournamentRound(0), 1); assert.equal(nextTournamentRound(2), 0); assert.equal(nextTournamentRound(-4), 1);

const recorder = new MomentRecorder('snake');
const players = [{ slot: 0, name: 'Ada', color: '#5eead4', score: 2 }];
recorder.observe({ timeLeft: 40, countdown: 0, paused: false, players });
recorder.record({ kind: 'objective', slot: 0, title: 'Wąż oswojony', detail: 'Beta test', at: 3 });
const moment = recorder.highlights()[0];
assert.ok(moment);
const clip = { url: 'blob:moment', mime: 'video/webm', duration: 4 };
const item = galleryItemFromBlob({ ...moment, replay: clip }, 'snake', new Blob(['clip'], { type: 'video/webm' }), 1234);
assert.equal(item.createdAt, 1234); assert.equal(item.blob.type, 'video/webm'); assert.equal(galleryFileExtension(item.mime), 'webm');
const galleryClips = [
  { ...item, id: 'old', game: 'snake' as const, createdAt: 50 },
  { ...item, id: 'middle', game: 'race' as const, createdAt: 100 },
  { ...item, id: 'new', game: 'snake' as const, createdAt: 250 },
];
assert.deepEqual(selectGalleryMoments(galleryClips, 'all', 'newest').map(clip => clip.id), ['new', 'middle', 'old']);
assert.deepEqual(selectGalleryMoments(galleryClips, 'all', 'oldest').map(clip => clip.id), ['old', 'middle', 'new']);
assert.deepEqual(selectGalleryMoments(galleryClips, 'snake', 'newest').map(clip => clip.id), ['new', 'old']);
assert.deepEqual(galleryClips.map(clip => clip.id), ['old', 'middle', 'new'], 'sorting must not mutate the stored gallery list');
assert.equal(galleryFileExtension('video/mp4'), 'mp4'); assert.equal(GALLERY_MAX_BYTES, 50 * 1024 * 1024);
const seenVersions = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => seenVersions.get(key) ?? null,
  setItem: (key: string, value: string) => { seenVersions.set(key, value); },
};
assert.equal(shouldShowWhatsNew(memoryStorage), true, 'new release should be announced once');
markWhatsNewSeen(memoryStorage);
assert.equal(seenVersions.values().next().value, WHATS_NEW_VERSION);
assert.equal(shouldShowWhatsNew(memoryStorage), false, 'dismissed release should stay dismissed');
assert.equal(shouldShowWhatsNew(undefined), true, 'show the announcement if local storage is unavailable');
markWhatsNewSeen(undefined);
console.log('V1.7 SELFTEST: OK (gallery filtering/sorting and one-time startup release notes)');
