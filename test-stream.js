const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/workflows/execute-stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk.toString()}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(JSON.stringify({
  workflow: {
    name: 'Test Workflow',
    nodes: [
      { id: '1', type: 'manual_trigger', parameters: {} },
      { id: '2', type: 'set', parameters: { key: 'value' } }
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' }
    ]
  },
  initialPayload: {}
}));
req.end();
