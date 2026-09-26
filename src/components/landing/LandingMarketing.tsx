"use client";

import Link from "next/link";
import { LandingCell } from "@/components/landing/LandingCell";
import { LandingDemoScrub } from "@/components/landing/LandingDemoScrub";
import { LandingProductDemo } from "@/components/landing/LandingProductDemo";
import { LandingWorkflowDemo } from "@/components/landing/LandingWorkflowDemo";

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section
        id="machine-model"
        className="landing-section landing-section--cell landing-section--hero"
      >
        <p className="landing-section-kicker">The schematic</p>
        <h2 className="landing-section-title">Your 3D model is the hero.</h2>
        <p className="landing-section-lede">
          Orbit the cell, tap the part on the model, and keep quotes and care on
          the geometry the floor already trusts — not another generic help desk.
        </p>
        <LandingCell />
      </section>

      <section id="cad-ingest" className="landing-section landing-section--ingest">
        <p className="landing-section-kicker">From CAD to floor</p>
        <h2 className="landing-section-title">Upload SolidWorks assemblies direct.</h2>
        <p className="landing-section-lede">
          Start from your native CAD: export a pack from SolidWorks or drop the
          GLB the Spares macro writes beside your assembly. One ingest becomes the
          interactive schematic your plant quotes and services against.
        </p>
        <ul className="landing-ingest-formats" aria-label="Supported upload formats">
          <li className="landing-ingest-pill">.sldasm</li>
          <li className="landing-ingest-pill">.sldprt</li>
          <li className="landing-ingest-pill">.glb</li>
          <li className="landing-ingest-pill">Spares macro pack</li>
        </ul>
        <p className="landing-ingest-note">
          Staff publish from SolidWorks or upload a pack in the app — the same 3D
          output your customers see on the floor.
        </p>
      </section>

      <section id="product-story" className="landing-section landing-section--stage">
        <p className="landing-section-kicker">The workflow</p>
        <h2 className="landing-section-title">Model → part → quote. Keep scrolling.</h2>
        <p className="landing-section-lede">
          One pinned chapter walks the floor path: open the cell, spin it, tap the
          wear part, add lines, and send the quote request — then see how Care keeps
          the same machine in thread.
        </p>

        <div className="landing-demo">
          <div className="landing-demo-scrub-stack">
            <LandingDemoScrub ariaLabel="Model to quote workflow">
              {({ progress, reduceMotion }) => (
                <LandingWorkflowDemo progress={progress} reduceMotion={reduceMotion} />
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

      <section className="landing-section landing-section--cta">
        <h2 className="landing-section-title">Request access</h2>
        <p className="landing-section-lede">
          OEE360 stays invite-only for plants and OEM partners running industrial
          equipment. Tell us about your machines and we will review each inquiry.
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
