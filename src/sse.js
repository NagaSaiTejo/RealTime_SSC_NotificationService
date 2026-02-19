const db = require('./db');

// In-memory store for active connections
// List of objects: {userId, res, channels: Set<string>}
const clients = [];

/**
 * Sends an SSE message to a specific response object
 */
const sendSSE = (res, id, event, data) => {
    res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
};

/**
 * setupSSEEndpoint
 * Handles GET /api/events/stream
 */
const setupSSEEndpoint = async (req, res) => {
    const { userId, channels } = req.query;

    if (!userId || !channels) {
        return res.status(400).json({ error: 'Missing userId or channels' });
    }

    // Parse channels
    const requestedChannels = channels.split(',').map(c => c.trim());
    const requestedChannelsSet = new Set(requestedChannels);

    try {
        // 11. Verify Subscriptions
        // We need to check if the user is subscribed to ALL requested channels or ANY?
        // "Users must only receive events for channels they are actively subscribed to"
        // "The system must check that the user is subscribed to these channels"
        // Interpretation: Filter requestedChannels to only those the user is actually subscribed to.

        const result = await db.query(
            'SELECT channel FROM user_subscriptions WHERE user_id = $1 AND channel = ANY($2)',
            [userId, requestedChannels]
        );

        const authorizedChannels = result.rows.map(r => r.channel);
        const authorizedChannelsSet = new Set(authorizedChannels);

        if (authorizedChannels.length === 0) {
            // If not subscribed to any of the requested channels, maybe return error or just stream nothing?
            // Let's allow connection but they won't receive anything, or return 403? 
            // Requirement says "The system must check". Let's assume we clean the list.
            console.log(`User ${userId} requested ${channels} but is only subscribed to ${authorizedChannels.join(',')}`);
        }

        // Headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            // CORS headers might be needed here if not handled globally, but app.use(cors()) handles it for preflight. 
            // For SSE, usually standard CORS works.
        });

        // 10. Event Replay
        const lastEventId = req.headers['last-event-id'];
        if (lastEventId) {
            const replayResult = await db.query(
                'SELECT * FROM events WHERE channel = ANY($1) AND id > $2 ORDER BY id ASC',
                [authorizedChannels, lastEventId]
            );

            for (const row of replayResult.rows) {
                sendSSE(res, row.id, row.event_type, row.payload);
            }
        }

        // Add to active clients
        const client = {
            userId,
            res,
            channels: authorizedChannelsSet
        };
        clients.push(client);

        // 9. Heartbeat
        const heartbeatInterval = setInterval(() => {
            res.write(': heartbeat\n\n');
        }, 30000); // 30 seconds

        // Clean up on close
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            const index = clients.indexOf(client);
            if (index !== -1) {
                clients.splice(index, 1);
            }
        });

    } catch (err) {
        console.error('SSE Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

/**
 * publishToClients
 * Broadcasts an event to all connected clients who are subscribed to the channel
 */
const publishToClients = (channel, event) => {
    // event object should have: id, event_type, payload
    // Map DB fields if necessary. The 'savedEvent' passed from index.js is raw DB row.

    const id = event.id;
    const eventType = event.event_type || event.eventType; // Handle both snake_case (DB) and camelCase
    const payload = event.payload;

    clients.forEach(client => {
        if (client.channels.has(channel)) {
            sendSSE(client.res, id, eventType, payload);
        }
    });
};

module.exports = {
    setupSSEEndpoint,
    publishToClients
};
