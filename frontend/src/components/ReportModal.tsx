import { useState } from "react";
import { createPortal } from "react-dom";
import { submitReport, type ReportReason } from "../api";
import { useT } from "../i18n";

interface Props {
  listingId: string;
  onClose: () => void;
}

const REASONS: ReportReason[] = ["inappropriate_photo", "vulgar_text", "spam", "other"];

export default function ReportModal({ listingId, onClose }: Props) {
  const t = useT();
  const [reason, setReason] = useState<ReportReason>("inappropriate_photo");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reasonLabel: Record<ReportReason, string> = {
    inappropriate_photo: t("report_reasonPhoto"),
    vulgar_text: t("report_reasonText"),
    spam: t("report_reasonSpam"),
    other: t("report_reasonOther"),
  };

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitReport(listingId, reason, comment.trim() || undefined);
      setDone(true);
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="reportOverlay" onClick={onClose}>
      <div className="reportModal" onClick={(e) => e.stopPropagation()}>
        <div className="detailHead">
          <div className="detailId">
            <svg className="panelIcon" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: "var(--danger)" }}>
              <path d="M3 2v12M3 2h8l-2 3.5 4 3.5H3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
            <span className="idCode">{t("report_title")}</span>
          </div>
          <button className="ghostBtn" onClick={onClose}>✕</button>
        </div>

        {done ? (
          <div className="reportBody reportDone">
            <span className="reportDoneIcon">✓</span>
            <p>{t("report_done")}</p>
            <button className="secondaryBtn" onClick={onClose}>OK</button>
          </div>
        ) : (
          <div className="reportBody">
            <p className="detailDesc">{t("report_desc")}</p>

            <div className="formGrid">
              <div className="formRow" style={{ flexDirection: "column", gap: 6 }}>
                <span className="formLbl">{t("report_reason")}</span>
                <div className="reportReasons">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      className={`reportReasonBtn${reason === r ? " reportReasonActive" : ""}`}
                      onClick={() => setReason(r)}
                    >
                      {reasonLabel[r]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="formRow">
                <span className="formLbl">{t("report_comment")}</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("report_commentPh")}
                  rows={3}
                  maxLength={500}
                />
              </label>
            </div>

            <button
              className="secondaryBtn"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              style={{ marginTop: 8 }}
            >
              {submitting ? t("report_submitting") : t("report_submit")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
