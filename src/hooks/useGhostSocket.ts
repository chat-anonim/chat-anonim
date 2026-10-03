import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { ChatMessage } from '../types';
import { sound } from '../utils/sound';

const MQTT_TOPIC_ROOM = 'ghostchat/v1/global_room';
const MQTT_TOPIC_PRESENCE = 'ghostchat/v1/presence';
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

function isGitHubPages(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io') || window.location.hostname.includes('github.dev');
}

function getLocalHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem('ghost_chat_history');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-50);
    }
  } catch {}
  return [];
}

function saveLocalHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem('ghost_chat_history', JSON.stringify(msgs.slice(-50)));
  } catch {}
}

export function useGhostSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isClosingIntentionally = useRef<boolean>(false);
  const presenceIntervalRef = useRef<number | null>(null);
  const activePeersRef = useRef<Map<string, number>>(new Map());
  const typingTimerRef = useRef<number | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Persist session userId in sessionStorage
  const [userId, setUserId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('anon_chat_uid');
      if (saved) return saved;
      const newId = 'anon_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('anon_chat_uid', newId);
      return newId;
    } catch {
      return 'anon_' + Math.random().toString(36).substring(2, 9);
    }
  });
  const userIdRef = useRef<string>(userId);
  userIdRef.current = userId;

  const [alias, setAlias] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('anon_chat_alias');
      if (saved) return saved;
      const adjectives = ['Misterius', 'Hantu', 'Bayangan', 'Angin', 'Senja', 'Bintang', 'Kilat', 'Samudra'];
      const nouns = ['Cepat', 'Tenang', 'Kelana', 'Malam', 'Abadi', 'Sunyi', 'Hebat', 'Samar'];
      const gen = adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' + nouns[Math.floor(Math.random() * nouns.length)];
      sessionStorage.setItem('anon_chat_alias', gen);
      return gen;
    } catch {
      return 'Anonim';
    }
  });
  const aliasRef = useRef<string>(alias);
  aliasRef.current = alias;

  const [avatar, setAvatar] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('anon_chat_avatar');
      if (saved) return saved;
      const av = String(Math.floor(Math.random() * 8));
      sessionStorage.setItem('anon_chat_avatar', av);
      return av;
    } catch {
      return '0';
    }
  });
  const avatarRef = useRef<string>(avatar);
  avatarRef.current = avatar;

  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalHistory());
  const [typingAvatars, setTypingAvatars] = useState<string[]>([]);

  // Update messages and persist to local storage
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      saveLocalHistory(next);
      return next;
    });
  }, []);

  // Update message reaction
  const applyReaction = useCallback((messageId: string, emoji: string, senderId: string) => {
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id === messageId) {
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[emoji] || [];
          if (users.includes(senderId)) {
            reactions[emoji] = users.filter(u => u !== senderId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji] = [...users, senderId];
          }
          return { ...m, reactions };
        }
        return m;
      });
      saveLocalHistory(next);
      return next;
    });
  }, []);

  // Connect via Serverless Public MQTT Relay (works 100% on GitHub Pages with ZERO backend needed)
  const connectServerlessMqtt = useCallback(() => {
    if (!isMountedRef.current) return;
    if (mqttClientRef.current) return;

    setConnectionStatus('connecting');

    try {
      const brokerUrl = MQTT_BROKERS[0];
      const client = mqtt.connect(brokerUrl, {
        clientId: 'ghost_' + userIdRef.current + '_' + Math.random().toString(16).substring(2, 8),
        keepalive: 30,
        reconnectPeriod: 4000,
        clean: true,
      });

      mqttClientRef.current = client;

      client.on('connect', () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('connected');

        client.subscribe([MQTT_TOPIC_ROOM, MQTT_TOPIC_PRESENCE], (err) => {
          if (err) console.error('MQTT subscribe error:', err);
        });

        // Send initial presence announcement
        const announcePresence = () => {
          if (client.connected) {
            client.publish(
              MQTT_TOPIC_PRESENCE,
              JSON.stringify({
                userId: userIdRef.current,
                alias: aliasRef.current,
                avatar: avatarRef.current,
                timestamp: Date.now(),
              })
            );
          }
        };

        announcePresence();

        if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = window.setInterval(() => {
          announcePresence();

          // Prune stale peers older than 25 seconds
          const now = Date.now();
          activePeersRef.current.forEach((time, peerId) => {
            if (now - time > 25000) {
              activePeersRef.current.delete(peerId);
            }
          });
          setOnlineCount(Math.max(1, activePeersRef.current.size + 1));
        }, 8000);
      });

      client.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());

          if (topic === MQTT_TOPIC_PRESENCE) {
            if (data.userId && data.userId !== userIdRef.current) {
              activePeersRef.current.set(data.userId, Date.now());
              setOnlineCount(Math.max(1, activePeersRef.current.size + 1));
            }
            return;
          }

          if (topic === MQTT_TOPIC_ROOM) {
            if (data.type === 'chat:message') {
              const msg: ChatMessage = data.message;
              const isSelf = msg.senderId === userIdRef.current;
              if (!isSelf && msg.msgType !== 'system') {
                sound.playMessageReceived();
              }
              appendMessage({ ...msg, isSelf });
            } else if (data.type === 'chat:typing') {
              if (data.userId !== userIdRef.current) {
                if (data.isTyping) {
                  setTypingAvatars(prev => Array.from(new Set([...prev, data.avatar])));
                } else {
                  setTypingAvatars(prev => prev.filter(a => a !== data.avatar));
                }
              }
            } else if (data.type === 'chat:reaction') {
              applyReaction(data.messageId, data.emoji, data.senderId);
            }
          }
        } catch (err) {
          console.error('MQTT message error:', err);
        }
      });

      client.on('offline', () => {
        if (isMountedRef.current && !isClosingIntentionally.current) {
          setConnectionStatus('disconnected');
        }
      });

      client.on('error', (err) => {
        console.warn('MQTT connection notice:', err);
      });
    } catch (err) {
      console.error('Failed to init MQTT:', err);
      setConnectionStatus('disconnected');
    }
  }, [appendMessage, applyReaction]);

  // Connect via Node.js WebSocket (if local or custom backend is present)
  const connectNodeWs = useCallback(() => {
    if (!isMountedRef.current) return;
    setConnectionStatus('connecting');

    const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
    let wsUrl: string;

    if (envUrl) {
      try {
        const u = new URL(envUrl);
        const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${u.host}/ws?userId=${encodeURIComponent(userIdRef.current)}`;
      } catch {
        wsUrl = `wss://${envUrl}/ws?userId=${encodeURIComponent(userIdRef.current)}`;
      }
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}/ws?userId=${encodeURIComponent(userIdRef.current)}`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connection:init') {
            setAlias(data.alias);
            aliasRef.current = data.alias;
            if (data.avatar) {
              setAvatar(data.avatar);
              avatarRef.current = data.avatar;
            }
            setOnlineCount(data.onlineCount || 1);
            if (Array.isArray(data.recentMessages) && data.recentMessages.length > 0) {
              setMessages(
                data.recentMessages.map((m: ChatMessage) => ({
                  ...m,
                  isSelf: m.senderId === userIdRef.current,
                }))
              );
            }
          } else if (data.type === 'server:online_count') {
            setOnlineCount(data.onlineCount);
          } else if (data.type === 'chat:new_message') {
            const msg: ChatMessage = data.message;
            const isSelf = msg.senderId === userIdRef.current;
            if (!isSelf && msg.msgType !== 'system') {
              sound.playMessageReceived();
            }
            appendMessage({ ...msg, isSelf });
          } else if (data.type === 'chat:typing_update') {
            const others = (data.typingUsers || [])
              .filter((u: { userId: string; avatar: string }) => u.userId !== userIdRef.current)
              .map((u: { userId: string; avatar: string }) => u.avatar);
            setTypingAvatars(others);
          } else if (data.type === 'chat:message_reaction') {
            setMessages(prev =>
              prev.map(m => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
            );
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!isMountedRef.current || isClosingIntentionally.current) return;
        // If local websocket closes or is unavailable, seamlessly switch to Serverless MQTT
        connectServerlessMqtt();
      };

      ws.onerror = () => {
        // Fallback to Serverless MQTT immediately
        connectServerlessMqtt();
      };
    } catch {
      connectServerlessMqtt();
    }
  }, [appendMessage, connectServerlessMqtt]);

  useEffect(() => {
    isMountedRef.current = true;
    isClosingIntentionally.current = false;

    // If on GitHub Pages without a custom backend, directly use serverless MQTT for instantaneous connection
    const customUrl = (import.meta as any).env?.VITE_SERVER_URL;
    if (isGitHubPages() && !customUrl) {
      connectServerlessMqtt();
    } else {
      connectNodeWs();
    }

    return () => {
      isMountedRef.current = false;
      isClosingIntentionally.current = true;
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (mqttClientRef.current) mqttClientRef.current.end();
    };
  }, [connectNodeWs, connectServerlessMqtt]);

  // Send message
  const sendMessage = useCallback((
    text: string,
    options?: {
      msgType?: 'text' | 'audio' | 'image';
      mediaUrl?: string;
      duration?: number;
    }
  ) => {
    if (!text.trim() && !options?.mediaUrl) return;

    sound.playMessageSent();
    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      senderId: userIdRef.current,
      senderAlias: aliasRef.current,
      senderAvatar: avatarRef.current,
      text: text.trim(),
      msgType: options?.msgType || 'text',
      mediaUrl: options?.mediaUrl,
      duration: options?.duration,
      timestamp: Date.now(),
      reactions: {},
    };

    // Show self immediately
    appendMessage({ ...newMsg, isSelf: true });

    // Send through WebSocket if active
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:message',
          text: text.trim(),
          msgType: options?.msgType || 'text',
          mediaUrl: options?.mediaUrl,
          duration: options?.duration,
        })
      );
      return;
    }

    // Otherwise send through Serverless MQTT
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(
        MQTT_TOPIC_ROOM,
        JSON.stringify({
          type: 'chat:message',
          message: newMsg,
        })
      );
    }
  }, [appendMessage]);

  // Update avatar
  const updateAvatar = useCallback((newAvatar: string) => {
    setAvatar(newAvatar);
    avatarRef.current = newAvatar;
    try {
      sessionStorage.setItem('anon_chat_avatar', newAvatar);
    } catch {}

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'identity:update',
          avatar: newAvatar,
        })
      );
    }
  }, []);

  // Send typing status
  const triggerTyping = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat:typing', isTyping: true }));
    } else if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(
        MQTT_TOPIC_ROOM,
        JSON.stringify({
          type: 'chat:typing',
          userId: userIdRef.current,
          avatar: avatarRef.current,
          isTyping: true,
        })
      );
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'chat:typing', isTyping: false }));
      } else if (mqttClientRef.current && mqttClientRef.current.connected) {
        mqttClientRef.current.publish(
          MQTT_TOPIC_ROOM,
          JSON.stringify({
            type: 'chat:typing',
            userId: userIdRef.current,
            avatar: avatarRef.current,
            isTyping: false,
          })
        );
      }
    }, 1800);
  }, []);

  // Send reaction
  const sendReaction = useCallback((messageId: string, emoji: string) => {
    sound.playClick();
    applyReaction(messageId, emoji, userIdRef.current);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:reaction',
          messageId,
          emoji,
        })
      );
    } else if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(
        MQTT_TOPIC_ROOM,
        JSON.stringify({
          type: 'chat:reaction',
          messageId,
          emoji,
          senderId: userIdRef.current,
        })
      );
    }
  }, [applyReaction]);

  return {
    connectionStatus,
    userId,
    alias,
    avatar,
    onlineCount,
    messages,
    typingAvatars,
    updateAvatar,
    sendMessage,
    triggerTyping,
    sendReaction,
  };
}
