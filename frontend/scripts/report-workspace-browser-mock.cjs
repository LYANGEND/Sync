/* Built-preview / real Chromium / MOCK APIs ONLY.
 * Run: node frontend/scripts/report-workspace-browser-mock.cjs
 * Optional REPORT_PREVIEW_ORIGIN, PLAYWRIGHT_CORE_PATH, REPORT_TEST_FILTER.
 * Reuses phase9-readiness-browser-mock.js's auth and deny-external routing.
 * No installation, backend, database, cloud, backfill, or cutover access.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const os = require('node:os');
const origin = process.env.REPORT_PREVIEW_ORIGIN || 'http://127.0.0.1:5199';
if (origin !== 'http://127.0.0.1:5199') throw new Error('Safety boundary: only local preview port 5199 is allowed');
const output = path.resolve(__dirname, '../../docs/operations/report-workspace-browser');
fs.mkdirSync(output, { recursive: true });
// Remove only this harness's generated evidence, never source or production data.
for (const file of fs.readdirSync(output)) {
  if (/^(?:(?:workspace|student|class|dialog)-\d+-(?:light|dark)|failure-\d+)\.png$/.test(file) || file === 'results.json') fs.unlinkSync(path.join(output, file));
}
function findPlaywright() {
  if (process.env.PLAYWRIGHT_CORE_PATH) return process.env.PLAYWRIGHT_CORE_PATH;
  try { return require.resolve('playwright-core'); } catch {}
  const links = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'ms-playwright/.links');
  for (const file of fs.readdirSync(links)) {
    const candidate = fs.readFileSync(path.join(links, file), 'utf8').trim();
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  // Cache links can outlive an npx package directory. Reuse another installed copy.
  const npx = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx');
  for (const directory of fs.readdirSync(npx)) {
    const candidate = path.join(npx, directory, 'node_modules/playwright-core');
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  throw new Error('Cached Playwright not found; set PLAYWRIGHT_CORE_PATH (no download performed)');
}
const { chromium } = require(findPlaywright());
const terms = ['ACTIVE', 'CLOSING', 'CLOSED', 'DRAFT'].map((status, index) => ({
  id: `term-${index}`, name: `Term ${index + 1}`, status, isActive: status === 'ACTIVE',
  startDate: `2046-0${index + 1}-01`, academicYear: { name: '2046' },
}));
const classes = term => [{ id: `class-${term}`, name: `Grade 5 ${term}` }];
const students = term => [{ id: `student-${term}`, firstName: 'Ada', lastName: `Mock ${term}` }, { id: `second-${term}`, firstName: 'Ben', lastName: 'Mock' }];
function report(term = 'term-0', status = 'FINALIZED', studentId = `student-${term}`) {
  return { id: `report-${studentId}`, studentId, termId: term, status, currentVersion: status === 'DRAFT' ? 0 : 1,
    academicYear: '2046', totalScore: 160, averageScore: 80, rank: 1, totalAttendance: 58, totalDays: 60,
    student: { firstName: 'Ada', lastName: `Mock ${term}`, admissionNumber: 'MOCK-001' },
    class: { name: `Grade 5 ${term}`, gradeLevel: 5 }, term: { ...terms.find(t => t.id === term), endDate: '2046-12-31' },
    school: { schoolName: 'Mock School', schoolAddress: 'Preview only', schoolPhone: '000', schoolEmail: 'mock@example.invalid' },
    classTeacherRemark: 'Good progress.', principalRemark: 'Well done.',
    results: ['Mathematics', 'English'].map((subjectName, i) => ({ id: `result-${i}`, subjectId: `subject-${i}`, subjectName, totalScore: 80, grade: 'A', remarks: 'Good' })) };
}
const fullQuery = (term = 'term-0', mode = 'student') => `&reportTerm=${term}&reportClass=class-${term}&reportMode=${mode}${mode === 'student' ? `&reportStudent=student-${term}` : ''}`;
const evidence = { label: 'REAL CHROMIUM / MOCK API ONLY — NOT LIVE BACKEND ACCEPTANCE', origin, scenarios: [], assertions: [], geometry: [], pageErrors: [], denied: [], unexpected: [], calls: [] };
let scenarioName = '';
function check(condition, message) {
  evidence.assertions.push({ scenario: scenarioName, message, passed: Boolean(condition) });
  assert.ok(condition, message);
}
function observe(condition, message) {
  evidence.assertions.push({ scenario: scenarioName, message, passed: Boolean(condition) });
}
async function fixture(browser, options = {}) {
  const user = { id: '10000000-0000-4000-8000-000000000001', email: 'report-browser@example.invalid', fullName: 'MOCK Report Admin', role: options.role || 'SUPER_ADMIN' };
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const state = { faults: {}, calls: [], terms: structuredClone(terms), emptyClasses: false, emptyStudents: false, missing: false, reportStatus: 'FINALIZED', classEmpty: false, ...options };
  const deferred = {};
  const reached = {};
  const waitUntilReached = key => reached[key] || (reached[key] = new Promise(resolve => { deferred[`reached-${key}`] = resolve; }));
  const hold = key => new Promise(resolve => { deferred[key] = resolve; deferred[`reached-${key}`]?.(); reached[key] = Promise.resolve(); });
  state.waitUntilReached = waitUntilReached;
  state.release = key => deferred[key]?.();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { evidence.denied.push({ scenario: scenarioName, url: url.href }); return route.abort(); }
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
    const endpoint = url.pathname.replace('/api/v1', '');
    const entry = { scenario: scenarioName, endpoint, method: request.method(), query: Object.fromEntries(url.searchParams), body: request.postData() ? request.postDataJSON() : null };
    state.calls.push(entry); evidence.calls.push(entry);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const faultKey = endpoint === '/academic-terms' ? 'terms' : endpoint === '/classes' ? 'classes' : /^\/classes\/[^/]+\/students$/.test(endpoint) ? 'students' : endpoint === '/reports/student' ? 'report' : null;
    if (faultKey && state.faults[faultKey]) {
      const fault = state.faults[faultKey];
      if (fault === 'network') return route.abort('failed');
      if (fault === 'malformed') return json({ unexpected: true });
      return json({ error: `MOCK ${faultKey} error` }, fault);
    }
    const term = url.searchParams.get('academicTermId') || url.searchParams.get('termId') || entry.body?.termId || 'term-0';
    if (state.holdClasses === term && endpoint === '/classes') await hold('classes');
    if (state.holdStudents === term && faultKey === 'students') await hold('students');
    if (state.holdReport && endpoint === '/reports/student') await hold('report');
    if (endpoint === '/profile') return json(user);
    if (endpoint === '/settings/public') return json({ schoolName: 'MOCK Report School', primaryColor: '#1A3A9C', secondaryColor: '#475569', accentColor: '#FF9933' });
    // Existing shell auto-greeting is not a report mutation. Mock it explicitly.
    if (endpoint === '/master-ai/speech') return json({ error: 'Speech disabled in isolated browser fixture' }, 503);
    if (endpoint === '/academic-terms') return json(state.terms);
    if (endpoint === '/classes') return json(state.emptyClasses ? [] : classes(term));
    if (faultKey === 'students') return json(state.emptyStudents ? [] : students(term));
    if (endpoint === '/reports/readiness/class') return json({ termId: term, classId: `class-${term}`, className: `Grade 5 ${term}`, ready: false, checkedAt: '2046-10-06T12:00:00Z', counts: { students: 2, ready: 0, blocked: 0, instructionalDays: 60 }, blockers: [], students: [] });
    if (/^\/reports\/[^/]+\/versions$/.test(endpoint) || endpoint === '/reports/amendments') return json([]);
    if (endpoint === '/reports/student') return state.missing ? json({ error: 'Not found' }, 404) : json(report(term, state.reportStatus, url.searchParams.get('studentId')));
    if (endpoint === '/reports/class') return json(state.classEmpty ? [] : [report(term, state.reportStatus)]);
    if (endpoint === '/reports/generate') return json(report(term, 'DRAFT', entry.body.studentId));
    if (endpoint === '/reports/generate-bulk') { state.classEmpty = false; return json({ count: 1 }); }
    if (endpoint === '/ai/parent-letter') return json({ studentId: entry.body.studentId, studentName: state.letterName || 'Ada Mock', guardianName: null, termName: 'Term 1', letterHtml: state.plainLetter ? '' : '<p>Safe letter content.</p><script>globalThis.__letterUnsafe=1</script><img src="x" onerror="globalThis.__letterUnsafe=2"><a href="javascript:alert(1)">Unsafe link</a>', letterPlainText: state.plainLetter || 'Safe letter content.', generatedAt: '2046-10-06T12:00:00Z' });
    if (request.method() !== 'GET') { evidence.unexpected.push(entry); return route.abort(); }
    // Shell dependencies, including notifications and branches, never pass through.
    return json(endpoint.includes('notifications') ? { notifications: [], unreadCount: 0 } : []);
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => socket.close());
  await context.addInitScript(({ user, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('token', 'mock-browser-only'); localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('theme', 'system'); localStorage.setItem('pwa-install-dismissed', 'true');
    window.__printCount = 0; window.print = () => { window.__printCount++; };
  }, { user, origin });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => evidence.pageErrors.push({ scenario: scenarioName, message: error.message }));
  const panel = page.locator('#academic-tab-panel');
  const selection = page.locator('section[aria-labelledby="report-selection-heading"]');
  const button = name => selection.getByRole('button', { name, exact: true });
  const primary = () => selection.getByRole('button', { name: /^(Generate \/ View Student Report|View Student Report|View Class Results Sheet)$/ });
  const load = async (query = '') => {
    await page.goto(`${origin}/academics?tab=reports${query}`, { waitUntil: 'domcontentloaded' });
    await panel.getByRole('heading', { name: 'Choose a report', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('#report-term')?.disabled || !!document.querySelector('#report-term-error'));
  };
  const ready = async () => { await primary().waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('section[aria-labelledby="report-selection-heading"] button')].some(b => /^(Generate \/ View Student Report|View Student Report|View Class Results Sheet)$/.test(b.textContent.trim()) && !b.disabled)); };
  const choose = async () => { await page.locator('#report-class').selectOption('class-term-0'); await page.locator('#report-student option[value="student-term-0"]').waitFor({ state: 'attached' }); await page.locator('#report-student').selectOption('student-term-0'); await ready(); };
  const view = async () => { await ready(); await primary().click(); await page.locator('#printable-report').waitFor(); };
  const writes = () => state.calls.filter(c => c.method !== 'GET' && c.endpoint !== '/master-ai/speech');
  return { context, page, state, panel, selection, button, primary, load, ready, choose, view, writes };
}
async function geometry(f, label, width, theme, target = 'section[aria-labelledby="report-selection-heading"]') {
  const measure = await f.page.locator(target).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, left: r.left, right: r.right, client: el.clientWidth, scroll: el.scrollWidth, dark: document.documentElement.classList.contains('dark'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, animations: el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length };
  });
  evidence.geometry.push({ scenario: scenarioName, label, width, theme, ...measure });
  observe(measure.left >= 0 && measure.right <= width + 1 && measure.scroll <= measure.client + 1, `${label}: target fits without horizontal overflow`);
  observe(measure.documentWidth <= width, `${label}: document has no horizontal overflow`);
  check(measure.dark === (theme === 'dark') && measure.reduced && measure.animations === 0, `${label}: actual theme and reduced motion`);
}
const tests = [];
const test = (name, options, run) => tests.push({ name, options, run });
test('Visible selectors, active default, disabled hints, search, no Filter', {}, async f => {
  await f.load();
  check(await f.page.getByRole('heading', { name: 'Academic Management' }).isVisible(), 'full Academic page rendered');
  check(await f.page.getByRole('tab', { name: 'Report Cards' }).getAttribute('aria-selected') === 'true', 'reports tab selected');
  for (const label of ['Academic term', 'Class', 'Search student names', 'Student']) check(await f.page.getByLabel(label, { exact: true }).isVisible(), `${label} visible and labelled`);
  check(await f.selection.getByRole('button', { name: /Filter/i }).count() === 0, 'no Filter button');
  check(await f.page.locator('#report-term').inputValue() === 'term-0', 'unique ACTIVE term defaults');
  check(await f.primary().isDisabled() && await f.primary().getAttribute('aria-describedby') === 'report-action-hint', 'primary disabled with linked explanation');
  await f.choose(); await f.page.locator('#report-student-search').fill('nobody');
  check(await f.page.locator('#report-student').inputValue() === 'student-term-0', 'search keeps selected student visible');
  check(await f.page.locator('#report-search-hint').innerText() === 'No names match. Clear or change your search; any selected student is kept.', 'no search matches hint');
  check(f.writes().length === 0, 'selectors never generate');
});
for (const variant of ['none', 'multiple', 'empty']) test(`Active default: ${variant}`, { terms: variant === 'empty' ? [] : terms.map(t => ({ ...t, status: variant === 'none' ? 'CLOSED' : 'ACTIVE', isActive: true })) }, async f => {
  await f.load(); check(await f.page.locator('#report-term').inputValue() === '', 'no silent first or ambiguous active term');
  check(await f.primary().isDisabled(), 'invalid default disables primary');
  check(!f.state.calls.some(c => c.endpoint === '/classes'), 'no classes lookup without term');
});
test('URL restore, refresh, history Back never generates', {}, async f => {
  await f.load(fullQuery()); await f.ready();
  check(await f.page.locator('#report-student').inputValue() === 'student-term-0', 'URL selections restored');
  await f.page.reload(); await f.ready(); check(f.writes().length === 0, 'reload no generation');
  await f.page.locator('#report-term').selectOption('term-1');
  await f.page.locator('#report-class option[value="class-term-1"]').waitFor({ state: 'attached' });
  check(await f.page.locator('#report-class').inputValue() === '' && await f.page.locator('#report-student').inputValue() === '', 'term change clears dependent selections');
  await f.page.goBack(); await f.ready();
  check(await f.page.locator('#report-student').inputValue() === 'student-term-0' && f.writes().length === 0, 'Back restores without generating');
});
for (const [name, query] of [ ['unavailable term', '&reportTerm=gone'], ['empty explicit term', '&reportTerm='], ['foreign class', '&reportTerm=term-1&reportClass=class-term-0'], ['foreign student', '&reportTerm=term-0&reportClass=class-term-0&reportStudent=student-term-1'], ['duplicate', '&reportTerm=term-0&reportTerm=term-1'], ['unknown mode', '&reportMode=bogus'], ['class with student', fullQuery('term-0', 'class') + '&reportStudent=student-term-0'] ]) test(`Invalid URL: ${name}`, {}, async f => {
  await f.load(query); await f.page.locator('#report-selection-error').waitFor();
  check(await f.primary().isDisabled(), 'invalid URL fails closed'); check(f.writes().length === 0, 'invalid URL has no writes');
});
for (const kind of ['classes', 'students']) test(`Empty ${kind}`, { [kind === 'classes' ? 'emptyClasses' : 'emptyStudents']: true }, async f => {
  await f.load(kind === 'classes' ? '&reportTerm=term-0' : '&reportTerm=term-0&reportClass=class-term-0');
  await f.page.getByText(kind === 'classes' ? 'No classes are available in this term. Ask your administrator to check class setup or access.' : 'No students are enrolled in this term and class. Ask your administrator to check enrollment or access.', { exact: true }).waitFor();
  check(await f.primary().isDisabled(), 'empty list disables primary');
});
for (const kind of ['terms', 'classes', 'students']) for (const fault of ['network', 500, 403, 'malformed']) test(`${kind} ${fault} and retry`, { faults: { [kind]: fault } }, async f => {
  await f.load(kind === 'terms' ? '' : kind === 'classes' ? '&reportTerm=term-0' : '&reportTerm=term-0&reportClass=class-term-0');
  const label = kind === 'terms' ? 'academic terms' : kind;
  const retry = f.button(`Retry ${label}`); await retry.waitFor();
  check(await f.primary().isDisabled(), 'lookup failure disables primary');
  const text = await retry.locator('..').innerText();
  check(text.includes(fault === 'network' ? 'Check your connection' : fault === 403 ? 'permission' : fault === 500 ? 'server could not' : 'unexpected list'), 'specific actionable error');
  delete f.state.faults[kind]; await retry.click();
  const target = kind === 'terms' ? '#report-term option[value="term-0"]' : kind === 'classes' ? '#report-class option[value="class-term-0"]' : '#report-student option[value="student-term-0"]';
  await f.page.locator(target).waitFor({ state: 'attached' });
  check(await retry.count() === 0, 'retry recovers lookup'); check(f.writes().length === 0, 'retry has no generation');
});
for (const fault of ['network', 500, 403, 'malformed']) test(`report ${fault} and explicit retry`, { faults: { report: fault } }, async f => {
  await f.load(fullQuery()); await f.ready(); await f.primary().click();
  await f.selection.getByRole('alert').waitFor(); check(await f.page.locator('#printable-report').count() === 0, 'failed report not rendered');
  check(f.writes().length === 0, 'failed lookup does not generate'); delete f.state.faults.report;
  await f.view(); check(await f.page.getByRole('heading', { name: 'End of Term Report' }).isVisible(), 'explicit retry loads preview');
});
for (const term of terms) test(`Lifecycle ${term.status}: missing report`, { missing: true }, async f => {
  await f.load(fullQuery(term.id)); await f.ready(); await f.primary().click();
  if (['ACTIVE', 'CLOSING'].includes(term.status)) {
    await f.page.locator('#printable-report').waitFor();
    check(f.writes().length === 1 && f.writes()[0].endpoint === '/reports/generate' && f.writes()[0].body.termId === term.id, 'exact explicit generation request');
  } else {
    await f.selection.getByRole('alert').waitFor(); check(f.writes().length === 0, 'DRAFT/CLOSED missing report never generated');
    check((await f.selection.getByRole('alert').innerText()).includes(term.status === 'CLOSED' ? 'closed term' : 'active or closing'), 'lifecycle explanation');
  }
});
for (const status of ['FINALIZED', 'PUBLISHED', 'DRAFT']) test(`Existing ${status} report`, { reportStatus: status }, async f => {
  await f.load(fullQuery()); await f.view();
  check(f.writes().length === (status === 'DRAFT' ? 1 : 0), 'only writable DRAFT may regenerate');
  check(await f.page.locator('#printable-report').getByText(`${status === 'DRAFT' ? 'DRAFT' : status} report`, { exact: true }).isVisible(), 'correct preview status');
});
test('SECRETARY is read only', { role: 'SECRETARY', reportStatus: 'DRAFT' }, async f => {
  await f.load(fullQuery()); await f.view(); check(f.writes().length === 0, 'secretary never generates draft');
  check(await f.page.getByRole('button', { name: 'AI Parent Letter', exact: true }).count() === 0 && await f.page.getByRole('button', { name: 'Save Remarks', exact: true }).count() === 0, 'no AI/edit actions');
  check(await f.page.locator('#printable-report textarea').count() === 0, 'no editable remarks');
});
test('SECRETARY missing report and draft class stay read only', { role: 'SECRETARY', missing: true, reportStatus: 'DRAFT' }, async f => {
  await f.load(fullQuery()); await f.ready(); await f.primary().click(); await f.selection.getByRole('alert').waitFor();
  check(f.writes().length === 0, 'secretary cannot generate missing student report');
  await f.load(fullQuery('term-1', 'class')); await f.ready(); await f.primary().click(); await f.panel.getByRole('heading', { name: 'Class Results Sheet' }).waitFor();
  check(f.writes().length === 0 && await f.page.getByRole('button', { name: /Finalize class|Publish class/ }).count() === 0, 'secretary cannot generate or release class reports');
});
for (const term of ['term-2', 'term-3']) test(`Existing draft in ${term === 'term-2' ? 'CLOSED' : 'DRAFT'} is not regenerated`, { reportStatus: 'DRAFT' }, async f => {
  await f.load(fullQuery(term)); await f.view(); check(f.writes().length === 0, 'non-writable term never regenerates existing draft');
  check(await f.page.locator('#printable-report textarea').count() === 0, 'non-writable term has no editable remarks');
});
test('Loaded results clear on term/class change', {}, async f => {
  await f.load(fullQuery()); await f.view(); await f.page.locator('#report-term').selectOption('term-1');
  await f.page.locator('#report-class option[value="class-term-1"]').waitFor({ state: 'attached' });
  check(await f.page.locator('#printable-report').count() === 0 && await f.button('AI Parent Letter').count() === 0, 'previous report and AI action cleared');
  check(await f.page.locator('#report-class').inputValue() === '' && await f.page.locator('#report-student').inputValue() === '' && await f.primary().isDisabled(), 'term has no stale selections');
  await f.page.locator('#report-class').selectOption('class-term-1'); await f.page.locator('#report-student option[value="student-term-1"]').waitFor({ state: 'attached' });
  await f.page.locator('#report-student').selectOption('student-term-1'); await f.view(); await f.page.locator('#report-class').selectOption('');
  check(await f.page.locator('#printable-report').count() === 0 && await f.page.locator('#report-student').inputValue() === '', 'class reset clears loaded report and student');
  check(f.writes().length === 0, 'context changes never regenerate');
});
for (const kind of ['classes', 'students']) test(`Slow ${kind} race across terms`, { [kind === 'classes' ? 'holdClasses' : 'holdStudents']: 'term-0' }, async f => {
  const reached = f.state.waitUntilReached(kind);
  await f.load(kind === 'classes' ? '' : '&reportTerm=term-0&reportClass=class-term-0'); await reached;
  await f.page.locator('#report-term').selectOption('term-1');
  await f.page.locator('#report-class option[value="class-term-1"]').waitFor({ state: 'attached' });
  if (kind === 'students') { await f.page.locator('#report-class').selectOption('class-term-1'); await f.page.locator('#report-student option[value="student-term-1"]').waitFor({ state: 'attached' }); }
  f.state.release(kind); await f.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check(await f.page.locator('#report-class option[value="class-term-0"]').count() === 0, 'old class response never retained');
  check(await f.page.locator('#report-student option[value="student-term-0"]').count() === 0, 'old student response never retained');
});
test('Slow missing-report Back race suppresses follow-up generation', { holdReport: true, missing: true }, async f => {
  await f.load(); await f.choose(); const reached = f.state.waitUntilReached('report'); await f.primary().click(); await reached;
  check(await f.page.locator('#report-term').isDisabled() && await f.page.locator('#report-class').isDisabled() && await f.page.locator('#report-student').isDisabled(), 'busy locks selections');
  check((await f.page.locator('#report-action-hint').innerText()).includes('Loading or generating'), 'busy operation hint');
  await f.page.goBack(); const response = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/reports/student'); f.state.release('report'); await (await response).finished();
  await f.page.waitForFunction(() => !new URLSearchParams(location.search).has('reportStudent'));
  await f.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check(f.writes().length === 0 && await f.page.locator('#printable-report').count() === 0, 'stale operation neither generates nor displays report');
});
test('Slow existing-report Back race does not render stale preview', { holdReport: true }, async f => {
  await f.load(); await f.choose(); const reached = f.state.waitUntilReached('report'); await f.primary().click(); await reached;
  await f.page.goBack(); const response = f.page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/reports/student'); f.state.release('report'); await (await response).finished();
  await f.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check(await f.page.locator('#printable-report').count() === 0 && f.writes().length === 0, 'stale finalized response not rendered or regenerated');
});
test('Class results, finalized preservation, CSV/Excel downloads and print', {}, async f => {
  await f.load(fullQuery('term-0', 'class')); await f.ready(); await f.primary().click();
  await f.panel.getByRole('heading', { name: 'Class Results Sheet' }).waitFor();
  check(f.writes().length === 0, 'finalized class never regenerated');
  for (const type of ['CSV', 'Excel']) {
    await f.selection.locator('summary').click(); const downloaded = f.page.waitForEvent('download'); await f.button(`Export ${type}`).click(); const download = await downloaded;
    check(download.suggestedFilename().endsWith(type === 'CSV' ? '.csv' : '.xlsx'), `actual ${type} download filename`);
    const downloadedPath = await download.path(); check(fs.statSync(downloadedPath).size > 100, `actual ${type} download has content`);
    if (type === 'CSV') check(fs.readFileSync(downloadedPath, 'utf8').includes('Ada Mock term-0'), 'CSV contains student fixture');
    else { const XLSX = require('../node_modules/xlsx'); const book = XLSX.readFile(downloadedPath); check(XLSX.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]]).includes('Ada Mock term-0'), 'Excel contains student fixture'); }
  }
  await f.selection.locator('summary').click(); await f.button('Print class reports / PDF').click();
  await f.page.waitForFunction(() => window.__printCount === 1); check(f.writes().length === 0, 'exports/print keep released reports unchanged');
});
test('CLOSED empty class results never generated', { classEmpty: true }, async f => {
  await f.load(fullQuery('term-2', 'class')); await f.ready(); await f.primary().click(); await f.selection.getByRole('alert').waitFor();
  check(f.writes().length === 0 && (await f.selection.getByRole('alert').innerText()).includes('closed term'), 'closed class missing reports fail closed');
});
test('AI native dialog, sanitization, containment, Escape and return focus', {}, async f => {
  await f.load(fullQuery()); await f.view(); await f.button('AI Parent Letter').click();
  const dialog = f.page.getByRole('dialog', { name: 'AI Parent Letter' }); await dialog.waitFor();
  check(await dialog.evaluate(el => el.tagName === 'DIALOG' && el.matches(':modal')), 'native modal dialog');
  evidence.dialogInitialFocus = await dialog.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent, ariaLabel: document.activeElement.getAttribute('aria-label') }));
  observe(await dialog.getByRole('button', { name: 'Close parent letter' }).evaluate(el => el === document.activeElement), 'initial close focus');
  check(await dialog.locator('script,[onerror],a[href^="javascript:"]').count() === 0 && await f.page.evaluate(() => !window.__letterUnsafe), 'unsafe HTML removed and not executed');
  for (let i = 0; i < 6; i++) { await f.page.keyboard.press('Tab'); check(await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), `Tab ${i + 1} cannot reach background`); }
  for (let i = 0; i < 3; i++) { await f.page.keyboard.press('Shift+Tab'); check(await dialog.evaluate(el => el.contains(document.activeElement) || document.activeElement === document.body), `Shift+Tab ${i + 1} cannot reach background`); }
  await f.page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  check(await f.button('AI Parent Letter').evaluate(el => el === document.activeElement), 'Escape restores opener focus');
  check(f.writes().filter(c => c.endpoint === '/ai/parent-letter').length === 1, 'one explicit AI mock request');
});
test('AI letter print HTML sanitization and plain-text escaping', { plainLetter: '<script>unsafe()</script> & "quoted"', letterName: '<b>Ada</b>' }, async f => {
  await f.load(fullQuery()); await f.view(); await f.button('AI Parent Letter').click(); const dialog = f.page.getByRole('dialog', { name: 'AI Parent Letter' }); await dialog.waitFor();
  check(await dialog.locator('script').count() === 0 && (await dialog.innerText()).includes('<script>unsafe()</script>'), 'plain-text fallback is literal text, not markup');
  // Capture the real printParentLetter output through a local window.open seam.
  // This validates HTML construction/sanitization, not native print/PDF output.
  await f.page.evaluate(() => { window.__letterPrint = { html: '', printed: false }; window.open = () => ({ document: { write: html => { window.__letterPrint.html = html; }, close() {} }, print: () => { window.__letterPrint.printed = true; } }); });
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  const printed = await f.page.evaluate(() => window.__letterPrint);
  check(printed.printed && printed.html.includes('&lt;script&gt;unsafe()&lt;/script&gt;') && printed.html.includes('&lt;b&gt;Ada&lt;/b&gt;'), 'plain-text and title escaped in print document');
  await f.page.keyboard.press('Escape'); f.state.plainLetter = ''; await f.button('AI Parent Letter').click(); await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  const safePrint = await f.page.evaluate(() => window.__letterPrint.html);
  check(!/<script|onerror|javascript:/i.test(safePrint) && safePrint.includes('Safe letter content'), 'HTML print document sanitized');
});
for (const width of [375, 768, 1024, 1440]) for (const theme of ['light', 'dark']) {
  test(`Workspace responsive ${width} ${theme}`, {}, async f => {
    await f.page.setViewportSize({ width, height: 1000 }); await f.page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await f.load(fullQuery()); await f.ready(); await geometry(f, 'selection workspace', width, theme);
    if (width === 375 || width === 1440) await f.page.screenshot({ path: path.join(output, `workspace-${width}-${theme}.png`), fullPage: true });
  });
  test(`Existing student preview responsive ${width} ${theme}`, {}, async f => {
    await f.page.setViewportSize({ width, height: 1000 }); await f.page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await f.load(fullQuery()); await f.view(); await f.page.screenshot({ path: path.join(output, `student-${width}-${theme}.png`), fullPage: true });
    await geometry(f, 'existing StudentReportCard', width, theme, '#printable-report');
  });
  test(`Existing class sheet responsive ${width} ${theme}`, {}, async f => {
    await f.page.setViewportSize({ width, height: 1000 }); await f.page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await f.load(fullQuery('term-0', 'class')); await f.ready(); await f.primary().click(); await f.panel.getByRole('heading', { name: 'Class Results Sheet' }).waitFor();
    await f.page.screenshot({ path: path.join(output, `class-${width}-${theme}.png`), fullPage: true });
    await geometry(f, 'existing ClassBroadsheet', width, theme, '.printable-content');
  });
  test(`AI dialog responsive ${width} ${theme}`, {}, async f => {
    await f.page.setViewportSize({ width, height: 1000 }); await f.page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await f.load(fullQuery()); await f.view(); await f.button('AI Parent Letter').click(); await f.page.locator('dialog[open]').waitFor();
    await f.page.screenshot({ path: path.join(output, `dialog-${width}-${theme}.png`) });
    // Dialog's own geometry is tested separately from underlying existing report overflow.
    const d = await f.page.locator('dialog[open]').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, client: el.clientWidth, scroll: el.scrollWidth, dark: document.documentElement.classList.contains('dark'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, animations: el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length }; });
    evidence.geometry.push({ label: 'native AI dialog', width, theme, ...d });
    check(d.left >= 0 && d.right <= width && d.scroll <= d.client, 'dialog fits viewport without overflow');
    check(d.dark === (theme === 'dark') && d.reduced && d.animations === 0, 'dialog actual theme and reduced motion');
  });
}
(async () => {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  const cachedChrome = fs.readdirSync(cache).filter(name => /^chromium-\d+$/.test(name))
    .map(name => path.join(cache, name, 'chrome-win64/chrome.exe')).find(file => fs.existsSync(file));
  if (!cachedChrome) throw new Error('Cached Chromium executable not found; no download allowed');
  const browser = await chromium.launch({ headless: true, executablePath: cachedChrome }); evidence.browser = browser.version();
  try {
    for (const t of tests.filter(t => !process.env.REPORT_TEST_FILTER || t.name.includes(process.env.REPORT_TEST_FILTER))) {
      scenarioName = t.name; let f; const before = evidence.assertions.length; const start = Date.now();
      try { f = await fixture(browser, t.options); await t.run(f); const failed = evidence.assertions.slice(before).filter(a => !a.passed); evidence.scenarios.push({ name: t.name, passed: failed.length === 0, ...(failed.length ? { failure: failed.map(a => a.message).join('; ') } : {}), assertions: evidence.assertions.length - before, durationMs: Date.now() - start }); console.log(`${failed.length ? 'FAIL' : 'PASS'} ${t.name}`); }
      catch (error) { evidence.scenarios.push({ name: t.name, passed: false, failure: error.message, assertions: evidence.assertions.length - before, durationMs: Date.now() - start }); console.log(`FAIL ${t.name}: ${error.message}`); if (f) await f.page.screenshot({ path: path.join(output, `failure-${evidence.scenarios.length}.png`), fullPage: true }).catch(() => {}); }
      finally { if (f) { f.state.release('classes'); f.state.release('students'); f.state.release('report'); await f.context.close(); } }
    }
    scenarioName = 'Safety and runtime';
    check(evidence.pageErrors.length === 0, 'no uncaught browser errors');
    check(evidence.unexpected.length === 0, 'no unexpected API mutation');
    check(!evidence.calls.some(c => /backfill|cutover|term-rollovers|activate|execute/.test(c.endpoint)), 'no restricted operation requested');
  } finally {
    await browser.close(); evidence.summary = { scenarios: evidence.scenarios.length, passed: evidence.scenarios.filter(t => t.passed).length, failed: evidence.scenarios.filter(t => !t.passed).length, assertions: evidence.assertions.length, assertionsPassed: evidence.assertions.filter(a => a.passed).length, assertionsFailed: evidence.assertions.filter(a => !a.passed).length, pageErrors: evidence.pageErrors.length, denied: evidence.denied.length, unexpected: evidence.unexpected.length };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence.summary, null, 2));
    process.exitCode = evidence.summary.failed || evidence.summary.assertionsFailed ? 1 : 0;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });