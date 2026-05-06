import { useState } from "react";
import { createPortal } from "react-dom";
import { checkNickAvailable, updateUserNickContact } from "../api";
import { useT } from "../i18n";

interface Props {
  contact: string | null;
  onDone: (nick: string) => void;
}

export default function NickSetupModal({ contact, onDone }: Props) {
  const t = useT();
  const [nick, setNick] = useState("");
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlur() {
    const v = nick.trim();
    if (!v || v.length < 2) { setTaken(false); return; }
    setChecking(true);
    const available = await checkNickAvailable(v).catch(() => true);
    setChecking(false);
    setTaken(!available);
  }

  async function handleSave() {
    const v = nick.trim();
    if (!v || v.length < 2 || taken) return;
    setSaving(true);
    setError(null);
    try {
      await updateUserNickContact(v, contact);
      onDone(v);
    } catch (err) {
      if (err instanceof Error && err.message === "nick_taken") {
        setTaken(true);
      } else {
        setError(t("err_createFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  const valid = nick.trim().length >= 2 && !taken;

  return createPortal(
    <div className="nickSetupOverlay">
      <div className="nickSetupCard">
        <div className="detailHead" style={{ borderBottom: "1px solid var(--line)", marginBottom: 0 }}>
          <div className="detailId">
            <span className="statusDot statusFound" />
            <span className="idCode">crash_site</span>
            <span className="detailKind">{t("nickSetup_sub")}</span>
          </div>
        </div>

        <div className="nickSetupBody">
          <h2 style={{ margin: "0 0 6px" }}>{t("nickSetup_title")}</h2>
          <p className="detailDesc" style={{ margin: "0 0 20px" }}>{t("nickSetup_desc")}</p>

          <div className="formRow" style={{ flexDirection: "column", gap: 4 }}>
            <span className="formLbl">{t("settings_nick")}</span>
            <input
              value={nick}
              onChange={e => { setNick(e.target.value); setTaken(false); }}
              onBlur={() => void handleBlur()}
              placeholder={t("settings_nickPh")}
              autoFocus
              maxLength={60}
            />
            {checking && <span className="hintText" style={{ margin: 0 }}>{t("account_nickChecking")}</span>}
            {taken && <span className="error" style={{ margin: 0 }}>{t("account_nickTaken")}</span>}
          </div>

          {error && <p className="error" style={{ margin: "8px 0 0" }}>{error}</p>}

          <button
            className="primaryBtn"
            style={{ marginTop: 16, width: "100%" }}
            onClick={() => void handleSave()}
            disabled={!valid || saving}
          >
            {saving ? t("account_saving") : t("nickSetup_confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
