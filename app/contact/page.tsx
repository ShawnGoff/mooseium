export const metadata = {
  title: "Contact · Mooseium",
  description: "How to reach the Mooseium team.",
};

export default function ContactPage() {
  return (
    <main className="container legal">
      <h1>Contact</h1>

      <p>
        Mooseium is a small, independent project — we&apos;d love to hear from
        you. Whether it&apos;s a question, a bug, feedback, or a feature you wish
        existed, reach out anytime.
      </p>

      <h2>Email</h2>
      <p>
        <a href="mailto:themooseium@gmail.com">themooseium@gmail.com</a>
      </p>

      <h2>What to reach out about</h2>
      <ul className="legal-list">
        <li>
          <strong>Support &amp; bugs</strong> — something not working the way you
          expect? Tell us what happened and we&apos;ll take a look.
        </li>
        <li>
          <strong>Feedback &amp; ideas</strong> — features you&apos;d like, art or
          books you wish were included, or anything that would make Mooseium
          better.
        </li>
        <li>
          <strong>Reporting content</strong> — if you come across something that
          shouldn&apos;t be here, let us know (you can also use the Report button
          on public galleries).
        </li>
        <li>
          <strong>Privacy &amp; your account</strong> — questions about your data,
          or a request to delete your account and content.
        </li>
      </ul>

      <p className="legal-note">
        We&apos;re a small team, so please allow a little time for a reply —
        we read everything.
      </p>
    </main>
  );
}
