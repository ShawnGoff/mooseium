// Starter Privacy Policy. Plain-language template to get you to launch —
// have it reviewed by a professional before relying on it.

export const metadata = {
  title: "Privacy Policy · Mooseium",
};

export default function PrivacyPage() {
  return (
    <main className="container legal">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: July 16, 2026</p>

      <p>
        This policy explains what information Mooseium collects, how it&apos;s
        used, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <p>
        When you create an account we collect your email address (used for
        sign-in). If you choose to, you can add a display name, a unique handle,
        and a short bio. We store the content you create in the app — your
        collections, saved artworks, gallery arrangements, curator notes, and
        guestbook messages. This also includes your Library: books you save,
        your reading progress, folders, and any personal writing or notes you
        create. We also process basic technical data such as log and device
        information needed to run and secure the service.
      </p>

      <h2>How we use it</h2>
      <p>
        We use your information to provide the service: to sign you in, save your
        collections, display your galleries, power search and discovery, and keep
        the service secure and working. We don&apos;t sell your personal
        information, and Mooseium is ad-free.
      </p>

      <h2>What&apos;s public</h2>
      <p>
        Some things are public by design. If you publish a gallery, its contents,
        its name, and your display name and handle are visible to anyone with the
        link. Guestbook signatures and your public profile page are also visible
        to others. Your Library — the books you save, your reading progress, and
        your personal writing — is private to your account. Please keep this in
        mind when choosing what to share.
      </p>

      <h2>Service providers</h2>
      <p>
        We rely on a few third parties to operate: our authentication and
        database provider (Supabase) stores your account and content, and our
        hosting provider serves the site. Artwork images are loaded directly from
        the source museums&apos; own servers, so those museums may receive
        standard technical request information when images load.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies (or similar storage) that are necessary to keep you signed
        in and to operate the service. We don&apos;t use them for advertising.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        We keep your information for as long as your account is active. You can
        ask us to delete your account and associated content by contacting us at
        themooseium@gmail.com.
      </p>

      <h2>Children</h2>
      <p>
        Mooseium isn&apos;t directed to children, and you should be old enough to
        consent to this policy in your region to use the service.
      </p>

      <h2>Your choices</h2>
      <p>
        You can edit your display name, handle, and bio, unpublish or delete
        galleries, and remove guestbook signatures at any time from within the
        app. Depending on where you live, you may have additional rights over
        your personal data; contact us to exercise them.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy as the service evolves and will revise the date
        above when we do.
      </p>

      <h2>Contact</h2>
      <p>Questions about privacy? Contact themooseium@gmail.com.</p>

      <p className="legal-note">
        This is a starter template, not legal advice. Have a qualified
        professional review it before you rely on it.
      </p>
    </main>
  );
}
