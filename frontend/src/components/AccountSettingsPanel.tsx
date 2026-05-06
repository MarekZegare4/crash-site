import { useState } from "react";
import { checkNickAvailable, deleteAccount, updateUserNickContact } from "../api";
import type { AuthUser } from "../api";
import { useT, useLang } from "../i18n";
import { siteOrigin } from "../utils";
import CopyLinkPill from "./CopyLinkPill";

interface Props {
  currentUser: AuthUser;
  onUserUpdated: (nick: string | null, contact: string | null, nickNextAllowed: string | null) => void;
  onLogout: () => void;
  onStickerOpen: () => void;
  onHelpOpen: () => void;
  onClose: () => void;
}

export default function AccountSettingsPanel({ currentUser, onUserUpdated, onLogout, onStickerOpen, onHelpOpen, onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const [editNick, setEditNick] = useState(currentUser.nick ?? "");
  const [editContact, setEditContact] = useState(currentUser.contact ?? "");
  const [nickChecking, setNickChecking] = useState(false);
  const [nickTaken, setNickTaken] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [nickCooldownUntil, setNickCooldownUntil] = useState<Date | null>(
    () => currentUser.nickNextAllowed ? new Date(currentUser.nickNextAllowed) : null
  );
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(false);

  async function handleNickBlur() {
    const nick = editNick.trim();
    if (!nick || nick === currentUser.nick || nick.length < 2) { setNickTaken(false); return; }
    setNickChecking(true);
    const available = await checkNickAvailable(nick).catch(() => true);
    setNickChecking(false);
    setNickTaken(!available);
  }

  async function handleSaveAccount() {
    const nick = editNick.trim() || null;
    const contact = editContact.trim() || null;
    if (nickTaken) return;
    setAccountSaving(true);
    try {
      const updated = await updateUserNickContact(nick, contact);
      onUserUpdated(updated.nick, updated.contact, updated.nickNextAllowed);
      if (updated.nickNextAllowed) setNickCooldownUntil(new Date(updated.nickNextAllowed));
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (err) {
      if (err instanceof Error && err.message === "nick_taken") setNickTaken(true);
      else if (err instanceof Error && err.message.startsWith("nick_cooldown:")) {
        setNickCooldownUntil(new Date(err.message.slice("nick_cooldown:".length)));
      }
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmWord = lang === "pl" ? "USUŃ" : "DELETE";
    const input = window.prompt(t("account_deleteConfirm"));
    if (input?.trim() !== confirmWord) return;
    setDeletingAccount(true);
    setDeleteAccountError(false);
    try {
      await deleteAccount();
      onLogout();
    } catch {
      setDeleteAccountError(true);
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <>
      <div className="menuDivider" />
      <div className="formGrid">
        <div className="formRow" style={{ flexDirection: "column", gap: 4 }}>
          <span className="formLbl">{t("account_displayName")}</span>
          <span style={{ fontWeight: 600 }}>{currentUser.displayName}</span>
          <span className="hintText" style={{ margin: 0 }}>{currentUser.provider}</span>
        </div>
      </div>
      <div className="shareSection">
        <CopyLinkPill
          label={t("share_link")}
          href={`${siteOrigin()}/u/${currentUser.id}`}
        />
        <button className="secondaryBtn" onClick={onStickerOpen}>
          {t("share_sticker")}
        </button>
      </div>
      <div className="menuDivider" />
      <h2>{t("account_settingsTitle")}</h2>
      <div className="formGrid">
        <div className="formRow" style={{ flexDirection: "column", gap: 4 }}>
          <span className="formLbl">{t("settings_nick")}</span>
          <input
            value={editNick}
            onChange={(e) => { setEditNick(e.target.value); setNickTaken(false); setNickCooldownUntil(null); }}
            onBlur={() => void handleNickBlur()}
            placeholder={t("settings_nickPh")}
            disabled={!!nickCooldownUntil && nickCooldownUntil > new Date()}
          />
          {nickChecking && <span className="hintText" style={{ margin: 0 }}>{t("account_nickChecking")}</span>}
          {nickTaken && <span className="error" style={{ margin: 0 }}>{t("account_nickTaken")}</span>}
          {nickCooldownUntil && nickCooldownUntil > new Date() && (
            <span className="hintText" style={{ margin: 0 }}>
              {t("account_nickCooldown", { date: nickCooldownUntil.toLocaleDateString(t("date_locale")) })}
            </span>
          )}
        </div>
        <label className="formRow">
          <span className="formLbl">{t("settings_contact")}</span>
          <input value={editContact} onChange={(e) => setEditContact(e.target.value)} placeholder={t("settings_contactPh")} />
        </label>
      </div>
      <button
        className="secondaryBtn"
        onClick={() => void handleSaveAccount()}
        disabled={accountSaving || nickTaken}
        style={{ marginTop: 8 }}
      >
        {accountSaved ? t("account_saved") : accountSaving ? t("account_saving") : t("account_save")}
      </button>
      <div className="menuDivider" />
      <button className="secondaryBtn" onClick={onHelpOpen}>{t("help_open")}</button>
      <button className="secondaryBtn" onClick={onLogout}>{t("auth_logout")}</button>
      <div className="menuDivider" />
      <div className="dangerZone">
        <span className="dangerZoneLabel">{t("account_deleteZone")}</span>
        <button
          className="dangerBtn"
          onClick={() => void handleDeleteAccount()}
          disabled={deletingAccount}
        >
          {deletingAccount ? t("account_deleteDeleting") : t("account_delete")}
        </button>
        {deleteAccountError && <span className="error" style={{ margin: 0 }}>{t("account_deleteError")}</span>}
      </div>
    </>
  );
}
