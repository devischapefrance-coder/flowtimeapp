"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../../layout";
import type { PrivateMessage } from "@/lib/types";

const MAX_MESSAGES = 100;

export default function PrivateChatPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const { profile } = useProfile();

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [peerName, setPeerName] = useState("");
  const [peerEmoji, setPeerEmoji] = useState("👤");
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const myId = profile?.id || "";

  // Charger le profil du destinataire via la table members
  useEffect(() => {
    if (!userId || !profile?.family_id) return;
    supabase
      .from("members")
      .select("name, emoji, user_id")
      .eq("family_id", profile.family_id)
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setPeerName(data.name);
          setPeerEmoji(data.emoji);
          const { data: avatarData } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
          setPeerAvatarUrl(avatarData.publicUrl);
        }
      });
    // Mon avatar
    const { data: myAvData } = supabase.storage.from("avatars").getPublicUrl(`${myId}/avatar.webp`);
    setMyAvatarUrl(myAvData.publicUrl);
  }, [userId, profile?.family_id, myId]);

  // Charger les messages
  const loadMessages = useCallback(async () => {
    if (!myId || !userId) return;
    const { data } = await supabase
      .from("private_messages")
      .select("*")
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${myId})`)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES);
    if (data) {
      setMessages(data as PrivateMessage[]);
      setLoaded(true);
    }
  }, [myId, userId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime : ecouter les nouveaux messages de cette conversation
  useEffect(() => {
    if (!myId || !userId) return;

    const channel = supabase
      .channel(`private-chat-${[myId, userId].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages" },
        (payload) => {
          const msg = payload.new as PrivateMessage;
          // Filtrer uniquement les messages de cette conversation
          const isThisConv =
            (msg.sender_id === myId && msg.receiver_id === userId) ||
            (msg.sender_id === userId && msg.receiver_id === myId);
          if (!isThisConv) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, userId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || !myId || !userId) return;

    const msg: PrivateMessage = {
      id: crypto.randomUUID(),
      sender_id: myId,
      receiver_id: userId,
      message: trimmed,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, msg]);
    setText("");

    await supabase.from("private_messages").insert({
      id: msg.id,
      sender_id: msg.sender_id,
      receiver_id: msg.receiver_id,
      message: msg.message,
    });
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

  function getAvatarSrc(uid: string): string {
    if (uid === myId) return myAvatarUrl || "";
    return peerAvatarUrl || "";
  }

  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: "var(--bg)", maxWidth: 430, margin: "0 auto" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 shrink-0"
        style={{
          paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
          paddingBottom: 12,
          background: "var(--surface-solid)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg active:scale-90 transition-transform"
          style={{ background: "var(--surface2)" }}
          onClick={() => router.back()}
          aria-label="Retour"
        >
          ←
        </button>
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-base overflow-hidden" style={{ background: "var(--surface2)" }}>
          {peerAvatarUrl && !failedAvatars.has(userId) ? (
            <img
              src={peerAvatarUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setFailedAvatars((prev) => new Set(prev).add(userId))}
            />
          ) : (
            <span>{peerEmoji}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{peerName || "..."}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Message privé</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-2 px-4 py-3">
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
          const isMe = msg.sender_id === myId;
          const avatarUid = isMe ? myId : userId;
          const showAvatar = !failedAvatars.has(avatarUid);
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs overflow-hidden mt-auto"
                style={{ background: "var(--surface2)" }}
              >
                {showAvatar ? (
                  <img
                    src={getAvatarSrc(avatarUid)}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setFailedAvatars((prev) => new Set(prev).add(avatarUid))}
                  />
                ) : (
                  <span>{isMe ? (profile?.emoji || "👤") : peerEmoji}</span>
                )}
              </div>
              <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div
                  className="px-3 py-2 rounded-2xl text-sm"
                  style={{
                    background: isMe ? "var(--accent)" : "var(--surface2)",
                    color: isMe ? "#fff" : "var(--text)",
                    borderBottomRightRadius: isMe ? 4 : 16,
                    borderBottomLeftRadius: isMe ? 16 : 4,
                  }}
                >
                  {msg.message}
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
      <div
        className="flex gap-2 px-4 shrink-0"
        style={{
          paddingTop: 12,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          background: "var(--surface-solid)",
          borderTop: "1px solid var(--glass-border)",
        }}
      >
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
  );
}
