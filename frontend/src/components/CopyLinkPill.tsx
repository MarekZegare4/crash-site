import { useState } from "react";

export default function CopyLinkPill({ label, href }: { label: string; href: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="linkPill">
      <span className="linkPillLabel">{label}</span>
      <span className="mono linkPillUrl">{href}</span>
      <button className="linkPillCopy" onClick={copy}>{copied ? "✓" : "⎘"}</button>
    </div>
  );
}
