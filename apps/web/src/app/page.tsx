"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { SessionUser } from "@pacaembu/contracts";
import { AppShell, SupervisorOverview } from "../components/app-shell";
import { Loading } from "../components/ui";

function BrokerRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/leads");
  }, [router]);
  return <Loading>Abrindo sua carteira…</Loading>;
}

function Home({ user }: { user: SessionUser }) {
  return user.role === "broker" ? (
    <BrokerRedirect />
  ) : (
    <SupervisorOverview user={user} />
  );
}

export default function HomePage() {
  return (
    <AppShell title="Visão geral">{(user) => <Home user={user} />}</AppShell>
  );
}
