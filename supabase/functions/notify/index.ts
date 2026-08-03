// Fired by a DB trigger on reports INSERT (x-app-token = app_config.webhook_token).
// Renders the report and emails it via Resend, then stamps email_sent_at.
import { db, requireToken } from "../_shared/plaid.ts";

Deno.serve(async (req) => {
  const unauth = await requireToken(req, "webhook_token");
  if (unauth) return unauth;

  const { record } = await req.json();
  if (!record?.id || !record?.subject) {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("EMAIL_TO") ?? "cole@twoboxes.com";
  const from = Deno.env.get("EMAIL_FROM") ?? "callout <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn(`notify: RESEND_API_KEY not set; skipping email for report ${record.id}`);
    return Response.json({ skipped: "no RESEND_API_KEY" });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: record.subject,
      html: mdToHtml(record.body_md),
      text: record.body_md,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`notify: resend failed for report ${record.id}: ${err}`);
    return Response.json({ error: err }, { status: 502 });
  }

  await db.from("reports").update({ email_sent_at: new Date().toISOString() }).eq("id", record.id);
  return Response.json({ ok: true });
});

// Minimal markdown: headings, bold, bullets, paragraphs. Reports are simple.
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const lines = esc(md).split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^#{1,3} /.test(bold)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = bold.match(/^#+/)![0].length;
      out.push(`<h${level + 1}>${bold.replace(/^#+ /, "")}</h${level + 1}>`);
    } else if (/^[-*] /.test(bold)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${bold.slice(2)}</li>`);
    } else if (bold.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${bold}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return `<div style="font-family:-apple-system,sans-serif;max-width:600px">${out.join("\n")}</div>`;
}
