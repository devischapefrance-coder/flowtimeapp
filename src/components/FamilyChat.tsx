"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "./Modal";

interface ChatMessage {
  id: string;
  text: string;
  sender_name: string;
  sender_emoji: string;
  sender_id: string;
  timestamp: string;
}

interface FamilyChatProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  userId: string;
  userName: string;
  userEmoji: string;
  onUnread?: (count: number) => void;
}

const CHAT_STORAGE_KEY = "flowtime-family-chat";
const MAX_MESSAGES = 50;

function loadMessages(familyId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${CHAT_STORAGE_KEY}-${familyId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(familyId: string, messages: ChatMessage[]) {
  localStorage.setItem(`${CHAT_STORAGE_KEY}-${familyId}`, JSON.stringify(messages.slice(-MAX_MESSAGES)));
}

export default function FamilyChat({ open, onClose, familyId, userId, userName, userEmoji, onUnread }: FamilyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Always listen for messages, even when closed
  useEffect(() => {
    if (!familyId) return;
    setMessages(loadMessages(familyId));

    const channel = supabase.channel(`family-chat-${familyId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setMessages((prev) => {
          const updated = [...prev, msg];
          saveMessages(familyId, updated);
          return updated;
        });

        // Notify if chat is closed and message is from someone else
        if (!openRef.current && msg.sender_id !== userId) {
          setUnread((prev) => prev + 1);

          // Web notification
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`${msg.sender_emoji} ${msg.sender_name}`, {
              body: msg.text,
              icon: "/icons/icon-192.png",
              tag: "family-chat",
            });
          }

          // Vibrate if supported
          if (navigator.vibrate) navigator.vibrate(200);
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [familyId, userId]);

  // Reset unread when opening
  useEffect(() => {
    if (open) {
      setUnread(0);
      setMessages(loadMessages(familyId));
    }
  }, [open, familyId]);

  // Notify parent of unread count
  useEffect(() => {
    onUnread?.(unread);
  }, [unread, onUnread]);

  // Auto-scroll on new messages when open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || !channelRef.current) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      text: trimmed,
      sender_name: userName,
      sender_emoji: userEmoji,
      sender_id: userId,
      timestamp: new Date().toISOString(),
    };

    channelRef.current.send({ type: "broadcast", event: "message", payload: msg });

    // Also add locally
    setMessages((prev) => {
      const updated = [...prev, msg];
      saveMessages(familyId, updated);
      return updated;
    });
    setText("");
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <Modal open={open} onClose={onClose} title="💬 Chat famille">
      <div className="flex flex-col" style={{ height: "min(60vh, 400px)" }}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 mb-3 px-1">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-center" style={{ color: "var(--dim)" }}>
                Aucun message. Envoie le premier !
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === userId;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <p className="text-[10px] font-bold mb-0.5" style={{ color: "var(--dim)" }}>
                      {msg.sender_emoji} {msg.sender_name}
                    </p>
                  )}
                  <div
                    className="px-3 py-2 rounded-2xl text-sm"
                    style={{
                      background: isMe ? "var(--accent)" : "var(--surface2)",
                      color: isMe ? "#fff" : "var(--text)",
                      borderBottomRightRadius: isMe ? 4 : 16,
                      borderBottomLeftRadius: isMe ? 16 : 4,
                    }}
                  >
                    {msg.text}
                  </div>
                  <p className="text-[9px] mt-0.5" style={{ color: "var(--faint)" }}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2.5 rounded-xl text-sm"
            style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
            placeholder="Message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          />
          <button
            className="px-4 py-2.5 rounded-xl font-bold text-sm shrink-0"
            style={{ background: "var(--accent)", color: "#fff", opacity: text.trim() ? 1 : 0.5 }}
            onClick={sendMessage}
            disabled={!text.trim()}
            aria-label="Envoyer"
          >
            ➤
          </button>
        </div>
      </div>
    </Modal>
  );
}
