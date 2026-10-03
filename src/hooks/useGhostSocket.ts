import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { ChatMessage, PeerUser } from '../types';
import { sound } from '../utils/sound';
import { getDeviceInfo } from '../utils/device';

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
  const activePeersMapRef = useRef<Map<string, PeerUser>>(new Map());
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
  const [activePeers, setActivePeers] = useState<PeerUser[]>([]);
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

  // Delete message locally
  const removeMessageLocally = useCallback((messageId: string) => {
    setMessages(prev => {
      const next = prev.filter(m => m.id !== messageId);
      saveLocalHistory(next);
      return next;
    });
  }, []);

  // Clear all messages locally
  const clearMessagesLocally = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem('ghost_chat_history');
    } catch {}
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
      const myDevice = getDeviceInfo();
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

        // Send initial presence announcement with device info
        const announcePresence = () => {
          if (client.connected) {
            client.publish(
              MQTT_TOPIC_PRESENCE,
              JSON.stringify({
                userId: userIdRef.current,
                alias: aliasRef.current,
                avatar: avatarRef.current,
                deviceInfo: myDevice,
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
          activePeersMapRef.current.forEach((peer, peerId) => {
            if (now - peer.lastSeen > 25000) {
              activePeersMapRef.current.delete(peerId);
            }
          });
          const peerList = Array.from(activePeersMapRef.current.values());
          setActivePeers(peerList);
          setOnlineCount(Math.max(1, peerList.length + 1));
        }, 7000);
      });

      client.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());

          if (topic === MQTT_TOPIC_PRESENCE) {
            if (data.userId && data.userId !== userIdRef.current) {
              activePeersMapRef.current.set(data.userId, {
                userId: data.userId,
                alias: data.alias || 'Pengguna Lain',
                avatar: data.avatar || '0',
                deviceInfo: data.deviceInfo,
                lastSeen: Date.now(),
              });
              const peerList = Array.from(activePeersMapRef.current.values());
              setActivePeers(peerList);
              setOnlineCount(Math.max(1, peerList.length + 1));
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
            } else if (data.type === 'chat:delete_message') {
              removeMessageLocally(data.messageId);
            } else if (data.type === 'chat:clear_all') {
              clearMessagesLocally();
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
  }, [appendMessage, applyReaction, removeMessageLocally, clearMessagesLocally]);

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
        // Send initial device info to ws server
        try {
          ws.send(JSON.stringify({
            type: 'identity:device_info',
            deviceInfo: getDeviceInfo(),
          }));
        } catch {}
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
            if (Array.isArray(data.peers)) {
              setActivePeers(data.peers);
            }
          } else if (data.type === 'server:online_count') {
            setOnlineCount(data.onlineCount);
            if (Array.isArray(data.peers)) {
              setActivePeers(data.peers);
            }
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
          } else if (data.type === 'chat:delete_message') {
            removeMessageLocally(data.messageId);
          } else if (data.type === 'chat:clear_all') {
            clearMessagesLocally();
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!isMountedRef.current || isClosingIntentionally.current) return;
        connectServerlessMqtt();
      };

      ws.onerror = () => {
        connectServerlessMqtt();
      };
    } catch {
      connectServerlessMqtt();
    }
  }, [appendMessage, connectServerlessMqtt, removeMessageLocally, clearMessagesLocally]);

  useEffect(() => {
    isMountedRef.current = true;
    isClosingIntentionally.current = false;

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
    const myDevice = getDeviceInfo();

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
      deviceInfo: myDevice,
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
          deviceInfo: myDevice,
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

  // Admin action: Delete message
  const deleteMessage = useCallback((messageId: string) => {
    sound.playClick();
    removeMessageLocally(messageId);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:delete_message',
          messageId,
          adminKey: 'Farabi24',
        })
      );
    }

    if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(
        MQTT_TOPIC_ROOM,
        JSON.stringify({
          type: 'chat:delete_message',
          messageId,
          adminKey: 'Farabi24',
        })
      );
    }
  }, [removeMessageLocally]);

  // Admin action: Clear all messages
  const clearAllMessages = useCallback(() => {
    sound.playClick();
    clearMessagesLocally();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:clear_all',
          adminKey: 'Farabi24',
        })
      );
    }

    if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(
        MQTT_TOPIC_ROOM,
        JSON.stringify({
          type: 'chat:clear_all',
          adminKey: 'Farabi24',
        })
      );
    }
  }, [clearMessagesLocally]);

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
    activePeers,
    messages,
    typingAvatars,
    updateAvatar,
    sendMessage,
    deleteMessage,
    clearAllMessages,
    triggerTyping,
    sendReaction,
  };
}
