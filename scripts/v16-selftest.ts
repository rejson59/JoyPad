import assert from 'node:assert/strict';
import { MATCH_MODE_LABEL, nextTournamentRound } from '../src/arcade/matchModes';
import { GALLERY_MAX_BYTES, galleryFileExtension, galleryItemFromBlob } from '../src/platform/momentGallery';
import { MomentRecorder } from '../src/platform/momentRecorder';

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
assert.equal(galleryFileExtension('video/mp4'), 'mp4'); assert.equal(GALLERY_MAX_BYTES, 50 * 1024 * 1024);
console.log('V1.6 SELFTEST: OK (tournament rounds, 2v2 contract labels, gallery metadata and explicit clip record)');
