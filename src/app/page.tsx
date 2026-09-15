"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LandingScreen } from "@/components/landing/LandingScreen";

export default function Home() {
  const { status, user } = useAuth();
  const router = useRouter();
  const signedIn = status === "signed-in" && user;

  useEffect(() => {
    if (signedIn) {
      router.replace("/machines");
    }
  }, [router, signedIn]);

  if (signedIn) {
    return null;
  }

  return <LandingScreen />;
}
