import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="state-page">
        <h1>Page not found</h1>
        <p className="status">
          This page doesn&apos;t exist, or the gallery may have been made private.
        </p>
        <div className="state-actions">
          <Link href="/" className="loadmore">
            Back to Explore
          </Link>
          <Link href="/museums" className="text-link">
            Browse museums
          </Link>
        </div>
      </div>
    </main>
  );
}
