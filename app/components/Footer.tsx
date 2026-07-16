import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">Mooseium</span>
        <nav className="site-footer-links">
          <Link href="/museums">Museums</Link>
          <Link href="/museums#how-search-works">How search works</Link>
          <Link href="/credits">Credits &amp; Thanks</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <span className="site-footer-note">
          Art shown is open-access material from third-party museums. Mooseium is
          not affiliated with or endorsed by these institutions.
        </span>
      </div>
    </footer>
  );
}
