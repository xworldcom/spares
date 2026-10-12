"use client";

import { DocumentTitle } from "@/components/nav/DocumentTitle";

export function RouteDocumentTitle({ title }: { title: string }) {
  return <DocumentTitle title={title} />;
}
