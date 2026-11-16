import test from 'node:test';
import assert from 'node:assert/strict';
import { isSaveReportShortcut } from './keyboard-shortcuts.ts';

test('isSaveReportShortcut matches Cmd+S and Ctrl+S cleanly', () => {
  assert.equal(
    isSaveReportShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }),
    true
  );
  assert.equal(
    isSaveReportShortcut({ key: 'S', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }),
    true
  );
});

test('isSaveReportShortcut rejects plain S or extra modifiers', () => {
  assert.equal(
    isSaveReportShortcut({ key: 's', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }),
    false
  );
  assert.equal(
    isSaveReportShortcut({ key: 's', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }),
    false
  );
  assert.equal(
    isSaveReportShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }),
    false
  );
  assert.equal(
    isSaveReportShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }),
    false
  );
});
