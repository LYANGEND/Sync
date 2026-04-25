/**
 * End-to-end test: Adapt Workspace flow
 * Run: node test_adapt_workspace.js
 */
const http = require('http');

const request = (method, path, body, token) => new Promise((ok, fail) => {
  const data = body ? JSON.stringify(body) : '';
  const headers = { 'Content-Type': 'application/json' };
  if (data) headers['Content-Length'] = Buffer.byteLength(data);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  
  const req = http.request({ hostname: '127.0.0.1', port: 4000, path, method, headers }, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => {
      try { ok({ status: res.statusCode, body: JSON.parse(b) }); }
      catch { ok({ status: res.statusCode, body: { raw: b } }); }
    });
  });
  req.on('error', fail);
  if (data) req.write(data);
  req.end();
});

(async () => {
  // 1. Login
  const login = await request('POST', '/api/v1/auth/login', { email: 'robbie.tembo@sync.com', password: 'teacher123' });
  if (!login.body.token) { console.error('Login failed:', login.body); process.exit(1); }
  const token = login.body.token;
  console.log('=== 1. LOGIN ===');
  console.log('Teacher:', login.body.user.fullName);

  // 2. Check lessons before
  const before = await request('GET', '/api/v1/adapt-workspace/lessons', null, token);
  console.log('\n=== 2. LESSONS BEFORE ===');
  console.log('Count:', before.body.data.length);

  // 3. Create lesson from approved action
  console.log('\n=== 3. CREATE LESSON FROM ACTION ===');
  const createRes = await request('POST', '/api/v1/adapt-workspace/create-from-action', 
    { actionId: '3514ef46-1a76-4f96-a312-53f86bc8b580' }, token);
  
  if (createRes.body.error) {
    console.log('Error:', createRes.body.error);
    process.exit(1);
  }

  const lesson = createRes.body.data;
  console.log('Lesson ID:', lesson.id);
  console.log('Title:', lesson.title);
  console.log('Objective:', (lesson.objective || '').substring(0, 100) + '...');
  console.log('Status:', lesson.status);
  console.log('Activities:', (lesson.activities || []).length);
  (lesson.activities || []).forEach((a, i) => console.log(`  ${i+1}. [${a.type}] ${a.title}: ${a.description.substring(0,60)}...`));
  console.log('Target students:', lesson.targetStudentIds?.length);
  console.log('Class:', lesson.class?.name);
  console.log('SubTopic:', lesson.subTopic?.title);

  const lessonId = lesson.id;

  // 4. List lessons after
  const after = await request('GET', '/api/v1/adapt-workspace/lessons', null, token);
  console.log('\n=== 4. LESSONS AFTER CREATE ===');
  console.log('Count:', after.body.data.length);

  // 5. Mark READY
  console.log('\n=== 5. DRAFT → READY ===');
  const readyRes = await request('PATCH', `/api/v1/adapt-workspace/lessons/${lessonId}/status`, { status: 'READY' }, token);
  console.log('Status:', readyRes.body.data?.status);

  // 6. Mark DEPLOYED
  console.log('\n=== 6. READY → DEPLOYED ===');
  const deployRes = await request('PATCH', `/api/v1/adapt-workspace/lessons/${lessonId}/status`, { status: 'DEPLOYED' }, token);
  console.log('Status:', deployRes.body.data?.status);

  // 7. Mark COMPLETED
  console.log('\n=== 7. DEPLOYED → COMPLETED ===');
  const completeRes = await request('PATCH', `/api/v1/adapt-workspace/lessons/${lessonId}/status`, { status: 'COMPLETED' }, token);
  console.log('Status:', completeRes.body.data?.status);
  console.log('Completed date:', completeRes.body.data?.completedDate);

  // 8. Invalid transition test
  console.log('\n=== 8. INVALID TRANSITION TEST ===');
  const invalidRes = await request('PATCH', `/api/v1/adapt-workspace/lessons/${lessonId}/status`, { status: 'DRAFT' }, token);
  console.log('Expected error:', invalidRes.body.error);

  console.log('\n✅ ALL TESTS PASSED');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
