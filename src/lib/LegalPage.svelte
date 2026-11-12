<script lang="ts">
  import type { LegalTab } from './types';

  let {
    initialTab = 'privacy',
    onBack
  }: {
    initialTab?: LegalTab;
    onBack: () => void;
  } = $props();

  let activeTab = $state<LegalTab>('privacy');

  $effect(() => {
    activeTab = initialTab;
  });

  const tabLabels: Record<LegalTab, string> = {
    privacy: 'Datenschutzerklärung',
    terms: 'Nutzungsbedingungen',
    cookies: 'Cookie-Einstellungen',
    impressum: 'Impressum'
  };

  function selectTab(tab: LegalTab) {
    activeTab = tab;
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
  }

  // Cookie & Storage Manager helper
  let cacheStatus = $state<{ matchesCount: number; hasApiKey: boolean }>({
    matchesCount: 0,
    hasApiKey: false
  });
  let cacheClearFeedback = $state<string | null>(null);

  function readStorageStatus() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('volleyball_offline_matches');
      const matches = raw ? JSON.parse(raw) : [];
      const key = localStorage.getItem('VOLLEYBALL_API_KEY');
      cacheStatus = {
        matchesCount: Array.isArray(matches) ? matches.length : 0,
        hasApiKey: Boolean(key && key.trim())
      };
    } catch {
      cacheStatus = { matchesCount: 0, hasApiKey: false };
    }
  }

  $effect(() => {
    readStorageStatus();
  });

  function handleClearCache() {
    if (!confirm('Möchtest du den lokalen App-Speicher (Offline-Puffer und gespeicherten Team-PIN) wirklich leeren?')) {
      return;
    }
    try {
      localStorage.removeItem('volleyball_offline_matches');
      localStorage.removeItem('VOLLEYBALL_API_KEY');
      localStorage.removeItem('volleyball_custom_formations');
      localStorage.removeItem('setpoint_active_match');
      localStorage.removeItem('activeMatch');
      readStorageStatus();
      cacheClearFeedback = 'Lokaler App-Speicher wurde erfolgreich geleert.';
      setTimeout(() => {
        cacheClearFeedback = null;
      }, 4000);
    } catch (e) {
      cacheClearFeedback = 'Fehler beim Leeren des Speichers.';
    }
  }
</script>

<div class="legal-view">
  <!-- HEADER -->
  <header class="legal-header">
    <div class="legal-header-inner">
      <button type="button" class="legal-back-btn" onclick={onBack}>
        ← Zurück
      </button>

      <div class="legal-title-wrap">
        <h1 class="legal-title">SetPoint — Rechtliche Hinweise</h1>
        <p class="legal-subtitle">
          {tabLabels[activeTab]}
        </p>
      </div>
    </div>

    <!-- TAB LEISTE -->
    <div class="legal-tabs" role="tablist" aria-label="Rechtliche Bereiche">
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'privacy'}
        aria-selected={activeTab === 'privacy'}
        onclick={() => selectTab('privacy')}
      >
        Privacy Policy
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'terms'}
        aria-selected={activeTab === 'terms'}
        onclick={() => selectTab('terms')}
      >
        Terms of Service
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'cookies'}
        aria-selected={activeTab === 'cookies'}
        onclick={() => selectTab('cookies')}
      >
        Cookie Settings
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'impressum'}
        aria-selected={activeTab === 'impressum'}
        onclick={() => selectTab('impressum')}
      >
        Impressum
      </button>
    </div>
  </header>

  <!-- BODY CONTENT -->
  <div class="legal-body">
    <div class="editor-hint">
      <strong>Hinweis zum Ausfüllen:</strong> Du kannst die nachfolgenden Textbausteine direkt in der Datei
      <code>src/lib/LegalPage.svelte</code> mit deinen individuellen Vereins- oder Betreiberdaten anpassen.
    </div>

    <!-- 1. PRIVACY POLICY / DATENSCHUTZERKLÄRUNG -->
    {#if activeTab === 'privacy'}
      <article class="legal-article" aria-labelledby="heading-privacy">
        <h2 id="heading-privacy" class="article-title">Datenschutzerklärung (Privacy Policy)</h2>
        <span class="article-meta">Stand: November 2026</span>

        <section class="legal-section">
          <h3>1. Allgemeine Hinweise & Verantwortlicher</h3>
          <p>
            Der Schutz deiner persönlichen Daten ist uns ein wichtiges Anliegen. Wir behandeln deine
            personenbezogenen Daten vertraulich und entsprechend den gesetzlichen Datenschutzvorschriften
            (DSGVO / GDPR) sowie dieser Datenschutzerklärung.
          </p>
          <div class="fill-box">
            <strong>Verantwortliche Stelle für die Datenverarbeitung:</strong><br />
            <!-- HIER AUSFÜLLEN / FILL IN HERE -->
            Markus Li<br />
            E-Mail: manfredo103@icloud.de<br />
          </div>
        </section>

        <section class="legal-section">
          <h3>2. Datenerfassung in dieser Web-Anwendung</h3>
          <p>
            SetPoint dient dem Live-Scouting, der Aufstellungsverwaltung und der sportlichen
            Spielverlaufsdokumentation von Volleyballspielen.
          </p>
          <ul>
            <li>
              <strong>Spieler- und Mannschaftsdaten:</strong> Teamnamen, Spielernamen, Rückennummern,
              Positionen und Rollen (z.B. Zuspiel, Libero, Mittelblock) werden ausschließlich zur Darstellung
              des Spielstands und der Rotationen erfasst.
            </li>
            <li>
              <strong>Match-Events:</strong> Punkte, Side-outs, Satzstände, Angriffs-, Block- und Annahme-Bewertungen
              sowie Zeitstempel während des Spiels.
            </li>
            <li>
              <strong>Lokale Zwischenspeicherung (Offline-First):</strong> Eingegebene Daten werden im lokalen
              Speicher deines Browsers (<code>localStorage</code>) vorgehalten, um eine unterbrechungsfreie
              Nutzung auch bei schwacher oder fehlender Hallen-Netzwerkverbindung zu gewährleisten.
            </li>
          </ul>
        </section>

        <section class="legal-section">
          <h3>3. Übertragung an den Server & InfluxDB-Schnittstelle</h3>
          <p>
            Ein Upload von Spieldaten erfolgt ausschließlich auf deine explizite Aktion (über die Schaltfläche
            „Spiel speichern“ oder „Jetzt alle hochladen“). Die Daten werden verschlüsselt an die angeschlossene
            Go-Backend-Schnittstelle übermittelt und in der projekteigenen InfluxDB-Instanz zur Multi-Satz-Analyse
            abgelegt.
          </p>
          <p>
            Optional wird zur Autorisierung ein Team-PIN / API-Key (<code>X-API-Key</code>) übermittelt.
          </p>
        </section>

        <section class="legal-section">
          <h3>4. Weitergabe an Dritte & Tracking</h3>
          <p>
            Es findet <strong>kein Tracking</strong> (wie Google Analytics, Meta Pixel oder sonstige Werbenetzwerke)
            statt. Deine Daten werden zu keinem Zeitpunkt an unbefugte Dritte weitergegeben oder zu Werbezwecken genutzt.
          </p>
        </section>

        <section class="legal-section">
          <h3>5. Deine Rechte (Auskunft, Berichtigung, Löschung)</h3>
          <p>
            Du hast jederzeit das Recht auf unentgeltliche Auskunft über deine gespeicherten personenbezogenen
            Daten, deren Herkunft und Empfänger sowie den Zweck der Datenverarbeitung und ein Recht auf
            Berichtigung oder Löschung dieser Daten. Wende dich hierzu an die oben angegebene verantwortliche Stelle.
          </p>
        </section>
      </article>

    <!-- 2. TERMS OF SERVICE / NUTZUNGSBEDINGUNGEN -->
    {:else if activeTab === 'terms'}
      <article class="legal-article" aria-labelledby="heading-terms">
        <h2 id="heading-terms" class="article-title">Terms of Service (Nutzungsbedingungen)</h2>
        <span class="article-meta">Gültig ab: November 2026</span>

        <section class="legal-section">
          <h3>1. Geltungsbereich & Nutzungszweck</h3>
          <p>
            Diese Nutzungsbedingungen gelten für die Nutzung der SetPoint Web-Applikation zur Erfassung,
            taktischen Begleitung und statistischen Auswertung von Volleyballspielen. Die Nutzung steht
            Trainer/innen, Schiedsrichter/innen, Spieler/innen und Teams zu privaten, vereinsbezogenen
            sowie sportanalytischen Zwecken zur Verfügung.
          </p>
        </section>

        <section class="legal-section">
          <h3>2. Verfügbarkeit & Offline-Funktionalität</h3>
          <p>
            Die Anwendung ist als Progressive Web App (PWA) konzipiert und darauf ausgelegt, auch ohne
            aktive Internetverbindung in Sporthallen Daten auf dem Endgerät zwischenzuspeichern.
            Es besteht jedoch kein Rechtsanspruch auf permanente Erreichbarkeit externer Synchronisationsserver
            oder Datenbank-Backends.
          </p>
        </section>

        <section class="legal-section">
          <h3>3. Regelwerks-Konformität (FIVB)</h3>
          <p>
            Die automatische Satz- und Spielende-Erkennung orientiert sich an den Regeln der FIVB
            (25 Punkte mit mindestens 2 Punkten Vorsprung bzw. Tie-Break Regelung). Die Software dient der
            Unterstützung des Spielbetriebs; verbindlich für offizielle Wertungen bleibt der offizielle
            Spielberichtsbogen des jeweiligen Volleyball-Verbandes.
          </p>
        </section>

        <section class="legal-section">
          <h3>4. Haftungsausschluss</h3>
          <p>
            <!-- HIER AUSFÜLLEN / ANPASSEN -->
            Für unvollständige Eingaben, Fehlbedienungen durch Dritte oder Datenverluste aufgrund lokaler
            Browser-Bereinigungen wird keine Haftung übernommen, soweit nicht vorsätzliches oder grob
            fahrlässiges Handeln vorliegt.
          </p>
        </section>

        <section class="legal-section">
          <h3>5. Geistiges Eigentum & Urheberrecht</h3>
          <p>
            Das Design, die Algorithmen zur Rotationsprüfung und die Visualisierungen dieser Web-App sind
            urheberrechtlich geschützt.
          </p>
        </section>
      </article>

    <!-- 3. COOKIE SETTINGS / SPEICHERDATEN -->
    {:else if activeTab === 'cookies'}
      <article class="legal-article" aria-labelledby="heading-cookies">
        <h2 id="heading-cookies" class="article-title">Cookie-Einstellungen & Lokale Speicherdaten</h2>
        <span class="article-meta">Transparente Übersicht deiner Browserdaten</span>

        <section class="legal-section">
          <div class="cookie-banner-box">
            <div class="cookie-status-badge">100% Tracking-Frei</div>
            <p>
              SetPoint setzt <strong>keine Werbe- oder Marketing-Cookies</strong> von Drittanbietern ein.
              Wir nutzen ausschließlich technisch notwendige Browser-Speichermechanismen
              (<code>localStorage</code>), um deine Spiele auch offline in der Halle zuverlässig zu sichern.
            </p>
          </div>
        </section>

        <section class="legal-section">
          <h3>Verwendete Speicher-Elemente</h3>
          <div class="storage-table-wrap">
            <table class="storage-table">
              <thead>
                <tr>
                  <th>Schlüssel</th>
                  <th>Typ</th>
                  <th>Zweck</th>
                  <th>Speicherdauer</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>volleyball_offline_matches</code></td>
                  <td>Technisch notwendig (LocalStorage)</td>
                  <td>Sichert beendete Spiele lokal, wenn keine Verbindung zum Go-Backend besteht.</td>
                  <td>Bis zum erfolgreichen Upload oder manuellem Löschen</td>
                </tr>
                <tr>
                  <td><code>VOLLEYBALL_API_KEY</code></td>
                  <td>Funktional (LocalStorage)</td>
                  <td>Merkt sich deinen Team-PIN / API-Key für autorisierte Uploads zur InfluxDB.</td>
                  <td>Dauerhaft auf diesem Gerät</td>
                </tr>
                <tr>
                  <td><code>volleyball_custom_formations</code></td>
                  <td>Funktional (LocalStorage)</td>
                  <td>Speichert manuell justierte Spielerpositionen für die Taktiktafel.</td>
                  <td>Dauerhaft auf diesem Gerät</td>
                </tr>
                <tr>
                  <td><code>setpoint_active_match</code></td>
                  <td>Technisch notwendig (LocalStorage)</td>
                  <td>Sichert den aktuellen Spielstand, Sätze, Rotationen und Events bei versehentlichem Neuladen.</td>
                  <td>Bis zum Spielabschluss („Neues Spiel“)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="legal-section">
          <h3>Lokaler Speicherstatus auf diesem Gerät</h3>
          <div class="cache-status-card">
            <div class="cache-stat-item">
              <span class="cs-label">Lokal gepufferte Spiele:</span>
              <span class="cs-val">{cacheStatus.matchesCount} Spiel(e)</span>
            </div>
            <div class="cache-stat-item">
              <span class="cs-label">Team-PIN hinterlegt:</span>
              <span class="cs-val">{cacheStatus.hasApiKey ? 'Ja (Aktiv)' : 'Nein (Nicht gesetzt)'}</span>
            </div>

            <div class="cache-actions">
              <button type="button" class="cache-clear-btn" onclick={handleClearCache}>
                Lokalen Speicher leeren
              </button>
            </div>

            {#if cacheClearFeedback}
              <div class="cache-feedback">{cacheClearFeedback}</div>
            {/if}
          </div>
        </section>
      </article>

    <!-- 4. IMPRESSUM / ANBIETERKENNZEICHNUNG -->
    {:else if activeTab === 'impressum'}
      <article class="legal-article" aria-labelledby="heading-impressum">
        <h2 id="heading-impressum" class="article-title">Impressum</h2>
        <span class="article-meta">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</span>

        <section class="legal-section">
          <h3>Diensteanbieter / Betreiber</h3>
          <div class="fill-box">
            <!-- HIER AUSFÜLLEN / FILL IN HERE -->
            <strong>Markus Li</strong><br />
            <!--[Musterstraße 123]<br />
            [12345 Musterstadt, Deutschland]<br /><br /> -->
            <strong>Kontakt:</strong><br />
            <!--Telefon: [+49 (0) 123 456789]<br /> -->
            E-Mail: manfredo103@icloud.com<br />
            <!--Website: [https://deine-domain.de] -->
          </div>
        </section>

<!--
        <section class="legal-section">
          <h3>Vertretungsberechtigte Person(en)</h3>
          <p>
            Markus Li (Inhaber / Verantwortlicher)
          </p>
        </section>
        <section class="legal-section">
          <h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
          <div class="fill-box">
            Markus Li<br />
            [Musterstraße 123, 12345 Musterstadt, Deutschland]
          </div>
        </section>
-->
        <section class="legal-section">
          <h3>Haftung für Inhalte</h3>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs.1 DDG für eigene Inhalte auf diesen Seiten nach den
            allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht
            verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen
            zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
          </p>
        </section>

        <section class="legal-section">
          <h3>Haftung für Links</h3>
          <p>
            Unser Angebot enthält unter Umständen Links zu externen Websites Dritter, auf deren Inhalte wir
            keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
            Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten
            verantwortlich.
          </p>
        </section>

        <section class="legal-section">
          <h3>Urheberrecht</h3>
          <p>
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
            Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
            Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
        </section>
      </article>
    {/if}

    <div class="legal-footer-nav">
      <button type="button" class="back-link-btn" onclick={onBack}>
        ← Zurück zur App
      </button>
    </div>
  </div>
</div>

<style>
  .legal-view {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    color: #0f172a;
    box-sizing: border-box;
  }

  .legal-header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    padding: 12px 16px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    position: sticky;
    top: 0;
    z-index: 50;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .legal-header-inner {
    max-width: 1140px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }

  .legal-back-btn {
    background: #334155;
    color: #ffffff;
    border: 1px solid #475569;
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .legal-back-btn:hover {
    background: #475569;
  }

  .legal-title-wrap {
    flex: 1;
    min-width: 0;
  }

  .legal-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .legal-subtitle {
    margin: 2px 0 0;
    font-size: 0.72rem;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .legal-tabs {
    max-width: 1140px;
    margin: 0 auto;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
  }

  .tab-btn.active {
    background: #2563eb;
    color: #ffffff;
    border-color: #3b82f6;
  }

  .legal-body {
    max-width: 1140px;
    width: 100%;
    margin: 0 auto;
    padding: 16px 14px 32px;
    box-sizing: border-box;
    flex: 1;
  }

  .editor-hint {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.78rem;
    line-height: 1.4;
    margin-bottom: 20px;
  }

  .editor-hint code {
    background: #dbeafe;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 700;
    color: #1e3a8a;
  }

  .legal-article {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 24px 20px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
  }

  .article-title {
    margin: 0 0 4px;
    font-size: 1.3rem;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .article-meta {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
    margin-bottom: 20px;
  }

  .legal-section {
    margin-bottom: 22px;
  }

  .legal-section:last-child {
    margin-bottom: 0;
  }

  .legal-section h3 {
    margin: 0 0 8px;
    font-size: 0.95rem;
    font-weight: 800;
    color: #1e293b;
  }

  .legal-section p {
    margin: 0 0 10px;
    font-size: 0.85rem;
    line-height: 1.6;
    color: #334155;
  }

  .legal-section ul {
    margin: 0 0 10px;
    padding-left: 20px;
    font-size: 0.85rem;
    line-height: 1.6;
    color: #334155;
  }

  .legal-section li {
    margin-bottom: 6px;
  }

  .fill-box {
    background: #f8fafc;
    border: 1.5px dashed #cbd5e1;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 0.84rem;
    line-height: 1.5;
    color: #1e293b;
    margin: 10px 0;
  }

  .cookie-banner-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
  }

  .cookie-status-badge {
    display: inline-block;
    background: #10b981;
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 9999px;
    margin-bottom: 10px;
    letter-spacing: 0.04em;
  }

  .storage-table-wrap {
    overflow-x: auto;
    margin: 12px 0;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .storage-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    text-align: left;
  }

  .storage-table th {
    background: #f1f5f9;
    padding: 10px 12px;
    font-weight: 700;
    color: #334155;
    border-bottom: 1px solid #e2e8f0;
  }

  .storage-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    line-height: 1.4;
  }

  .storage-table tr:last-child td {
    border-bottom: none;
  }

  .storage-table code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.76rem;
    color: #0f172a;
    font-weight: 600;
  }

  .cache-status-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 14px 16px;
  }

  .cache-stat-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 0.82rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .cache-stat-item:last-of-type {
    border-bottom: none;
  }

  .cs-label {
    color: #64748b;
  }

  .cs-val {
    font-weight: 700;
    color: #0f172a;
  }

  .cache-actions {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
  }

  .cache-clear-btn {
    background: #fee2e2;
    color: #b91c1c;
    border: 1px solid #fca5a5;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cache-clear-btn:hover {
    background: #fecaca;
  }

  .cache-feedback {
    margin-top: 10px;
    font-size: 0.78rem;
    color: #15803d;
    font-weight: 700;
  }

  .legal-footer-nav {
    margin-top: 24px;
    display: flex;
    justify-content: center;
  }

  .back-link-btn {
    background: none;
    border: 1.5px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  }

  .back-link-btn:hover {
    background: #f1f5f9;
  }

  @media (min-width: 768px) {
    .legal-article {
      padding: 32px 28px;
    }

    .article-title {
      font-size: 1.45rem;
    }
  }
</style>
