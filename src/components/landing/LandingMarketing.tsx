"use client";

import Link from "next/link";

const ROLES = [
  {
    title: "Host staff",
    body: "Publish machines, answer quotes, and run care for your customers.",
  },
  {
    title: "Customer",
    body: "See your fleet in 3D, request parts, and open service tickets on a tablet.",
  },
  {
    title: "Platform",
    body: "Stand up host companies, watch usage, and review serious inbound interest.",
  },
] as const;

const FLOW = [
  {
    step: "01",
    title: "Machine in 3D",
    body: "Every spare is tied to the model your team already trusts on the floor.",
  },
  {
    step: "02",
    title: "Pick parts",
    body: "Tap the mesh, confirm the part, and keep context with the machine — not a catalog grid.",
  },
  {
    step: "03",
    title: "Quote to PO",
    body: "Staff turn requests into quotes customers can accept without leaving the app.",
  },
  {
    step: "04",
    title: "Care & service",
    body: "Tickets, manuals, and service visits stay on the same machine record.",
  },
] as const;

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section id="product-story" className="landing-section">
        <p className="landing-section-kicker">Product story</p>
        <h2 className="landing-section-title">From the machine to the PO — one calm thread.</h2>
        <p className="landing-section-lede">
          OEE360 is private industrial software. Hosts publish machines; customers explore them in
          3D, quote spare parts, and run care without losing the asset context.
        </p>
        <ol className="landing-flow">
          {FLOW.map((item) => (
            <li key={item.step} className="landing-flow-item">
              <span className="landing-flow-step">{item.step}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-section--panel">
        <p className="landing-section-kicker">Plant floor</p>
        <h2 className="landing-section-title">Built for the maintenance manager on a tablet.</h2>
        <p className="landing-section-lede">
          Large touch targets, dark stages, and language that matches how plants actually talk
          about downtime — not another warehouse SaaS dashboard.
        </p>
        <ul className="landing-bullets">
          <li>See the machine first, then the part — not the other way around.</li>
          <li>Quotes and care tickets share the same machine record.</li>
          <li>Works on Safari over Wi‑Fi on the line, not just at a desk.</li>
        </ul>
      </section>

      <section className="landing-section">
        <p className="landing-section-kicker">Who it is for</p>
        <h2 className="landing-section-title">Three roles, one private app.</h2>
        <div className="landing-role-grid">
          {ROLES.map((role) => (
            <article key={role.title} className="landing-role-card">
              <h3>{role.title}</h3>
              <p>{role.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section--cta">
        <h2 className="landing-section-title">Request access</h2>
        <p className="landing-section-lede">
          OEE360 stays invite-only. Tell us about your company and we will review each inquiry —
          no automatic accounts.
        </p>
        <Link href="/inquire" className="landing-cta">
          Inquire about OEE360
        </Link>
        <p className="landing-section-foot">
          Already have a login? Scroll up to sign in with password or Microsoft SSO.
        </p>
      </section>
    </div>
  );
}
