export interface Fixture {
  userId: string;
  workspaceId: string;
  membershipId: string;
  brokerId: string | null;
  email: string;
  password: string;
}

export interface Fixtures {
  supervisor: Fixture;
  brokerA: Fixture;
  brokerB: Fixture;
  brokerC: Fixture;
  multiWorkspace: Fixture;
  followUpAgentId: string;
}
