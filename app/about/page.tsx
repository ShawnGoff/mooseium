export const metadata = {
  title: "About · Mooseium",
  description:
    "What Mooseium is — a place to curate the world's open-access art and read the public-domain classics, in a walkable 3D museum and library.",
};

export default function AboutPage() {
  return (
    <main className="container legal">
      <h1>About Mooseium</h1>

      <p>
        Mooseium is a place to gather the things worth keeping — the world&apos;s
        art and its books — and make them your own.
      </p>

      <h2>Two spaces, one home</h2>
      <p>
        The <strong>Museum</strong> lets you search open-access masterpieces from
        world-renowned collections, save the pieces you love, and arrange them
        into galleries you can share — or walk through in a first-person 3D
        museum you curate yourself.
      </p>
      <p>
        Behind it is your <strong>Library</strong>: a quiet study where you
        collect public-domain books, read them in full, and keep your own writing
        and notes. You spawn in the Library and step out into the museum — art and
        reading, side by side, the way a good afternoon works.
      </p>

      <h2>Built on open access</h2>
      <p>
        None of this would exist without the institutions and volunteers who
        share their work freely. Every artwork comes from a museum&apos;s
        open-access program, and every book from the public domain, digitized by
        projects like Project Gutenberg. We&apos;re grateful to all of them — you
        can see the full list on our{" "}
        <a href="/credits">Credits &amp; Thanks</a> page.
      </p>

      <h2>Independent &amp; ad-free</h2>
      <p>
        Mooseium is a small, independent project — not affiliated with any of the
        museums whose collections it draws from. There are no ads, and we
        don&apos;t sell your data. It exists because building a beautiful place to
        love art and books felt worth doing.
      </p>

      <h2>Say hello</h2>
      <p>
        Ideas, questions, or a book or painting you wish were here? We&apos;d love
        to hear from you — reach us on our{" "}
        <a href="/contact">Contact</a> page.
      </p>
    </main>
  );
}
