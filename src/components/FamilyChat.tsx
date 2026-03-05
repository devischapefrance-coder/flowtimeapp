"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { notifyFamily } from "@/lib/push";
import Modal from "./Modal";

interface ChatMessage {
  id: string;
  family_id: string;
  text: string;
  sender_name: string;
  sender_emoji: string;
  sender_id: string;
  created_at: string;
}

interface FamilyChatProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  userId: string;
  userName: string;
  userEmoji: string;
  userAvatarUrl?: string | null;
  onUnread?: (count: number) => void;
}

const MAX_MESSAGES = 100;

export default function FamilyChat({ open, onClose, familyId, userId, userName, userEmoji, userAvatarUrl, onUnread }: FamilyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Load family member avatars
  useEffect(() => {
    if (!familyId) return;
    supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("family_id", familyId)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string | null> = {};
          for (const p of data) map[p.id] = p.avatar_url;
          setAvatarMap(map);
        }
      });
  }, [familyId]);

  // Load messages from DB
  const loadMessages = useCallback(async () => {
    if (!familyId) return;
    const { data } = await supabase
      .from("family_messages")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES);
    if (data) {
      setMessages(data as ChatMessage[]);
      setLoaded(true);
    }
  }, [familyId]);

  // Initial load
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!familyId) return;

    const channel = supabase
      .channel(`family-chat-${familyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "family_messages", filter: `family_id=eq.${familyId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Avoid duplicates (we already add locally on send)
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          // Unread counter if chat is closed and from someone else
          if (!openRef.current && msg.sender_id !== userId) {
            setUnread((prev) => prev + 1);
            if (navigator.vibrate) navigator.vibrate(200);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, userId]);

  // Reset unread when opening + reload fresh data
  useEffect(() => {
    if (open) {
      setUnread(0);
      loadMessages();
    }
  }, [open, loadMessages]);

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

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || !familyId) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      family_id: familyId,
      text: trimmed,
      sender_name: userName,
      sender_emoji: userEmoji,
      sender_id: userId,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, msg]);
    setText("");

    // Insert to DB
    await supabase.from("family_messages").insert({
      id: msg.id,
      family_id: msg.family_id,
      text: msg.text,
      sender_name: msg.sender_name,
      sender_emoji: msg.sender_emoji,
      sender_id: msg.sender_id,
    });

    // Push notification for offline members
    notifyFamily("FlowTime 💬", `${userEmoji} ${userName} : ${trimmed.length > 60 ? trimmed.slice(0, 60) + "..." : trimmed}`);
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    if (isYesterday) return `Hier ${time}`;
    return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${time}`;
  }

  return (
    <Modal open={open} onClose={onClose} title="💬 Chat famille">
      <div className="flex flex-col" style={{ height: "min(60vh, 400px)" }}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 mb-3 px-1">
          {!loaded && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs" style={{ color: "var(--dim)" }}>Chargement...</p>
            </div>
          )}
          {loaded && messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-center" style={{ color: "var(--dim)" }}>
                Aucun message. Envoie le premier !
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === userId;
            const avatarUrl = isMe ? userAvatarUrl : avatarMap[msg.sender_id];
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs overflow-hidden mt-auto" style={{ background: "var(--surface2)" }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{msg.sender_emoji || "👤"}</span>
                  )}
                </div>
                <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && (
                    <p className="text-[10px] font-bold mb-0.5" style={{ color: "var(--dim)" }}>
                      {msg.sender_name}
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
                    {formatTime(msg.created_at)}
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
