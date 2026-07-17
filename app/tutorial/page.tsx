import Link from "next/link";

export const metadata = {
  title: "Tutorial · Mooseium",
  description:
    "How to use Mooseium — search the world's art, build collections, curate your galleries and 3D museum, and read in your Library.",
};

export default function TutorialPage() {
  return (
    <main className="container legal tutorial">
      <h1>How to use Mooseium</h1>
      <p className="credits-intro">
        Mooseium has two halves — a <strong>Museum</strong> for art and a{" "}
        <strong>Library</strong> for books — that share one account. Here&apos;s
        how to get the most out of both. It only takes a few minutes to set up
        something that&apos;s truly yours.
      </p>

      <h2>1. Getting started</h2>
      <p>
        Tap <strong>Sign in</strong> and use a magic link (we email you a one-tap
        link) or continue with Google. First time in, you&apos;ll pick a{" "}
        <strong>handle</strong> — a unique <em>@name</em> that becomes your public
        profile and museum address. You can also set a display name, a bio, and a
        name for your museum on your <Link href="/account">account page</Link>{" "}
        anytime.
      </p>

      <h2>2. Finding art</h2>
      <p>
        From the <Link href="/">home page</Link>, use the search bar to look up
        anything — an artist (&ldquo;Vermeer&rdquo;), a subject
        (&ldquo;sunflowers&rdquo;), or a mood (&ldquo;storm&rdquo;). A few ways to
        explore:
      </p>
      <ul className="legal-list">
        <li>
          <strong>All museums or one:</strong> the dropdown next to the search box
          scopes your search to a single collection or searches across all of
          them at once.
        </li>
        <li>
          <strong>Browse by theme &amp; era:</strong> the theme cards and era
          chips on the home page run curated searches — a fast way to wander.
        </li>
        <li>
          <strong>Open a piece:</strong> tap any artwork to open its placard with
          the full details, the artist, and a zoomable image.
        </li>
      </ul>

      <h2>3. Saving to collections</h2>
      <p>
        When you find something you love, hit <strong>Save</strong>. You&apos;ll
        pick a <strong>collection</strong> to put it in — or create a new one on
        the spot (&ldquo;Dogs in Art,&rdquo; &ldquo;Moody Landscapes,&rdquo;
        whatever you like). Collections are your building blocks: everything you
        save lives in one, and you can make as many as you want. Find them all on
        your <Link href="/collections">Collections page</Link>.
      </p>

      <h2>4. Curating your galleries &amp; museum</h2>
      <p>
        Each collection can become a room in your own 3D museum. On a
        collection&apos;s page you can:
      </p>
      <ul className="legal-list">
        <li>
          <strong>Show it in your museum</strong> — toggle a collection to include
          it (or leave it out) as one of the rooms visitors walk through.
        </li>
        <li>
          <strong>Group it into a wing</strong> — collections are organized into
          wings that open off the central atrium, so a big museum stays easy to
          navigate.
        </li>
        <li>
          <strong>Publish &amp; share</strong> — make a gallery public and share
          the link; anyone can view it, and it can appear on the{" "}
          <Link href="/galleries">Galleries</Link> page for others to discover.
        </li>
      </ul>

      <h2>5. Walking your 3D museum</h2>
      <p>
        Hit <strong>Explore in 3D</strong> to step inside. You spawn in your
        Library and walk out into the museum, with wings opening ahead and to the
        sides.
      </p>
      <ul className="legal-list">
        <li>
          <strong>Move:</strong> WASD keys (or the on-screen joystick on a phone)
          to walk; drag to look around.
        </li>
        <li>
          <strong>Jump anywhere:</strong> the <strong>Directory</strong> (top
          right) teleports you straight to any gallery.
        </li>
        <li>
          <strong>Set the mood:</strong> toggle day, night, or rain, flip the
          lights, and pick background music from the controls in the corner.
        </li>
      </ul>

      <h2>6. Your Library</h2>
      <p>
        The <Link href="/den">Library</Link> is your private study for reading and
        writing. It has three tabs:
      </p>
      <ul className="legal-list">
        <li>
          <strong>Discover</strong> — search public-domain books, browse by
          subject, and see a &ldquo;Because your museum has&hellip;&rdquo; shelf
          that suggests books connected to the artists you collect. Tap a book for
          its details, then <strong>Save</strong> it or <strong>Read now</strong>.
        </li>
        <li>
          <strong>Books</strong> — your saved library, with a{" "}
          <strong>Continue reading</strong> shelf that remembers your place. Books
          read in full, with a comfortable paper mode, adjustable text size, and
          highlight-to-save-a-note.
        </li>
        <li>
          <strong>Writing</strong> — a quiet place for your own journals, stories,
          and notes, organized into folders alongside your books.
        </li>
      </ul>
      <p>
        Inside the 3D museum you can walk up to the desk to write, the armchair to
        read, or the shelves to browse — sit down and the tool opens right there.
      </p>

      <h2>7. What&apos;s public, what&apos;s private</h2>
      <p>
        Your <strong>published galleries, profile, and display name</strong> are
        public — that&apos;s how you share your taste with the world. Your{" "}
        <strong>Library</strong> — the books you save, your reading progress, and
        your writing — is <strong>private to you</strong>. Nothing from your
        Library is shared unless a future feature explicitly lets you choose to.
      </p>

      <h2>A few tips</h2>
      <ul className="legal-list">
        <li>Save generously — you can always reorganize collections later.</li>
        <li>
          A collection doesn&apos;t have to be in your museum; keep private
          mood-boards too.
        </li>
        <li>
          The art you collect shapes what the Library suggests — so a museum full
          of Van Gogh brings his letters to your shelf.
        </li>
      </ul>

      <p className="credits-outro">
        That&apos;s it — go build something beautiful. Questions? Our{" "}
        <Link href="/contact">Contact</Link> page is always open. 🫎
      </p>
    </main>
  );
}
