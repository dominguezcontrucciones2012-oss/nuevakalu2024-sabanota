import http from 'http';

async function test(urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + urlPath, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

(async () => {
  const routes = ['/admin', '/cliente', '/productor', '/portal.html', '/?portal=cliente', '/?portal=productor'];
  console.log('--- TEST ROUTES ---');
  for (const r of routes) {
    const res = await test(r);
    console.log(r, '-> HTTP', res.status, res.body.includes('id="root"') ? '(SPA OK)' : '(NO ROOT)');
  }

  const manifests = ['/manifest-admin.json', '/manifest-client.json', '/manifest-producer.json'];
  console.log('\n--- TEST MANIFESTS ---');
  for (const m of manifests) {
    const res = await test(m);
    const json = JSON.parse(res.body);
    console.log(m, '->', JSON.stringify({ id: json.id, name: json.name, short_name: json.short_name, start_url: json.start_url, scope: json.scope }, null, 2));
  }
})();
