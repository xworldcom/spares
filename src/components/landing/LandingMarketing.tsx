"use client";

import Link from "next/link";
import { LandingCell } from "@/components/landing/LandingCell";
import { LandingDemoScrub } from "@/components/landing/LandingDemoScrub";
import { LandingProductStoryIntro } from "@/components/landing/LandingProductStoryIntro";
import { LandingWorkflowDemo } from "@/components/landing/LandingWorkflowDemo";
import { workflowIntroFade, workflowScrubPlayhead } from "@/lib/ui/landing-demo";
import type { CSSProperties } from "react";

export function LandingMarketing() {
  return (
    <div className="landing-marketing" aria-label="About OEE360">
      <section id="product-story" className="landing-section landing-section--stage">
        <LandingProductStoryIntro className="landing-stage-section-copy" />

        <div className="landing-demo">
          <div className="landing-demo-scrub-stack">
            <LandingDemoScrub ariaLabel="Parts quote on machine model">
              {({ progress, reduceMotion }) => {
                const introFade = reduceMotion
                  ? 0
                  : workflowIntroFade(workflowScrubPlayhead(progress));
                return (
                  <>
                    {introFade > 0.08 ? (
                      <LandingProductStoryIntro
                        className="landing-stage-pin-intro"
                        style={
                          {
                            "--landing-intro-fade": introFade,
                            opacity: introFade,
                          } as CSSProperties
                        }
                      />
                    ) : null}
                    <LandingWorkflowDemo progress={progress} reduceMotion={reduceMotion} />
                  </>
                );
              }}
            </LandingDemoScrub>
          </div>
        </div>
      </section>

      <section id="machine-model" className="landing-section landing-section--cell">
        <h2 className="landing-section-title">Parts on the schematic.</h2>
        <LandingCell />
      </section>

      <section id="cad-ingest" className="landing-section landing-section--ingest">
        <h2 className="landing-section-title">Assembly packs beside your .sldasm.</h2>
        <p className="landing-section-lede">
          The Spares macro writes a GLB and a parts list next to the assembly.
        </p>
        <ul className="landing-ingest-formats" aria-label="Supported upload formats">
          <li className="landing-ingest-pill">.sldasm</li>
          <li className="landing-ingest-pill">.sldprt</li>
          <li className="landing-ingest-pill">.glb</li>
          <li className="landing-ingest-pill">Spares macro pack</li>
        </ul>
      </section>

      <section className="landing-section landing-section--cta">
        <h2 className="landing-section-title">Request access</h2>
        <Link href="/inquire" className="landing-cta">
          Request access
        </Link>
        <p className="landing-section-foot">
          Already have a login?{" "}
          <Link href="/login" className="landing-section-foot-link">
            Sign in
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
