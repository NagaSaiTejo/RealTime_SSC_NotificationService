const http = require('http');

const BASE_URL = 'http://localhost:8080';

const request = (method, path, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const options = {
            method,
            hostname: 'localhost',
            port: 8080,
            path,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data ? JSON.parse(data) : null,
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

const runTest = async () => {
    console.log('Starting Verification...');

    // 1. Health Check
    try {
        const health = await request('GET', '/health');
        if (health.statusCode !== 200) throw new Error(`Health check failed: ${health.statusCode}`);
        console.log('✅ Health Check passed');
    } catch (e) {
        console.error('❌ Health Check failed', e);
        process.exit(1);
    }

    // 2. Subscribe
    try {
        const sub = await request('POST', '/api/events/channels/subscribe', { userId: 1, channel: 'test-verify' });
        if (sub.statusCode !== 201 && sub.statusCode !== 200) throw new Error(`Subscribe failed: ${sub.statusCode}`); // 201 or 200 depending on impl (201 in my code)
        console.log('✅ Subscribe passed');
    } catch (e) {
        console.error('❌ Subscribe failed', e);
        process.exit(1);
    }

    // 3. SSE Stream & 4. Publish
    console.log('Testing SSE Stream...');

    const eventsReceived = [];
    const done = new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/api/events/stream?userId=1&channels=test-verify',
            method: 'GET',
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`SSE connection failed: ${res.statusCode}`));
                return;
            }
            console.log('✅ SSE Connected');

            res.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.substring(6));
                        eventsReceived.push(data);
                        console.log('Received Event:', data);
                        if (data.msg === 'test-msg') {
                            // We got our message!
                            req.destroy(); // Close connection
                            resolve();
                        }
                    }
                }
            });
        });

        req.on('error', reject);
        req.end();

        // Give it a moment to connect, then publish
        setTimeout(async () => {
            try {
                const pub = await request('POST', '/api/events/publish', {
                    channel: 'test-verify',
                    eventType: 'TEST_EVENT',
                    payload: { msg: 'test-msg' }
                });
                if (pub.statusCode !== 202) throw new Error(`Publish failed: ${pub.statusCode}`);
                console.log('✅ Event Published');
            } catch (e) {
                reject(e);
            }
        }, 1000);

        // Timeout
        setTimeout(() => {
            reject(new Error('Timeout waiting for event'));
        }, 5000);
    });

    try {
        await done;
        console.log('✅ Real-time delivery passed');
    } catch (e) {
        console.error('❌ Real-time delivery failed', e);
        process.exit(1);
    }

    // 5. Replay
    console.log('Testing Replay...');
    try {
        // Find the ID of the event we just received (we assume it's the last one in DB or we can check history, but for verify we can just ask for > 0 if we assume sequential)
        // Actually, let's fetch history to get the ID of the event we just published.
        // Or we can just publish another one, get its ID from a history call, then ask for > ID.
        // Let's use history endpoint to find the ID of the event 'test-msg'.

        const history = await request('GET', '/api/events/history?channel=test-verify');
        const event = history.body.events.find(e => e.payload.msg === 'test-msg');
        if (!event) throw new Error('Could not find published event in history');

        const lastId = event.id;
        console.log(`Found event ID: ${lastId}. Requesting replay after ID ${lastId - 1}...`);

        // Request replay from before this event
        const replayReq = new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: 8080,
                path: '/api/events/stream?userId=1&channels=test-verify',
                method: 'GET',
                headers: {
                    'Last-Event-ID': (lastId - 1).toString()
                }
            }, res => {
                let found = false;
                res.on('data', chunk => {
                    const text = chunk.toString();
                    if (text.includes(`"msg":"test-msg"`)) {
                        found = true;
                        req.destroy();
                        resolve();
                    }
                });
            });
            req.on('error', reject);
            req.end();

            setTimeout(() => reject(new Error('Timeout waiting for replay')), 5000);
        });

        await replayReq;
        console.log('✅ Event Replay passed');

    } catch (e) {
        console.error('❌ Replay failed', e);
        // Don't exit yet, check other things? No, replay is critical.
        process.exit(1);
    }

    console.log('🎉 All Tests Passed!');
};

runTest();
