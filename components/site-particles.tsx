"use client";

import dynamic from "next/dynamic";

const ParticleField = dynamic(
  () => import("@/components/particle-field").then((mod) => mod.ParticleField),
  { ssr: false },
);

export function SiteParticles() {
  return <ParticleField />;
}
