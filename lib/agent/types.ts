export const channels = [
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "discord",
  "telegram",
  "whatsapp",
  "sms",
  "email",
] as const;
export type Channel = (typeof channels)[number];
export const channelNames: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};
export type AgentPolicy = {
  accountKey: string;
  mode: "paused" | "observe" | "assist" | "auto";
  maxReplies: number;
};
export type Inbound = {
  id: string;
  accountKey: string;
  channel: Channel;
  externalId: string;
  threadId: string;
  text: string;
  context: string;
  occurredAt: string;
  route: Record<string, string>;
  demo?: boolean;
};
export type FAQ = {
  id: string;
  question: string;
  answer: string;
  approved: boolean;
};
export type TraceStep = {
  skill: string;
  summary: string;
  evidence: string[];
  status: "complete" | "blocked" | "skipped";
};
export type Decision = {
  intent: string;
  action: "ignore" | "draft" | "escalate" | "auto_reply";
  reason: string;
  reply: string;
  trace: TraceStep[];
};
export type AgentItem = {
  id: string;
  message: Inbound;
  decision: Decision;
  status:
    | "new"
    | "review"
    | "ready"
    | "sending"
    | "sent"
    | "uncertain"
    | "failed"
    | "dismissed"
    | "observed";
  revision: number;
  remoteId?: string;
  error?: string;
};
export type Connection = {
  key: string;
  channel: Channel;
  label: string;
  ready: boolean;
  capability: string;
  policy: AgentPolicy;
};
export const skillCatalog = [
  {
    id: "read_context",
    name: "Read the room",
    description:
      "Read the parent post and recent conversation before deciding what a message needs.",
  },
  {
    id: "check_risk",
    name: "Know when to ask",
    description:
      "Escalate complaints, financial decisions, sensitive requests and uncertain context.",
  },
  {
    id: "retrieve_knowledge",
    name: "Use approved knowledge",
    description:
      "Find an exact approved FAQ match. Never invent prices, availability or policies.",
  },
  {
    id: "audience_signals",
    name: "Spot audience interests",
    description:
      "Surface recurring words in monitored conversations, with dates and message references. These are local audience signals, not global trends.",
  },
  {
    id: "draft_reply",
    name: "Write a grounded reply",
    description:
      "Use an approved answer or an AI-assisted draft grounded in the available context.",
  },
  {
    id: "policy_gate",
    name: "Check the account rules",
    description:
      "Respect per-account mode, daily limit, conversation cooldown, message freshness and opt-outs.",
  },
  {
    id: "deliver_reply",
    name: "Reply and record",
    description:
      "Send once through the official adapter and retain the provider acknowledgement. Uncertain delivery is never retried automatically.",
  },
];
