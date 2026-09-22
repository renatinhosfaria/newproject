"use client";

import { useParams } from "next/navigation";
import { AppShell, SupervisorOverview } from "../../../components/app-shell";
import { ConversationView } from "../../../components/conversation-view";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell title="Conversa">
      {(user) =>
        user.role === "broker" ? (
          <ConversationView key={id} conversationId={id} />
        ) : (
          <SupervisorOverview user={user} />
        )
      }
    </AppShell>
  );
}
