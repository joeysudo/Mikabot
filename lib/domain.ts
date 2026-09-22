export const platforms = ["instagram", "facebook", "linkedin", "x"] as const;
export type Platform = (typeof platforms)[number];
export const labels: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
};
export const limits: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  x: 280,
};
export type Brief = {
  offering: string;
  audience: string;
  tone: string;
  goal: string;
  facts: string;
};
export type Post = {
  id: string;
  title: string;
  captions: Partial<Record<Platform, string>>;
  platforms: Platform[];
  plannedAt: string;
  imageUrl: string;
  status: "draft" | "review" | "approved" | "published";
  revision: number;
  approvedRevision: number | null;
  createdAt: string;
  updatedAt: string;
};
export type Account = {
  id: string;
  platform: Platform;
  label: string;
  remoteId: string;
  expiresAt: number;
  active: number;
};
export type Attempt = {
  id: string;
  postId: string;
  platform: Platform;
  revision: number;
  status: string;
  remoteId: string | null;
  error: string | null;
  createdAt: string;
};
export const defaultBrief: Brief = {
  offering: "",
  audience: "",
  tone: "Warm and helpful",
  goal: "",
  facts: "",
};
export function isPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" &&
    (platforms as readonly string[]).includes(value)
  );
}
export function cleanText(
  value: unknown,
  max: number,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error("Check the required text fields and their length.");
  return value.trim();
}
export function validateBrief(input: unknown): Brief {
  const x = input as Brief;
  if (!x || typeof x !== "object") throw new Error("A brief is required.");
  return {
    offering: cleanText(x.offering, 300),
    audience: cleanText(x.audience, 300),
    tone: cleanText(x.tone, 100),
    goal: cleanText(x.goal, 500),
    facts: cleanText(x.facts, 3000),
  };
}
export function validatePost(input: unknown) {
  const x = input as Post;
  if (
    !x ||
    !Array.isArray(x.platforms) ||
    !x.platforms.length ||
    x.platforms.length > 4 ||
    !x.platforms.every(isPlatform) ||
    new Set(x.platforms).size !== x.platforms.length
  )
    throw new Error("Select one or more supported channels.");
  const captions: Partial<Record<Platform, string>> = {};
  for (const p of x.platforms) captions[p] = cleanText(x.captions?.[p], 64000);
  let plannedAt = cleanText(x.plannedAt, 40);
  if (plannedAt) {
    if (!Number.isFinite(Date.parse(plannedAt)))
      throw new Error("Choose a valid date.");
    plannedAt = new Date(plannedAt).toISOString();
  }
  const imageUrl = cleanText(x.imageUrl, 2000);
  if (imageUrl) {
    const u = new URL(imageUrl);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hostname === "localhost" ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.includes(":")
    )
      throw new Error("Use a public HTTPS image URL.");
  }
  return {
    title: cleanText(x.title, 160, true),
    captions,
    platforms: x.platforms,
    plannedAt,
    imageUrl,
  };
}
// Conservative X estimate counts every code point as two, and URLs as 23. This may reject
// some valid posts but must never silently truncate them. Provider validation remains final.
export function contentLength(p: Platform, text: string) {
  if (p !== "x") return [...text].length;
  const urls = text.match(/https?:\/\/\S+/g) || [];
  return [...text.replace(/https?:\/\/\S+/g, "")].length * 2 + urls.length * 23;
}
export function publishIssue(post: Post, p: Platform) {
  if (!post.platforms.includes(p)) return "This channel is not selected.";
  if (!post.captions[p]?.trim()) return "Write a caption before approval.";
  if (/\[(Add|Insert|TODO|Your)[^\]]*\]/i.test(post.captions[p]!))
    return "Replace the placeholder with verified content.";
  if (contentLength(p, post.captions[p]!) > limits[p])
    return `${labels[p]} caption is too long.`;
  if (p === "instagram" && !post.imageUrl)
    return "Instagram requires a public HTTPS JPEG image URL.";
  return null;
}
export function assertPublishable(post: Post, p: Platform) {
  if (post.status !== "approved" || post.approvedRevision !== post.revision)
    throw new Error("Approve the current revision before publishing.");
  const issue = publishIssue(post, p);
  if (issue) throw new Error(issue);
}
export function makePlan(
  brief: Brief,
  chosen: Platform[],
  start: string,
): Array<ReturnType<typeof validatePost>> {
  if (!brief.offering || !brief.goal)
    throw new Error("Add what you offer and your goal first.");
  const base = new Date(start);
  if (!Number.isFinite(base.getTime()))
    throw new Error("Choose a valid plan start.");
  const themes = [
    [
      "Start with your story",
      `Meet ${brief.offering}.\n\nWe’re here for ${brief.audience || "our community"}. What would you like to know?`,
    ],
    [
      "Share something useful",
      `${brief.offering}\n\n${brief.facts || "[Add one verified tip or useful fact before publishing.]"}\n\nSave this for later.`,
    ],
    [
      "Start a conversation",
      `What matters most to you when choosing ${brief.offering}?\n\nWe’d love to hear your perspective.`,
    ],
  ];
  return themes.map(([title, text], i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * 2);
    const captions: Partial<Record<Platform, string>> = {};
    for (const p of chosen)
      captions[p] =
        p === "x"
          ? `${brief.offering.slice(0, 65)}: what matters most to you?`
          : p === "linkedin"
            ? `${title}.\n\n${text}\n\nWhat has your experience been?`
            : text;
    return {
      title,
      captions,
      platforms: chosen,
      plannedAt: d.toISOString(),
      imageUrl: "",
    };
  });
}
