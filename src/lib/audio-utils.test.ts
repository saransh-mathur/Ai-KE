import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAudioMimeType,
  stripBase64DataUrlPrefix,
  validateAudioPayload,
  formatRecordingDuration,
} from './audio-utils.ts';

test('normalizeAudioMimeType handles codec suffixes and file extensions', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/ogg; codecs=opus'), 'audio/ogg');
  assert.equal(normalizeAudioMimeType('audio/x-wav'), 'audio/wav');
  assert.equal(normalizeAudioMimeType('audio/x-m4a'), 'audio/mp4');
  assert.equal(normalizeAudioMimeType('', 'meeting-notes.mp3'), 'audio/mp3');
  assert.equal(normalizeAudioMimeType('application/octet-stream', 'incident.wav'), 'audio/wav');
  assert.equal(normalizeAudioMimeType('text/plain', 'readme.txt'), null);
});

test('stripBase64DataUrlPrefix extracts embedded mime type and strips whitespace', () => {
  const result = stripBase64DataUrlPrefix('data:audio/webm;base64, UklGRiQAAABXQVZFZm10 ');
  assert.equal(result.embeddedMime, 'audio/webm');
  assert.equal(result.base64, 'UklGRiQAAABXQVZFZm10');

  const raw = stripBase64DataUrlPrefix('UklGRiQAAABXQVZFZm10');
  assert.equal(raw.embeddedMime, null);
  assert.equal(raw.base64, 'UklGRiQAAABXQVZFZm10');
});

test('validateAudioPayload validates audio payload and rejects invalid inputs', () => {
  const valid = validateAudioPayload({
    audioBase64: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.mimeType, 'audio/wav');
    assert.ok(valid.byteLength > 0);
  }

  const missing = validateAudioPayload({ audioBase64: '' });
  assert.equal(missing.ok, false);

  const unsupported = validateAudioPayload({
    audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    mimeType: 'video/avi',
  });
  assert.equal(unsupported.ok, false);
});

test('formatRecordingDuration formats seconds cleanly as MM:SS', () => {
  assert.equal(formatRecordingDuration(0), '00:00');
  assert.equal(formatRecordingDuration(9), '00:09');
  assert.equal(formatRecordingDuration(75), '01:15');
  assert.equal(formatRecordingDuration(-5), '00:00');
});
