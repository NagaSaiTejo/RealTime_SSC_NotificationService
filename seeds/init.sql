-- Create users table (Implicit requirement for user existence)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for replay performance
CREATE INDEX IF NOT EXISTS idx_events_channel_id ON events (channel, id);

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id INTEGER NOT NULL REFERENCES users(id),
  channel VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel)
);

-- Seed Data

-- Users
INSERT INTO users (id, name) VALUES (1, 'Test User 1') ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, name) VALUES (2, 'Test User 2') ON CONFLICT (id) DO NOTHING;
-- Reset sequence to avoid collisions if auto-increment is used later
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Subscriptions
INSERT INTO user_subscriptions (user_id, channel) VALUES (1, 'general') ON CONFLICT DO NOTHING;
INSERT INTO user_subscriptions (user_id, channel) VALUES (1, 'alerts') ON CONFLICT DO NOTHING;
INSERT INTO user_subscriptions (user_id, channel) VALUES (2, 'general') ON CONFLICT DO NOTHING;

-- Initial Events
INSERT INTO events (channel, event_type, payload) VALUES 
('general', 'WELCOME', '{"msg": "Welcome to the general channel"}'),
('alerts', 'SYSTEM_STATUS', '{"status": "OK"}');
