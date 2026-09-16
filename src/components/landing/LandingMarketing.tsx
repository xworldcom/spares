"use client";

import Link from "next/link";
import { useState } from "react";
import { LandingCell } from "@/components/landing/LandingCell";
import { LandingDemoPerspective } from "@/components/landing/LandingDemoPerspective";
import { LandingDemoScrub } from "@/components/landing/LandingDemoScrub";
import { LandingProductDemo } from "@/components/landing/LandingProductDemo";
import type { MarketingPerspective } from "@/lib/ui/landing-demo";

export function LandingMarketing() {
  const [perspective, setPerspective] = useState<MarketingPerspective>("customer");

  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section id="product-story" className="landing-section landing-section--stage">
        <p className="landing-section-kicker">Care and quotes</p>
        <h2 className="landing-section-title">Two threads. One calm rhythm.</h2>
        <p className="landing-section-lede">
          Flip between the plant and staff. Scroll to walk each thread forward or back—same chat and
          progress language maintenance already uses on a tablet.
        </p>

        <LandingDemoScrub>
          {({ quoteElapsedMs, ticketElapsedMs, reduceMotion }) => (
            <div className="landing-demo">
              <LandingDemoPerspective
                perspective={perspective}
                onPerspectiveChange={setPerspective}
              />

              <div className="landing-demo-pair">
                <div className="landing-demo-block">
                  <h3 className="landing-demo-block-title">Parts quotes</h3>
                  <p className="landing-demo-block-lede">
                    A spare request that breathes—status steps land as you read down the page.
                  </p>
                  <LandingProductDemo
                    variant="quote"
                    perspective={perspective}
                    elapsedMs={quoteElapsedMs}
                    reduceMotion={reduceMotion}
                    scrubbed
                  />
                </div>

                <div className="landing-demo-block">
                  <h3 className="landing-demo-block-title">Machine Care</h3>
                  <p className="landing-demo-block-lede">
                    A ticket on the cell: jam, diagnosis, and handoff without leaving the thread.
                  </p>
                  <LandingProductDemo
                    variant="ticket"
                    perspective={perspective}
                    elapsedMs={ticketElapsedMs}
                    reduceMotion={reduceMotion}
                    scrubbed
                  />
                </div>
              </div>
            </div>
          )}
        </LandingDemoScrub>
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
