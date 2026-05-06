import { createPortal } from "react-dom";
import { useT, useLang } from "../i18n";

interface Props {
  onClose: () => void;
}

export default function HelpModal({ onClose }: Props) {
  const t = useT();
  const { lang } = useLang();
  const en = lang === "en";

  const sections: { titleKey: Parameters<typeof t>[0]; body: React.ReactNode }[] = [
    {
      titleKey: "help_map_title",
      body: en ? (
        <>
          Click any pin to view listing details.{" "}
          <b style={{ color: "var(--accent-ink)" }}>Orange</b> = lost,{" "}
          <b style={{ color: "var(--found)" }}>green</b> = found / resolved.{" "}
          The <b>▣</b> button hides or shows all side panels.
        </>
      ) : (
        <>
          Kliknij pinezkę, aby zobaczyć szczegóły ogłoszenia.{" "}
          <b style={{ color: "var(--accent-ink)" }}>Pomarańczowa</b> = zgubiony,{" "}
          <b style={{ color: "var(--found)" }}>zielona</b> = znaleziony / rozwiązany.{" "}
          Przycisk <b>▣</b> ukrywa lub pokazuje wszystkie panele boczne.
        </>
      ),
    },
    {
      titleKey: "help_search_title",
      body: en ? (
        <>
          Filter by status (<b>All · Lost · Found</b>) or type a drone model,
          nick or keyword in the search box.
        </>
      ) : (
        <>
          Filtruj po statusie (<b>Wszystkie · Zgubiony · Znaleziony</b>) lub
          wpisz model drona, nick właściciela albo słowo kluczowe.
        </>
      ),
    },
    {
      titleKey: "help_add_title",
      body: en ? (
        <>
          Log in, then tap <b>+</b> to report a lost or found drone. Set the{" "}
          <b>location</b> (point, circle or area), add a <b>photo</b> and
          contact info.
        </>
      ) : (
        <>
          Zaloguj się, a następnie kliknij <b>+</b>, aby zgłosić drona. Ustaw{" "}
          <b>lokalizację</b> (punkt, okrąg lub obszar), dodaj <b>zdjęcie</b> i
          kontakt.
        </>
      ),
    },
    {
      titleKey: "help_listings_title",
      body: en ? (
        <>
          Open <b>My listings</b> to manage your reports — mark as found, edit
          details, or renew expiring ones.
        </>
      ) : (
        <>
          Otwórz <b>Moje ogłoszenia</b>, aby zarządzać zgłoszeniami — oznaczaj
          jako znaleziony, edytuj lub odnawiaj wygasające.
        </>
      ),
    },
    {
      titleKey: "help_sticker_title",
      body: en ? (
        <>
          Generate a printable <b>QR sticker</b> in <b>Account settings</b> and
          attach it to your drone. A finder can scan it to contact you instantly.
        </>
      ) : (
        <>
          W <b>ustawieniach konta</b> wygeneruj <b>naklejkę z kodem QR</b> i
          naklejkę na drona. Znalazca może ją zeskanować, aby natychmiast się z
          Tobą skontaktować.
        </>
      ),
    },
    {
      titleKey: "help_shortcut_title",
      body: en ? (
        <>
          Press <b>H</b> at any time to open this help screen again.
        </>
      ) : (
        <>
          Naciśnij <b>H</b> w dowolnym momencie, aby ponownie otworzyć ten
          ekran.
        </>
      ),
    },
  ];

  return createPortal(
    <div className="reportOverlay" onClick={onClose}>
      <div className="helpModal" onClick={(e) => e.stopPropagation()}>
        <div className="detailHead">
          <span className="idCode">{t("help_title")}</span>
          <button className="ghostBtn" onClick={onClose}>✕</button>
        </div>
        <div className="helpGrid">
          {sections.map(({ titleKey, body }) => (
            <div key={titleKey} className="helpSection">
              <strong className="helpSectionTitle">{t(titleKey)}</strong>
              <p className="helpSectionBody">{body}</p>
            </div>
          ))}
        </div>
        <div className="helpFooter">
          <button className="primaryBtn" onClick={onClose}>{t("help_close")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
