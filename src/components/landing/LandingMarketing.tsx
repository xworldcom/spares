"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { LandingProductDemo } from "@/components/landing/LandingProductDemo";

const OrbitStage = dynamic(
  () => import("@/components/landing/OrbitStage").then((mod) => mod.OrbitStage),
  { ssr: false },
);

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section id="product-story" className="landing-section landing-section--stage">
        <p className="landing-section-kicker">Care and quotes</p>
        <h2 className="landing-section-title">A ticket that moves while you watch.</h2>
        <p className="landing-section-lede">
          Flip between the plant and staff. Chat, chips, and the progress strip are the same
          language maintenance already uses on a tablet.
        </p>
        <LandingProductDemo />
      </section>

      <section className="landing-section landing-section--cell">
        <p className="landing-section-kicker">The cell</p>
        <h2 className="landing-section-title">Turn the machine. Then tap the part.</h2>
        <p className="landing-section-lede">
          Every spare sits on the model the floor already trusts. Drag to orbit. This is a
          generic palletizer cell, not a customer asset.
        </p>
        <div className="landing-cell">
          <OrbitStage interactive />
        </div>
      </section>

      <section className="landing-section landing-section--cta">
        <h2 className="landing-section-title">Request access</h2>
        <p className="landing-section-lede">
          OEE360 stays invite-only. Tell us about your company and we will review each inquiry.
          No automatic accounts.
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
