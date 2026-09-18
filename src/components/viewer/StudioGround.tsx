"use client";

import { Grid } from "@react-three/drei";

/** Floor grid shared by the machine PartPicker and marketing OrbitStage. */
export function StudioGround({ position = [0, -0.02, 0] as [number, number, number] }) {
  return (
    <group position={position}>
      <Grid
        args={[24, 24]}
        cellSize={0.2}
        cellThickness={0.7}
        cellColor="#5b6776"
        sectionSize={1}
        sectionThickness={1.15}
        sectionColor="#8b98a8"
        fadeDistance={16}
        fadeStrength={1.15}
        infiniteGrid
        followCamera={false}
      />
    </group>
  );
}
