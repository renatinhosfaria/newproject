"use client";

import { useParams } from "next/navigation";
import { AppShell, SupervisorOverview } from "../../../components/app-shell";
import { AgentPanel } from "../../../components/agent-panel";

export default function AgentSessionPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell title="Agent Atendimento">
      {(user) =>
        user.role === "broker" ? (
          // Keyed by session: switching sessions remounts and aborts streams.
          <AgentPanel key={id} sessionId={id} />
        ) : (
          <SupervisorOverview user={user} />
        )
      }
    </AppShell>
  );
}
