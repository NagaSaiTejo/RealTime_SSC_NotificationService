const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const { setupSSEEndpoint, publishToClients } = require('./sse');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// Health Check
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ status: 'OK' });
    } catch (err) {
        console.error('Health check failed', err);
        res.status(503).send('Database Disconnected');
    }
});

// --- API Endpoints ---

// 5. Publish Event
app.post('/api/events/publish', async (req, res) => {
    const { channel, eventType, payload } = req.body;

    if (!channel || !eventType || !payload) {
        return res.status(400).json({ error: 'Missing required fields: channel, eventType, payload' });
    }

    try {
        // Persist to DB
        const result = await db.query(
            'INSERT INTO events (channel, event_type, payload) VALUES ($1, $2, $3) RETURNING *',
            [channel, eventType, JSON.stringify(payload)]
        );
        const savedEvent = result.rows[0];

        // Push to active subscribers
        publishToClients(channel, savedEvent);

        res.status(202).send();
    } catch (err) {
        console.error('Error publishing event:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 6. Subscribe
app.post('/api/events/channels/subscribe', async (req, res) => {
    const { userId, channel } = req.body;

    if (!userId || !channel) {
        return res.status(400).json({ error: 'Missing userId or channel' });
    }

    try {
        await db.query(
            'INSERT INTO user_subscriptions (user_id, channel) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, channel]
        );
        res.status(201).json({ status: 'subscribed', userId, channel });
    } catch (err) {
        console.error('Error subscribing:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 7. Unsubscribe
app.post('/api/events/channels/unsubscribe', async (req, res) => {
    const { userId, channel } = req.body;

    if (!userId || !channel) {
        return res.status(400).json({ error: 'Missing userId or channel' });
    }

    try {
        await db.query(
            'DELETE FROM user_subscriptions WHERE user_id = $1 AND channel = $2',
            [userId, channel]
        );
        res.status(200).json({ status: 'unsubscribed', userId, channel });
    } catch (err) {
        console.error('Error unsubscribing:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 12. History (Paginated)
app.get('/api/events/history', async (req, res) => {
    const { channel, afterId, limit = 50 } = req.query;

    if (!channel) {
        return res.status(400).json({ error: 'Missing channel parameter' });
    }

    try {
        let query = 'SELECT * FROM events WHERE channel = $1';
        const params = [channel];

        if (afterId) {
            query += ' AND id > $2';
            params.push(afterId);
        }

        query += ` ORDER BY id ASC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await db.query(query, params);

        // Map snake_case database fields to camelCase for response if needed, 
        // or just return as is but the requirement example showed camelCase in response?
        // Req: "events": [{"id": 102, "channel": "notifications", "eventType": "USER_NOTIFICATION", ...}]
        // DB: event_type, created_at
        // I should map them.

        const events = result.rows.map(row => ({
            id: row.id,
            channel: row.channel,
            eventType: row.event_type,
            payload: row.payload,
            createdAt: row.created_at
        }));

        res.status(200).json({ events });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SSE Endpoint
app.get('/api/events/stream', setupSSEEndpoint);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
