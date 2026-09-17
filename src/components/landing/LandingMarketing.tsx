"use client";

import Link from "next/link";
import { LandingCell } from "@/components/landing/LandingCell";
import { LandingDemoScrub } from "@/components/landing/LandingDemoScrub";
import { LandingProductDemo } from "@/components/landing/LandingProductDemo";

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section id="product-story" className="landing-section landing-section--stage">
        <p className="landing-section-kicker">Care and quotes</p>
        <h2 className="landing-section-title">Two threads. One workspace.</h2>
        <p className="landing-section-lede">
          Scroll to walk a parts quote, then a Care ticket. The workspace stays on screen while the
          story moves.
        </p>

        <div className="landing-demo">
          <div className="landing-demo-scrub-stack">
            <LandingDemoScrub ariaLabel="Parts quote demo">
              {({ progress, reduceMotion }) => (
                <LandingProductDemo
                  variant="quote"
                  progress={progress}
                  reduceMotion={reduceMotion}
                  scrubbed
                />
              )}
            </LandingDemoScrub>

            <LandingDemoScrub ariaLabel="Machine Care demo">
              {({ progress, reduceMotion }) => (
                <LandingProductDemo
                  variant="ticket"
                  progress={progress}
                  reduceMotion={reduceMotion}
                  scrubbed
                />
              )}
            </LandingDemoScrub>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--cell">
        <p className="landing-section-kicker">The cell</p>
        <h2 className="landing-section-title">Turn the machine. Then tap the part.</h2>
        <p className="landing-section-lede">
          Every spare sits on the model the floor already trusts. Drag to orbit. This is a
          generic palletizer cell, not a customer asset.
        </p>
        <LandingCell />
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
