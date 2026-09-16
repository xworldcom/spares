"use client";

import { useCallback, useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandMark } from "@/components/brand/BrandMark";
import { LandingStage } from "@/components/landing/LandingStage";
import "./landing.css";

export function LandingScreen({
  nextPath = "/machines",
  microsoftSignInEnabled = false,
  passwordLoginEnabled = true,
  authErrorCode = null,
}: {
  nextPath?: string;
  microsoftSignInEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  authErrorCode?: string | null;
}) {
  const [entered, setEntered] = useState(false);

  const handleReady = useCallback(() => {
    setEntered(true);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), 1800);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={entered ? "landing-screen is-in" : "landing-screen"}>
      <LandingStage onReady={handleReady} />
      <div className="landing-curtain" />
      <div className="landing-veil" />
      <div className="landing-copy">
        <div className="landing-panel">
          <p className="landing-kicker">Private</p>
          <BrandMark size="hero" className="landing-wordmark" />
          <p className="landing-lede">
            Overall equipment effectiveness, seen all the way around — the
            machine, the spare, the quote, the care.
          </p>
          <LoginForm
            nextPath={nextPath}
            microsoftSignInEnabled={microsoftSignInEnabled}
            passwordLoginEnabled={passwordLoginEnabled}
            authErrorCode={authErrorCode}
          />
        </div>
      </div>
    </div>
  );
}
