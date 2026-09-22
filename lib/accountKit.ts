import { generateWithGemini } from "./ai";
import type { Env } from "./db";

export const accountChannels = [
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

export type AccountChannel = (typeof accountChannels)[number];

const officialUrls: Record<AccountChannel, string> = {
  instagram: "https://www.instagram.com/accounts/emailsignup/",
  facebook: "https://www.facebook.com/pages/create/",
  linkedin: "https://www.linkedin.com/signup",
  x: "https://x.com/i/flow/signup",
  discord: "https://discord.com/developers/applications",
  telegram: "https://t.me/BotFather",
  whatsapp: "https://business.whatsapp.com/",
  sms: "https://www.twilio.com/try-twilio",
  email: "https://accounts.google.com/signup",
};

export type AccountKit = {
  brandName: string;
  usernameIdeas: string[];
  bioShort: string;
  bioLong: string;
  profileChecklist: string[];
  channels: Array<{
    channel: AccountChannel;
    officialUrl: string;
    steps: string[];
  }>;
};

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export async function createAccountKit(env: Env, input: unknown) {
  const x = (input || {}) as Record<string, unknown>;
  const offering = clean(x.offering);
  const audience = clean(x.audience);
  const tone = clean(x.tone, 120);
  const brandName = clean(x.brandName, 80);
  const requested = Array.isArray(x.channels) ? x.channels : [];
  const channels = requested.filter((channel): channel is AccountChannel =>
    accountChannels.includes(channel as AccountChannel),
  );
  if (!offering || !audience)
    throw new Error("Describe what you offer and who it is for.");
  if (!channels.length) throw new Error("Choose at least one channel.");

  const schema = {
    type: "object",
    required: [
      "brandName",
      "usernameIdeas",
      "bioShort",
      "bioLong",
      "profileChecklist",
      "channels",
    ],
    properties: {
      brandName: { type: "string" },
      usernameIdeas: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "string" },
      },
      bioShort: { type: "string" },
      bioLong: { type: "string" },
      profileChecklist: {
        type: "array",
        minItems: 4,
        maxItems: 8,
        items: { type: "string" },
      },
      channels: {
        type: "array",
        minItems: channels.length,
        maxItems: channels.length,
        items: {
          type: "object",
          required: ["channel", "steps"],
          properties: {
            channel: { type: "string", enum: channels },
            steps: {
              type: "array",
              minItems: 2,
              maxItems: 5,
              items: { type: "string" },
            },
          },
        },
      },
    },
  };
  const text = await generateWithGemini(
    env,
    "You are Mika, an account setup assistant. Create a concise, practical brand profile kit for the selected communication channels. Use only the user's facts. Never claim a username is available. Do not request or include passwords, identity documents, phone numbers, verification codes, payment details or other secrets. The user must personally accept terms, complete captchas and verification, and grant permissions. Match the user's language. Return JSON matching the schema.",
    { brandName, offering, audience, tone, channels },
    schema,
  );
  const parsed = JSON.parse(text) as Omit<AccountKit, "channels"> & {
    channels: Array<{ channel: AccountChannel; steps: string[] }>;
  };
  if (!Array.isArray(parsed.channels) || parsed.channels.length !== channels.length)
    throw new Error("Mika returned an incomplete setup kit. Try again.");
  return {
    ...parsed,
    usernameIdeas: parsed.usernameIdeas.slice(0, 6),
    profileChecklist: parsed.profileChecklist.slice(0, 8),
    channels: parsed.channels.map((item) => ({
      channel: item.channel,
      officialUrl: officialUrls[item.channel],
      steps: item.steps.slice(0, 5),
    })),
  } satisfies AccountKit;
}
