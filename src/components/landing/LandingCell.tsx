"use client";

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { OrbitStage } from "@/components/landing/OrbitStage";

class CellStageGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("landing cell stage failed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}

export function LandingCell() {
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    setWebgl(Boolean(gl));
  }, []);

  return (
    <div className="landing-cell">
      <div className="landing-cell-fallback" aria-hidden="true">
        <span className="landing-cell-block landing-cell-block--base" />
        <span className="landing-cell-block landing-cell-block--mast" />
        <span className="landing-cell-block landing-cell-block--arm" />
        <span className="landing-cell-block landing-cell-block--load" />
      </div>
      {webgl ? (
        <CellStageGuard>
          <OrbitStage interactive />
        </CellStageGuard>
      ) : null}
    </div>
  );
}
