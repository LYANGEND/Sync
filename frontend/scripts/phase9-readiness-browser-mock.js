// Playwright browser-tool function expression; no backend, database, or cloud access.
// Execute with the browser tool's filename option against a blank browser page.
async (page) => {
  const origin = 'http://127.0.0.1:5199';
  page = await page.context().browser().newPage({ serviceWorkers: 'block' });
  const id = '90000000-0000-4000-8000-000000000009';
  const fingerprint = 'a'.repeat(64);
  const user = { id: '10000000-0000-4000-8000-000000000001', email: 'phase9-browser@example.invalid', fullName: 'MOCK Readiness Admin', role: 'SUPER_ADMIN' };
  const state = { mode: 'blocked', stage: 0, calls: [], denied: [], errors: [], checks: [], matrix: [] };
  const check = (condition, name) => {
    state.checks.push({ name, passed: !!condition });
    if (!condition) throw new Error(`Validation failed: ${name}`);
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const section = page.locator('section[aria-labelledby="readiness-heading"]');
  const report = () => {
    const issues = [
      ...(state.mode === 'blocked' ? [{ id: 'b'.repeat(64), code: 'ACADEMIC_REPORT_NOT_RELEASED', severity: 'BLOCKER', message: 'MOCK: release the finalized source report before readiness approval.', affectedRecords: [{ entityType: 'StudentTermReport', entityId: 'report-mock-' + 'x'.repeat(100) }], remediationLink: '/academics/report-cards' }] : []),
      { id: 'c'.repeat(64), code: 'UNPAID_BALANCE', severity: 'WARNING', message: 'MOCK: unpaid balances remain collectible after rollover.', affectedRecords: [{ entityType: 'Student', entityId: 'student-mock' }], remediationLink: '/finance' },
      { id: 'd'.repeat(64), code: 'LEGACY_REVIEW_REQUIRED', severity: 'WARNING', message: 'MOCK: review legacy finance evidence.', affectedRecords: [], remediationLink: 'https://example.invalid/unsafe' },
    ];
    return { rolloverId: state.mode === 'mismatch' ? 'wrong-rollover' : id, fingerprint: state.mode === 'stale' ? 'e'.repeat(64) : fingerprint, warningHash: 'f'.repeat(64), summary: { blockerCount: state.mode === 'blocked' ? 1 : 0, warningCount: 2 }, issues,
      evidence: { current: state.mode !== 'stale', warningsAcknowledged: state.stage >= 1, backupVerified: state.stage >= 3, approved: state.stage >= 4,
        ...(state.stage >= 2 ? { backupReference: 'MOCK-PRIVATE-REFERENCE-NOT-FOR-DISPLAY', backupChecksum: '1'.repeat(64) } : {}),
        ...(state.stage >= 3 ? { backupVerifiedAt: '2026-10-06T12:00:00.000Z' } : {}) },
      canApprove: !['blocked', 'stale'].includes(state.mode) && state.stage === 3 };
  };
  const readyRow = status => ({ id, status, transitionType: 'WITHIN_YEAR', sourceTerm: { id: 'source', name: '2046 Term 1', status: 'CLOSING' }, targetTerm: { id: 'target', name: '2046 Term 2', status: 'DRAFT' } });
  const routeHandler = async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) { state.denied.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/socket.io')) return route.continue();
    const path = url.pathname.replace('/api/v1', '');
    const entry = { path, method: request.method(), body: request.postData() ? request.postDataJSON() : null };
    state.calls.push(entry);
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/profile') return json(user);
    if (path === '/settings/public') return json({ schoolName: 'MOCK Phase 9 School', primaryColor: '#1A3A9C', secondaryColor: '#475569', accentColor: '#FF9933' });
    if (path === '/branches') return json([]);
    if (path === '/term-rollovers') return json(state.mode === 'empty' ? [] : [readyRow(state.stage === 4 ? 'READY' : 'PREPARED'), { ...readyRow('READY'), id: '90000000-0000-4000-8000-000000000008' }, { ...readyRow('DRAFT'), id: '90000000-0000-4000-8000-000000000007' }, { ...readyRow('EXECUTED'), id: '90000000-0000-4000-8000-000000000006' }]);
    if (path.startsWith('/term-rollovers/')) {
      const op = path.split('/').pop();
      const methods = { preflight: 'POST', 'warning-acknowledgements': 'PUT', backup: 'POST', 'verify-backup': 'POST', approve: 'POST' };
      if (!methods[op] || !path.startsWith(`/term-rollovers/${id}/`)) { state.denied.push(url.href); return route.abort(); }
      check(request.method() === methods[op], `${op}: HTTP method`);
      if (op !== 'preflight') check(entry.body.expectedFingerprint === fingerprint, `${op}: reviewed expectedFingerprint`);
      if (op === 'warning-acknowledgements') {
        check(JSON.stringify(entry.body.acknowledgements) === JSON.stringify([{ warningId: 'c'.repeat(64), reason: 'Debt remains collectible; reviewed by finance.' }, { warningId: 'd'.repeat(64), reason: 'Legacy evidence reviewed and accepted.' }]), 'warning payload: complete IDs and trimmed reasons');
        state.stage = 1;
      }
      if (op === 'backup') state.stage = 2;
      if (op === 'verify-backup') state.stage = 3;
      if (op === 'approve') {
        if (state.mode === 'reject') { state.mode = 'stale'; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'MOCK: reviewed fingerprint is stale', code: 'STALE_PREFLIGHT' }) }); }
        state.stage = 4;
      }
      return json(report());
    }
    // Shell dependencies are mocked too; no API request is ever passed through.
    return json(path.includes('notifications') ? { notifications: [], unreadCount: 0 } : []);
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', routeHandler);
  if (page.context().routeWebSocket) await page.context().routeWebSocket('**/*', socket => socket.close());
  await page.context().addInitScript(({ user, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('token', 'mock-browser-only');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('theme', 'system');
    localStorage.setItem('pwa-install-dismissed', 'true');
  }, { user, origin });
  const load = async () => {
    await page.goto(`${origin}/academics?tab=rollover-readiness`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Ready is not active.' }).waitFor();
    await button('Run preflight').waitFor();
    await page.waitForFunction(() => !document.querySelector('#readiness-rollover')?.disabled);
  };
  const preflight = async () => { await button('Run preflight').click(); await section.getByText('Reviewed fingerprint', { exact: true }).waitFor(); };
  const layout = async (name, width, theme) => {
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-labelledby="readiness-heading"]');
      const dialog = document.querySelector('dialog[open]');
      const rect = panel.getBoundingClientRect();
      const d = dialog?.getBoundingClientRect();
      return { viewport: innerWidth, document: document.documentElement.scrollWidth, panel: { left: rect.left, right: rect.right, client: panel.clientWidth, scroll: panel.scrollWidth }, dialog: d ? { left: d.left, right: d.right, client: dialog.clientWidth, scroll: dialog.scrollWidth } : null, dark: document.documentElement.classList.contains('dark'), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, runningPanelAnimations: panel.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length };
    });
    state.matrix.push({ name, width, theme, ...geometry });
    check(geometry.document <= width && geometry.panel.scroll <= geometry.panel.client && geometry.panel.left >= 0 && geometry.panel.right <= width, `${name}: no document/panel horizontal overflow`);
    if (geometry.dialog) check(geometry.dialog.left >= 0 && geometry.dialog.right <= width && geometry.dialog.scroll <= geometry.dialog.client, `${name}: dialog fits viewport`);
    check(geometry.dark === (theme === 'dark'), `${name}: actual ${theme} class`);
    check(geometry.reducedMotion && geometry.runningPanelAnimations === 0, `${name}: reduced motion / no running panel animations`);
  };
  try {
    for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
      const label = `${width}-${theme}`;
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      state.mode = 'blocked'; state.stage = 0;
      await load();
      check(await page.locator('#readiness-rollover option').count() === 3, `${label}: only PREPARED/READY listed`);
      check(!(await section.getByText('Reviewed fingerprint', { exact: true }).count()), `${label}: selection does not auto-preflight`);
      await preflight();
      check(await button('Approve as READY').isDisabled() && await button('Create protected external backup').isDisabled(), `${label}: blocker gates backup and approval`);
      await section.locator('summary').first().click();
      check(await section.getByText('report-mock-' + 'x'.repeat(100), { exact: true }).isVisible(), `${label}: affected-record detail`);
      check(await section.locator('a[href="https://example.invalid/unsafe"]').count() === 0, `${label}: unsafe remediation omitted`);
      await layout(`${label}-blockers`, width, theme);
      state.mode = 'clear';
      await preflight();
      check(await button('Acknowledge all 2 warnings').isDisabled(), `${label}: empty reasons disabled`);
      const reasons = section.getByRole('textbox');
      await reasons.nth(0).fill('   ');
      await reasons.nth(1).fill('Legacy evidence reviewed and accepted.');
      check(await button('Acknowledge all 2 warnings').isDisabled(), `${label}: whitespace reason disabled`);
      await reasons.nth(0).fill('x'.repeat(501));
      check((await reasons.nth(0).inputValue()).length === 500, `${label}: reason capped at 500`);
      await reasons.nth(0).fill('  Debt remains collectible; reviewed by finance.  ');
      await button('Refresh evidence').click();
      await section.getByText('Current preflight and evidence refreshed. Review the findings before continuing.', { exact: true }).waitFor();
      check(await reasons.nth(0).inputValue() === '' && await reasons.nth(1).inputValue() === '', `${label}: refresh clears unsubmitted reasons`);
      await reasons.nth(0).fill('  Debt remains collectible; reviewed by finance.  ');
      await reasons.nth(1).fill('Legacy evidence reviewed and accepted.');
      await button('Acknowledge all 2 warnings').click();
      await section.getByText('All current warnings acknowledged with reasons for this fingerprint.', { exact: true }).waitFor();
      check(await button('Approve as READY').isDisabled(), `${label}: acknowledgements alone insufficient`);
      await button('Create protected external backup').click();
      await section.getByText('Protected external backup created. Reverify it before approval.', { exact: true }).waitFor();
      check(await button('Approve as READY').isDisabled(), `${label}: unverified backup insufficient`);
      check(!(await section.innerText()).includes('MOCK-PRIVATE-REFERENCE-NOT-FOR-DISPLAY'), `${label}: protected reference withheld`);
      await button('Reverify backup').click();
      await section.getByText('Backup checksum and manifest reverified by the server.', { exact: true }).waitFor();
      check(await button('Approve as READY').isEnabled(), `${label}: verified current evidence enables confirmation`);
      await button('Approve as READY').click();
      const modal = page.getByRole('dialog', { name: 'Approve this rollover as READY?' });
      await modal.waitFor();
      check((await modal.innerText()).includes('no activation, source closure, cutover or execution'), `${label}: READY-only confirmation copy`);
      check(await modal.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), `${label}: initial Cancel focus`);
      check(await page.locator('#readiness-rollover').isDisabled() && await button('Run preflight').isDisabled(), `${label}: modal locks background controls`);
      await layout(`${label}-confirmation`, width, theme);
      if (label === '375-dark' || label === '1440-light') await page.screenshot({ path: `D:/livingilabs/Sync/docs/operations/phase9-readiness-mock-${label}.png` });
      const approveCalls = () => state.calls.filter(c => c.path.endsWith('/approve')).length;
      const beforeCancel = approveCalls();
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' });
      check(approveCalls() === beforeCancel, `${label}: Escape does not approve`);
      check(await button('Approve as READY').evaluate(el => el === document.activeElement), `${label}: focus restored after Escape`);
      await button('Approve as READY').click();
      await modal.getByRole('button', { name: 'Confirm READY approval', exact: true }).click();
      await section.getByRole('heading', { name: 'Approved as READY', exact: true }).waitFor();
      check(approveCalls() === beforeCancel + 1, `${label}: one explicit approval request`);
      check(await button('Approve as READY').isDisabled(), `${label}: approved READY cannot reapprove`);
      check((await section.innerText()).includes('No term was activated and no cutover was performed.'), `${label}: READY success copy`);
      check((await section.innerText()).includes('2046 Term 1 (CLOSING)') && (await section.innerText()).includes('2046 Term 2 (DRAFT)'), `${label}: unchanged lifecycle display (mock)`);
      await layout(`${label}-ready`, width, theme);
    }
    state.mode = 'reject'; state.stage = 3;
    await load(); await preflight();
    const beforeReject = state.calls.filter(c => c.path.endsWith('/approve')).length;
    await button('Approve as READY').click();
    await button('Confirm READY approval').click();
    await section.getByRole('alert').waitFor();
    check((await section.getByRole('alert').innerText()).includes('Current evidence refreshed'), '409: evidence refresh and explicit retry notice');
    check(await button('Approve as READY').isDisabled(), '409: stale evidence prevents approval');
    check(state.calls.filter(c => c.path.endsWith('/approve')).length === beforeReject + 1, '409: no automatic approval retry');
    check(await section.getByText('Evidence is stale. Refresh before taking any action.', { exact: true }).isVisible(), 'stale-evidence notice');
    state.mode = 'mismatch'; state.stage = 0;
    await load(); await button('Run preflight').click();
    await section.getByRole('alert').waitFor();
    check((await section.getByRole('alert').innerText()).includes('Readiness evidence is unavailable'), 'mismatched rollover response fails closed');
    check(await section.getByText('Reviewed fingerprint', { exact: true }).count() === 0, 'mismatched response never retained');
    state.mode = 'empty';
    await load();
    await section.getByRole('heading', { name: 'No prepared rollovers available' }).waitFor();
    check(await button('Run preflight').isDisabled(), 'empty eligible-list disables preflight');
    check(!state.calls.some(c => /activate|execute|cutover|stage-enrollments|prepare$/.test(c.path)), 'no Phase 10 or staging/preparation requests');
    check(state.errors.length === 0, 'no uncaught browser page errors');
    return { label: 'REAL CHROMIUM BROWSER / MOCK API ONLY — NOT LIVE BACKEND ACCEPTANCE', browser: page.context().browser()?.version(), checks: state.checks, matrix: state.matrix, readinessCalls: state.calls.filter(c => c.path.startsWith('/term-rollovers')), otherMockedPaths: [...new Set(state.calls.filter(c => !c.path.startsWith('/term-rollovers')).map(c => c.path))], denied: state.denied, errors: state.errors };
  } catch (error) {
    return { label: 'MOCK API ONLY', failure: error.message, url: page.url(), checks: state.checks, matrix: state.matrix, calls: state.calls, denied: state.denied, errors: state.errors };
  } finally {
    await page.context().close();
  }
}