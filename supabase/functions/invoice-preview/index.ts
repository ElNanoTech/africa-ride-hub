// invoice-preview — serves Open Graph metadata for shared invoice links.
// Detects social crawlers (WhatsApp, iMessage, Slack, Facebook, Twitter, etc.)
// and returns rich HTML with invoice-specific OG tags. Human visitors are
// redirected to the SPA's /factures/public/:token route.
//
// This is the same pattern Stripe / GitHub / Apple use for shareable links:
// one canonical URL that bots see as metadata and humans see as the app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_ORIGIN = Deno.env.get("APP_PUBLIC_ORIGIN") ?? "https://drivedam.com";
const OG_FALLBACK_IMAGE = `${APP_ORIGIN}/og-image.png`;

const CRAWLER_UA_REGEX =
  /(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|WhatsApp|Applebot|iMessage|SkypeUriPreview|Embedly|Pinterest|redditbot|vkShare|W3C_Validator|Googlebot|bingbot|DuckDuckBot|YandexBot|baiduspider|MetaInspector|Mastodon|Bluesky|Threads|Snapchat|GoogleBot)/i;

function isCrawler(ua: string | null): boolean {
  if (!ua) return false;
  return CRAWLER_UA_REGEX.test(ua);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}

function formatDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function buildHtml(opts: {
  title: string;
  description: string;
  url: string;
  image: string;
  redirectUrl: string;
}): string {
  const { title, description, url, image, redirectUrl } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const img = escapeHtml(image);
  const r = escapeHtml(redirectUrl);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${t}</title>
    <meta name="description" content="${d}" />

    <!-- Open Graph (Facebook, WhatsApp, iMessage, LinkedIn, Slack…) -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="DAM Flotte" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="fr_FR" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />

    <!-- Apple iMessage rich preview -->
    <meta name="apple-mobile-web-app-title" content="DAM Flotte" />
    <link rel="apple-touch-icon" href="${escapeHtml(APP_ORIGIN)}/apple-touch-icon.png" />

    <link rel="canonical" href="${u}" />

    <!-- Auto-redirect humans who somehow land here (crawlers ignore this) -->
    <meta http-equiv="refresh" content="0; url=${r}" />
    <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:40px;text-align:center;color:#333;">
    <h1>${t}</h1>
    <p>${d}</p>
    <p><a href="${r}" style="color:#22c55e;font-weight:600;">Ouvrir la facture →</a></p>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Path is /functions/v1/invoice-preview/<token> OR ?token=<token>
    const segments = url.pathname.split("/").filter(Boolean);
    const tokenFromPath = segments[segments.length - 1];
    const token = url.searchParams.get("token") ?? (tokenFromPath !== "invoice-preview" ? tokenFromPath : null);

    if (!token || !/^[a-f0-9-]{8,}$/i.test(token)) {
      return new Response("Invalid token", { status: 400, headers: corsHeaders });
    }

    const ua = req.headers.get("user-agent");
    const crawler = isCrawler(ua);
    const spaUrl = `${APP_ORIGIN}/factures/public/${token}`;

    // Humans → straight redirect to the React app, no extra hop visible.
    if (!crawler) {
      return Response.redirect(spaUrl, 302);
    }

    // Crawler → fetch invoice metadata and serve OG-rich HTML.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv } = await admin
      .from("invoice")
      .select(
        "invoice_number, invoice_kind, status, total_ttc, issued_at, period_start, period_end, driver_snapshot_name, legal_name_snapshot, token_expires_at",
      )
      .eq("public_token", token)
      .maybeSingle();

    let title = "Facture DAM Flotte";
    let description = "Consultez votre facture en ligne sur DAM Flotte.";

    if (inv) {
      const kindLabel = inv.invoice_kind === "monthly_statement" ? "Relevé mensuel" : "Facture";
      const number = inv.invoice_number ?? "";
      const amount = formatCurrency(Number(inv.total_ttc) || 0);
      const issuer = inv.legal_name_snapshot || "DAM Flotte";

      title = `${kindLabel} ${number} — ${amount}`.trim();

      const parts: string[] = [];
      if (inv.driver_snapshot_name) parts.push(`Conducteur : ${inv.driver_snapshot_name}`);
      if (inv.period_start && inv.period_end) {
        parts.push(`Période : ${formatDate(inv.period_start)} → ${formatDate(inv.period_end)}`);
      } else if (inv.issued_at) {
        parts.push(`Émise le ${formatDate(inv.issued_at)}`);
      }
      parts.push(`Émetteur : ${issuer}`);
      if (inv.status === "paid") parts.push("Statut : Payée ✓");
      else if (inv.status === "cancelled") parts.push("Statut : Annulée");
      description = parts.join(" • ");
    }

    const html = buildHtml({
      title,
      description,
      url: `${APP_ORIGIN}/f/${token}`,
      image: OG_FALLBACK_IMAGE,
      redirectUrl: spaUrl,
    });

    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=300, s-maxage=600");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(html, { status: 200, headers });
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500, headers: corsHeaders });
  }
});
