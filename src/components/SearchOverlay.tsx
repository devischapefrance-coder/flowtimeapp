"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "event" | "member" | "contact" | "address" | "note";
  title: string;
  subtitle: string;
  emoji: string;
  href: string;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  familyId: string | undefined;
}

export default function SearchOverlay({ open, onClose, familyId }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !familyId) {
      setResults([]);
      return;
    }

    const term = q.toLowerCase();
    const found: SearchResult[] = [];

    const [evRes, memRes, contRes, addrRes, noteRes] = await Promise.all([
      supabase.from("events").select("*, members(name,emoji)").eq("family_id", familyId),
      supabase.from("members").select("*").eq("family_id", familyId),
      supabase.from("contacts").select("*").eq("family_id", familyId),
      supabase.from("addresses").select("*").eq("family_id", familyId),
      supabase.from("notes").select("*").eq("family_id", familyId),
    ]);

    // Events
    if (evRes.data) {
      for (const e of evRes.data) {
        if (
          e.title?.toLowerCase().includes(term) ||
          e.description?.toLowerCase().includes(term)
        ) {
          found.push({
            type: "event",
            title: e.title,
            subtitle: `${e.date} a ${e.time}${e.members?.name ? ` · ${e.members.name}` : ""}`,
            emoji: "📅",
            href: "/home",
          });
        }
      }
    }

    // Members
    if (memRes.data) {
      for (const m of memRes.data) {
        if (m.name?.toLowerCase().includes(term)) {
          found.push({
            type: "member",
            title: m.name,
            subtitle: m.role,
            emoji: m.emoji || "👤",
            href: "/famille",
          });
        }
      }
    }

    // Contacts
    if (contRes.data) {
      for (const c of contRes.data) {
        if (
          c.name?.toLowerCase().includes(term) ||
          c.relation?.toLowerCase().includes(term)
        ) {
          found.push({
            type: "contact",
            title: c.name,
            subtitle: `${c.relation} · ${c.phone}`,
            emoji: c.emoji || "📞",
            href: "/famille",
          });
        }
      }
    }

    // Addresses
    if (addrRes.data) {
      for (const a of addrRes.data) {
        if (
          a.name?.toLowerCase().includes(term) ||
          a.address?.toLowerCase().includes(term)
        ) {
          found.push({
            type: "address",
            title: a.name,
            subtitle: a.address || "Pas d'adresse",
            emoji: a.emoji || "📍",
            href: "/famille",
          });
        }
      }
    }

    // Notes
    if (noteRes.data) {
      for (const n of noteRes.data) {
        if (
          n.title?.toLowerCase().includes(term) ||
          n.content?.toLowerCase().includes(term)
        ) {
          found.push({
            type: "note",
            title: n.title,
            subtitle: n.content?.slice(0, 60) || "",
            emoji: "📝",
            href: "/vie",
          });
        }
      }
    }

    setResults(found.slice(0, 20));
  }, [familyId]);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(result: SearchResult) {
    onClose();
    router.push(result.href);
  }

  if (!open) return null;

  const typeLabels: Record<string, string> = {
    event: "Evenements",
    member: "Membres",
    contact: "Contacts",
    address: "Adresses",
    note: "Notes",
  };

  // Group by type
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  return (
    <div
      className="fixed inset-0 z-[700] flex flex-col items-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full pt-12 px-4"
        style={{ maxWidth: 430 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 mb-4">
          <input
            ref={inputRef}
            className="flex-1 px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "var(--surface2)",
              color: "var(--text)",
              border: "1px solid var(--glass-border)",
            }}
            placeholder="Rechercher partout..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <button
            className="text-sm font-bold px-3 py-3 rounded-2xl"
            style={{ background: "var(--surface2)", color: "var(--dim)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto rounded-2xl" style={{ background: "var(--surface-solid)" }}>
          {query.trim() && results.length === 0 && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun resultat</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p
                className="text-[10px] font-bold uppercase px-4 pt-3 pb-1"
                style={{ color: "var(--dim)" }}
              >
                {typeLabels[type] || type}
              </p>
              {items.map((r, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                  style={{ borderBottom: "1px solid var(--glass-border)" }}
                  onClick={() => handleSelect(r)}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{r.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--dim)" }}>{r.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
