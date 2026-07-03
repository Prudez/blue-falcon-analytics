// Display names and chart colors for social platforms. The built-in four
// have curated labels; user-added platforms (open PlatformSlug set) fall
// back to a title-cased slug and the shared "other" color, so an unknown
// platform never renders as undefined.

export const KNOWN_PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X",
};

const KNOWN_PLATFORM_COLORS = {
  facebook: "var(--chart-navy)",
  instagram: "var(--chart-purple)",
  tiktok: "var(--chart-teal)",
  twitter: "var(--chart-amber)",
};

export function platformLabel(slug) {
  return (
    KNOWN_PLATFORM_LABELS[slug] ??
    slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function platformColor(slug) {
  return KNOWN_PLATFORM_COLORS[slug] ?? "var(--chart-purple)";
}
