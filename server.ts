import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ClientUser {
  id: string;
  ws?: WebSocket | null;
  alias: string;
  avatar: string;
  lastPing: number;
  pendingEvents: any[];
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderAlias: string;
  senderAvatar: string;
  text: string;
  msgType?: 'text' | 'audio' | 'image' | 'system';
  mediaUrl?: string;
  duration?: number;
  burnTimer?: number | null;
  timestamp: number;
  reactions?: Record<string, string[]>;
}

// In-memory volatile store (NO DATABASE - 100% ephemeral RAM)
const clients = new Map<string, ClientUser>();
let recentMessages: ChatMessage[] = [];
const typingUsers = new Map<string, { id: string; avatar: string; timeout: NodeJS.Timeout }>();

function generateAnonIdentity() {
  const colorIndex = Math.floor(Math.random() * 12);
  const num = Math.floor(100 + Math.random() * 900);
  return {
    alias: `Anon #${num}`,
    avatar: colorIndex.toString(),
  };
}

function sendToClient(client: ClientUser, payload: any) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (client.ws && client.ws.readyState === WebSocket.OPEN) {
    try {
      client.ws.send(payloadStr);
      return;
    } catch {
      // ws send failed, buffer to pendingEvents
    }
  }
  const eventObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
  client.pendingEvents.push(eventObj);
  if (client.pendingEvents.length > 80) {
    client.pendingEvents.shift();
  }
}

function broadcastToAll(payload: any, exceptUserId?: string) {
  for (const client of clients.values()) {
    if (exceptUserId && client.id === exceptUserId) continue;
    sendToClient(client, payload);
  }
}

function getOnlineCount(): number {
  let active = 0;
  const now = Date.now();
  for (const client of clients.values()) {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      active++;
    } else if (now - client.lastPing < 4000) {
      active++;
    }
  }
  return Math.max(1, active);
}

function broadcastOnlineCount() {
  const count = getOnlineCount();
  broadcastToAll({
    type: 'server:online_count',
    onlineCount: count,
  });
}

function broadcastTypingStatus() {
  const typingList = Array.from(typingUsers.values()).map(u => ({
    userId: u.id,
    avatar: u.avatar,
  }));
  broadcastToAll({
    type: 'chat:typing_update',
    typingUsers: typingList,
  });
}

function handleClientAction(client: ClientUser, data: any) {
  client.lastPing = Date.now();

  switch (data.type) {
    case 'identity:update': {
      if (data.avatar && typeof data.avatar === 'string') {
        client.avatar = data.avatar;
      }
      sendToClient(client, {
        type: 'identity:updated',
        alias: client.alias,
        avatar: client.avatar,
      });
      break;
    }

    case 'chat:message': {
      const messageId = `msg_${crypto.randomUUID().slice(0, 8)}`;
      const message: ChatMessage = {
        id: messageId,
        senderId: client.id,
        senderAlias: client.alias,
        senderAvatar: client.avatar,
        text: typeof data.text === 'string' ? data.text.slice(0, 4000) : '',
        msgType: data.msgType || 'text',
        mediaUrl: data.mediaUrl,
        duration: data.duration,
        timestamp: Date.now(),
        reactions: {},
      };

      if (typingUsers.has(client.id)) {
        clearTimeout(typingUsers.get(client.id)!.timeout);
        typingUsers.delete(client.id);
        broadcastTypingStatus();
      }

      recentMessages.push(message);
      if (recentMessages.length > 100) recentMessages.shift();

      broadcastToAll({
        type: 'chat:new_message',
        message,
      });
      break;
    }

    case 'chat:typing': {
      if (data.isTyping) {
        if (typingUsers.has(client.id)) {
          clearTimeout(typingUsers.get(client.id)!.timeout);
        }
        const timeout = setTimeout(() => {
          typingUsers.delete(client.id);
          broadcastTypingStatus();
        }, 3000);
        typingUsers.set(client.id, { id: client.id, avatar: client.avatar, timeout });
        broadcastTypingStatus();
      } else {
        if (typingUsers.has(client.id)) {
          clearTimeout(typingUsers.get(client.id)!.timeout);
          typingUsers.delete(client.id);
          broadcastTypingStatus();
        }
      }
      break;
    }

    case 'chat:reaction': {
      const { messageId, emoji } = data;
      const targetMsg = recentMessages.find(m => m.id === messageId);
      if (targetMsg && emoji) {
        if (!targetMsg.reactions) targetMsg.reactions = {};
        const userSet = new Set(targetMsg.reactions[emoji] || []);
        if (userSet.has(client.id)) {
          userSet.delete(client.id);
        } else {
          userSet.add(client.id);
        }
        if (userSet.size === 0) {
          delete targetMsg.reactions[emoji];
        } else {
          targetMsg.reactions[emoji] = Array.from(userSet);
        }

        broadcastToAll({
          type: 'chat:message_reaction',
          messageId,
          reactions: targetMsg.reactions,
        });
      }
      break;
    }

    case 'chat:delete_message': {
      if (data.adminKey === 'Farabi24' && data.messageId) {
        const idx = recentMessages.findIndex(m => m.id === data.messageId);
        if (idx !== -1) {
          recentMessages.splice(idx, 1);
        }
        broadcastToAll({
          type: 'chat:delete_message',
          messageId: data.messageId,
        });
      }
      break;
    }

    case 'chat:clear_all': {
      if (data.adminKey === 'Farabi24') {
        recentMessages.length = 0;
        broadcastToAll({
          type: 'chat:clear_all',
        });
      }
      break;
    }

    case 'ping': {
      sendToClient(client, { type: 'pong' });
      break;
    }
  }
}

function getOrCreateClient(id?: string): ClientUser {
  if (id && clients.has(id)) {
    const existing = clients.get(id)!;
    existing.lastPing = Date.now();
    return existing;
  }
  const userId = id || `anon_${crypto.randomUUID().slice(0, 8)}`;
  const identity = generateAnonIdentity();
  const newClient: ClientUser = {
    id: userId,
    alias: identity.alias,
    avatar: identity.avatar,
    lastPing: Date.now(),
    pendingEvents: [],
  };
  clients.set(userId, newClient);
  return newClient;
}

function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const requestedId = url.searchParams.get('userId');

    let client: ClientUser;

    if (requestedId && clients.has(requestedId)) {
      client = clients.get(requestedId)!;
      if (client.ws && client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.close();
        } catch {}
      }
      client.ws = ws;
      client.lastPing = Date.now();
    } else {
      client = getOrCreateClient(requestedId || undefined);
      client.ws = ws;
    }

    if (client.pendingEvents.length > 0) {
      for (const ev of client.pendingEvents) {
        try {
          ws.send(JSON.stringify(ev));
        } catch {}
      }
      client.pendingEvents = [];
    }

    ws.send(JSON.stringify({
      type: 'connection:init',
      userId: client.id,
      alias: client.alias,
      avatar: client.avatar,
      onlineCount: getOnlineCount(),
      recentMessages: recentMessages.slice(-50),
    }));

    broadcastOnlineCount();

    ws.on('message', (rawData: string) => {
      try {
        const data = JSON.parse(rawData.toString());
        handleClientAction(client, data);
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      if (client.ws === ws) {
        client.ws = null;
      }
      if (typingUsers.has(client.id)) {
        clearTimeout(typingUsers.get(client.id)!.timeout);
        typingUsers.delete(client.id);
        broadcastTypingStatus();
      }
      broadcastOnlineCount();
    });

    ws.on('error', () => {
      if (client.ws === ws) {
        client.ws = null;
      }
      broadcastOnlineCount();
    });
  });

  // Periodically clean up fully inactive clients
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [userId, client] of clients.entries()) {
      const isDead = (!client.ws || client.ws.readyState !== WebSocket.OPEN) && (now - client.lastPing > 15000);
      if (isDead) {
        if (typingUsers.has(userId)) {
          clearTimeout(typingUsers.get(userId)!.timeout);
          typingUsers.delete(userId);
        }
        clients.delete(userId);
        changed = true;
      }
    }
    if (changed) {
      broadcastOnlineCount();
    }
  }, 10000);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Enable CORS for cross-origin requests (e.g. from GitHub Pages to Render)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const wss = new WebSocketServer({ noServer: true });
  setupWebSocket(wss);

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws' || url.pathname === '/ws/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      onlineCount: getOnlineCount(),
      messagesCount: recentMessages.length,
      mode: 'single_group_chat',
      memoryOnly: true,
    });
  });

  app.post('/api/init', (req, res) => {
    const requestedId = req.body?.userId;
    const client = getOrCreateClient(requestedId);
    res.json({
      userId: client.id,
      alias: client.alias,
      avatar: client.avatar,
      onlineCount: getOnlineCount(),
      recentMessages: recentMessages.slice(-50),
    });
  });

  app.post('/api/action', (req, res) => {
    const { userId, data } = req.body || {};
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    const client = getOrCreateClient(userId);
    if (data) {
      handleClientAction(client, data);
    }
    res.json({ status: 'ok' });
  });

  app.get('/api/poll', (req, res) => {
    const userId = req.query.userId as string;
    if (!userId || !clients.has(userId)) {
      res.json({ events: [] });
      return;
    }
    const client = clients.get(userId)!;
    client.lastPing = Date.now();
    const events = client.pendingEvents.splice(0);
    res.json({ events });
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GhostChat Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
