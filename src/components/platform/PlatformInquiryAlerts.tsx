"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listPlatformInquiries } from "@/lib/api/platform-inquiries";

export function usePlatformInquiryAlerts() {
  const { user } = useAuth();
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!user?.platformOwner) {
      setNewCount(0);
      return;
    }
    let cancelled = false;
    listPlatformInquiries()
      .then((response) => {
        if (!cancelled) {
          setNewCount(response.newCount);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNewCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.platformOwner, user?.email]);

  return { newCount };
}
