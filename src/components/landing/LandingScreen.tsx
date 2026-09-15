"use client";

import { LoginForm } from "@/components/auth/LoginForm";
import { BrandMark } from "@/components/brand/BrandMark";
import { OrbitStage } from "@/components/landing/OrbitStage";
import "./landing.css";

export function LandingScreen({ nextPath = "/machines" }: { nextPath?: string }) {
  return (
    <div className="landing-screen">
      <OrbitStage />
      <div className="landing-veil" />
      <div className="landing-copy">
        <div className="landing-panel">
          <p className="landing-kicker">Private</p>
          <BrandMark size="hero" className="mt-4" />
          <p className="landing-lede">
            Overall equipment effectiveness, seen all the way around — the
            machine, the spare, the quote, the care.
          </p>
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </div>
  );
}
