"use client";

// Client half of the museum discovery feed: the rows are rendered from
// server-provided data (so they're in the initial HTML and crawlable); this
// component only adds the interactive bits — opening a placard and saving.

import { useEffect, useState } from "react";
import Link from "next/link";
import Placard from "@/app/components/Placard";
import SaveModal from "@/app/components/SaveModal";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type FeedCard = {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  dateText?: string;
  thumbnailUrl: string;
  objectType?: string;
};

export type FeedRow = {
  key: string;
  title: string;
  note?: string;
  href: string;
  cards: FeedCard[];
};

export default function MuseumFeed({
  displayName,
  rows,
}: {
  displayName: string;
  rows: FeedRow[];
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [placardCard, setPlacardCard] = useState<FeedCard | null>(null);
  const [saveCard, setSaveCard] = useState<FeedCard | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  return (
    <main className="container">
      <div className="brand">
        <h1>{displayName}</h1>
        <Link href="/museums" className="text-link">
          ← All museums
        </Link>
      </div>
      <p className="status">Explore {displayName} by category.</p>
      <p className="search-note">
        Searches are performed against each museum&apos;s original catalog data.
        Since metadata and descriptions vary by institution, results may
        occasionally be incomplete or include unexpected matches.
      </p>

      {rows.length === 0 ? (
        <p className="status">
          Nothing to show right now — the museum API may be busy. Please try again
          shortly.
        </p>
      ) : (
        rows.map((row) => (
          <section className="cat-section" key={row.key}>
            <div className="cat-head">
              <Link href={row.href} className="cat-title-link">
                <h2 className="feed-heading">{row.title}</h2>
                <span className="cat-seeall">See all →</span>
              </Link>
              {row.note && <span className="cat-note">{row.note}</span>}
            </div>
            <div className="cat-row">
              {row.cards.map((c) => (
                <div className="cat-card" key={`${c.sourceMuseum}-${c.museumObjectId}`}>
                  <button
                    className="cat-thumb"
                    onClick={() => setPlacardCard(c)}
                    aria-label={`View details for ${c.title}`}
                    title={c.title}
                    style={
                      c.thumbnailUrl
                        ? { backgroundImage: `url(${c.thumbnailUrl})` }
                        : undefined
                    }
                  />
                  <div className="cat-meta">
                    <p className="cat-title">{c.title}</p>
                    {c.artist && <p className="cat-artist">{c.artist}</p>}
                    {signedIn ? (
                      <button className="cat-save" onClick={() => setSaveCard(c)}>
                        Save
                      </button>
                    ) : (
                      <Link href="/login" className="cat-save ghost">
                        Sign in to save
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {placardCard && (
        <Placard
          artwork={{
            title: placardCard.title,
            artist: placardCard.artist,
            dateText: placardCard.dateText,
            objectType: placardCard.objectType,
            sourceMuseum: placardCard.sourceMuseum,
            image: placardCard.thumbnailUrl,
          }}
          source={{
            museum: placardCard.sourceMuseum,
            objectId: placardCard.museumObjectId,
          }}
          onSave={
            signedIn
              ? () => {
                  setSaveCard(placardCard);
                  setPlacardCard(null);
                }
              : undefined
          }
          onClose={() => setPlacardCard(null)}
        />
      )}

      {saveCard && <SaveModal card={saveCard} onClose={() => setSaveCard(null)} />}
    </main>
  );
}
