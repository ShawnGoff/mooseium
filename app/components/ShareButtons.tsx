"use client";

// Share row: Pinterest (art is native there and pins keep sending traffic for
// years), X, and copy-link. Pinterest's share URL needs no API/approval.

import { useState } from "react";

export default function ShareButtons({
  url,
  title,
  image,
}: {
  /** Absolute URL of the page being shared. */
  url: string;
  title: string;
  /** Absolute image URL for the Pinterest pin. */
  image?: string;
}) {
  const [copied, setCopied] = useState(false);

  const pin =
    "https://www.pinterest.com/pin/create/button/?" +
    new URLSearchParams({
      url,
      ...(image ? { media: image } : {}),
      description: title,
    }).toString();

  const tweet =
    "https://twitter.com/intent/tweet?" +
    new URLSearchParams({ url, text: title }).toString();

  const facebook =
    "https://www.facebook.com/sharer/sharer.php?" +
    new URLSearchParams({ u: url }).toString();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="share-row">
      <span className="share-label">Share</span>
      <a
        className="share-btn share-pin"
        href={pin}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Save to Pinterest"
      >
        Pinterest
      </a>
      <a
        className="share-btn share-fb"
        href={facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
      >
        Facebook
      </a>
      <a
        className="share-btn"
        href={tweet}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
      >
        X
      </a>
      <button className="share-btn" onClick={copy} aria-label="Copy link">
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}
