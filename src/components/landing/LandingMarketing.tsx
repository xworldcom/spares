"use client";

import Link from "next/link";
import { LandingCell } from "@/components/landing/LandingCell";
import { LandingDemoScrub } from "@/components/landing/LandingDemoScrub";
import { LandingProductStoryIntro } from "@/components/landing/LandingProductStoryIntro";
import { LandingWorkflowDemo } from "@/components/landing/LandingWorkflowDemo";
import type { CSSProperties } from "react";

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section
        id="machine-model"
        className="landing-section landing-section--cell landing-section--hero"
      >
        <p className="landing-section-kicker">Machine model</p>
        <h2 className="landing-section-title">Parts on the published schematic.</h2>
        <p className="landing-section-lede">
          The same GLB your OEM published — quotes, tickets, manuals, and service
          history stay on this machine, not in a separate portal.
        </p>
        <LandingCell />
      </section>

      <section id="cad-ingest" className="landing-section landing-section--ingest">
        <p className="landing-section-kicker">SolidWorks &amp; CAD</p>
        <h2 className="landing-section-title">Assembly packs beside your .sldasm.</h2>
        <p className="landing-section-lede">
          The Spares macro writes a GLB and parts list next to the assembly. Staff
          publish once; plants quote against that output on the floor.
        </p>
        <ul className="landing-ingest-formats" aria-label="Supported upload formats">
          <li className="landing-ingest-pill">.sldasm</li>
          <li className="landing-ingest-pill">.sldprt</li>
          <li className="landing-ingest-pill">.glb</li>
          <li className="landing-ingest-pill">Spares macro pack</li>
        </ul>
        <p className="landing-ingest-note">
          Upload path matches staff publish — one schematic for parts and care.
        </p>
      </section>

      <section id="product-story" className="landing-section landing-section--stage">
        <LandingProductStoryIntro className="landing-stage-section-copy" />

        <div className="landing-demo">
          <div className="landing-demo-scrub-stack">
            <LandingDemoScrub ariaLabel="Parts quote on machine model">
              {({ progress, reduceMotion }) => {
                const introFade = reduceMotion ? 0 : Math.max(0, 1 - progress / 0.32);
                return (
                  <>
                    <LandingProductStoryIntro
                      className="landing-stage-pin-intro"
                      aria-hidden={introFade < 0.08 ? true : undefined}
                      style={
                        {
                          "--landing-intro-fade": introFade,
                        } as CSSProperties
                      }
                    />
                    <LandingWorkflowDemo progress={progress} reduceMotion={reduceMotion} />
                  </>
                );
              }}
            </LandingDemoScrub>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--cta">
        <h2 className="landing-section-title">Request access</h2>
        <p className="landing-section-lede">
          Invite-only for plants and OEM partners on palletizers, case packers, and
          similar cells. Share your machines; we review each inquiry. No public signup.
        </p>
        <Link href="/inquire" className="landing-cta">
          Inquire about OEE360
        </Link>
        <p className="landing-section-foot">
          Already have a login? Sign in above with password or Microsoft SSO.
        </p>
      </section>
    </div>
  );
}
