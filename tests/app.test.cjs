const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../app.js'), 'utf8');
const key = 'teachloop.workspace.v1';

function workspace({ stored, storageFails = false, clipboard } = {}) {
  const elements = new Map();
  const defaults = { topic: 'Test topic', outcome: 'A concrete learning outcome for testing', level: 'operator', timebox: '30' };
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: defaults[selector.slice(1)] || '',
      textContent: '', innerHTML: '', hidden: true, listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      showModal() { this.open = true; },
      focus() { this.focused = true; },
      select() { this.selected = true; }
    });
    return elements.get(selector);
  }
  const values = new Map(stored === undefined ? [] : [[key, stored]]);
  const context = vm.createContext({
    document: { querySelector: element },
    navigator: { clipboard }, confirm: () => true,
    localStorage: {
      getItem(name) { if (storageFails) throw new Error('Storage denied'); return values.get(name) ?? null; },
      setItem(name, value) { if (storageFails) throw new Error('Quota exceeded'); values.set(name, value); },
      removeItem(name) { if (storageFails) throw new Error('Storage denied'); values.delete(name); }
    }
  });
  vm.runInContext(source, context);
  return {
    element, values,
    run(code) { return vm.runInContext(code, context); },
    fire(selector, type, event = {}) { return element(selector).listeners[type](event); }
  };
}

test('initial render and export work without saved state', () => {
  const app = workspace();
  assert.equal((app.element('#loopBoard').innerHTML.match(/class="loop-card"/g) || []).length, 3);
  app.fire('#exportMarkdown', 'click');
  assert.equal(app.element('#exportDialog').open, true);
  assert.match(app.element('#exportOutput').value, /## Mission/);
});

test('valid saved work survives load and export', () => {
  const app = workspace({ stored: JSON.stringify({ topic: 'Saved topic', materials: 'Saved source', completed: { 'quiz-0': 'Saved answer' }, snapshots: [{ topic: 'Earlier topic' }] }) });
  assert.equal(app.element('#topic').value, 'Saved topic');
  app.fire('#exportMarkdown', 'click');
  assert.match(app.element('#exportOutput').value, /Saved answer/);
  assert.match(app.element('#exportOutput').value, /Saved source/);
});

test('malformed JSON falls back to a usable workspace', () => {
  assert.equal(workspace({ stored: '{broken' }).element('#topic').value, 'Test topic');
});

test('invalid saved field types and select values cannot crash rendering', () => {
  for (const stored of [null, [], 7, { topic: null, outcome: [], materials: {}, snapshots: null, completed: null, level: 'invalid', timebox: 'NaN' }, { completed: { 'quiz-0': {}, 'quiz-1': 12 }, snapshots: {} }]) {
    const app = workspace({ stored: JSON.stringify(stored) });
    app.fire('#exportMarkdown', 'click');
    assert.doesNotMatch(app.element('#exportOutput').value, /Invalid Date|NaN/);
    assert.equal(app.element('#level').value, 'operator');
    assert.equal(app.element('#timebox').value, '30');
    app.fire('#quizArea', 'click', { target: { matches: () => true, dataset: { check: '0' } } });
    assert.equal(typeof app.element('#feedback-0').textContent, 'string');
  }
});

test('unknown saved fields are not copied back to storage', () => {
  const app = workspace({ stored: '{"unexpected":"discard","completed":{"unexpected":"discard","quiz-0":"keep"}}' });
  app.fire('#saveSnapshot', 'click');
  const saved = JSON.parse(app.values.get(key));
  assert.equal(Object.hasOwn(saved, 'unexpected'), false);
  assert.deepEqual(saved.completed, { 'quiz-0': 'keep' });
});

test('saved metadata is validated and snapshot history stays bounded', () => {
  const app = workspace({ stored: JSON.stringify({ lastGeneratedAt: 'invalid', snapshots: Array(20).fill({ topic: 'Earlier' }) }) });
  assert.equal(app.run('Number.isFinite(Date.parse(state.lastGeneratedAt))'), true);
  assert.equal(app.run('state.snapshots.length'), 12);
  app.fire('#saveSnapshot', 'click');
  assert.equal(app.run('state.snapshots.length'), 12);
});

test('HTML payloads in saved topics and answers stay escaped', () => {
  const payload = '</textarea><img src=x onerror="alert(1)">';
  const app = workspace({ stored: JSON.stringify({ topic: payload, completed: { 'quiz-0': payload } }) });
  for (const selector of ['#loopBoard', '#quizArea', '#planTable']) {
    assert.doesNotMatch(app.element(selector).innerHTML, /<img/);
    assert.match(app.element(selector).innerHTML, /&lt;/);
  }
});

test('unavailable storage does not interrupt generation, snapshots, export or reset', () => {
  const app = workspace({ storageFails: true });
  app.element('#topic').value = 'Unsaved topic';
  app.fire('#missionForm', 'submit', { preventDefault() {} });
  assert.match(app.element('#loopBoard').innerHTML, /Unsaved topic/);
  app.fire('#saveSnapshot', 'click');
  assert.equal(app.run('state.snapshots.length'), 1);
  app.fire('#exportMarkdown', 'click');
  assert.match(app.element('#exportOutput').value, /Unsaved topic/);
  assert.equal(app.element('#workspaceNotice').hidden, false);
  app.fire('#resetWorkspace', 'click');
  assert.equal(app.element('#topic').value, 'Test topic');
});

test('reset clears answers and snapshots without mutating defaults', () => {
  const app = workspace();
  app.fire('#quizArea', 'input', { target: { matches: () => true, dataset: { quiz: '0' }, value: 'Old answer' } });
  app.fire('#saveSnapshot', 'click');
  app.fire('#resetWorkspace', 'click');
  assert.equal(app.run('state.completed["quiz-0"]'), undefined);
  assert.equal(app.run('state.snapshots.length'), 0);
  assert.equal(app.values.has(key), false);
  app.fire('#exportMarkdown', 'click');
  assert.doesNotMatch(app.element('#exportOutput').value, /Old answer/);
});

test('clipboard failures offer manual copying without an unhandled rejection', async () => {
  for (const clipboard of [undefined, { async writeText() { throw new Error('Clipboard denied'); } }]) {
    const app = workspace({ clipboard });
    app.fire('#exportMarkdown', 'click');
    await app.fire('#copyExport', 'click');
    assert.equal(app.element('#exportOutput').selected, true);
    assert.equal(app.element('#exportNotice').hidden, false);
    assert.match(app.element('#exportNotice').textContent, /手动复制/);
  }
});

test('clipboard success confirms copying and opening export clears old feedback', async () => {
  let copied;
  const app = workspace({ clipboard: { async writeText(value) { copied = value; } } });
  app.fire('#exportMarkdown', 'click');
  await app.fire('#copyExport', 'click');
  assert.equal(copied, app.element('#exportOutput').value);
  assert.match(app.element('#exportNotice').textContent, /已复制/);
  app.fire('#exportMarkdown', 'click');
  assert.equal(app.element('#exportNotice').hidden, true);
});
