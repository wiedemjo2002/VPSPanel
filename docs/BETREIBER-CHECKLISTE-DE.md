# Betreiber-Checkliste für Deutschland

Stand: 18. Juli 2026

Diese Checkliste richtet sich an Personen und Unternehmen, die eine eigene VPSPanel-Instanz betreiben. Sie ist eine technische Orientierung und kein fertiger Rechtstext. Ob einzelne Pflichten gelten, hängt unter anderem davon ab, ob die Instanz privat, intern, öffentlich, geschäftsmäßig oder entgeltlich betrieben wird.

## Vor der Veröffentlichung

### 1. Verantwortlichen festlegen

Dokumentiere, wer die Instanz tatsächlich betreibt und Entscheidungen über Zwecke und Mittel der Datenverarbeitung trifft. Trenne dabei klar zwischen

- den Mitwirkenden des Open-Source-Projekts,
- dem VPS- oder Hostinganbieter,
- dem Betreiber deiner VPSPanel-Instanz,
- den Verantwortlichen der über das Panel deployten Anwendungen.

### 2. Anbieterkennzeichnung prüfen

Für geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste verlangt § 5 DDG leicht erkennbare, unmittelbar erreichbare und ständig verfügbare Anbieterinformationen. Ob dein Angebot darunter fällt, muss anhand des konkreten Betriebs geprüft werden.

Typische Angaben können sein:

- vollständiger Name bzw. Firma und Rechtsform,
- ladungsfähige Anschrift,
- vertretungsberechtigte Person,
- E-Mail-Adresse und weiterer schneller Kontaktweg,
- Register und Registernummer, sofern vorhanden,
- Umsatzsteuer- oder Wirtschafts-Identifikationsnummer, sofern vorhanden,
- Aufsichtsbehörde oder berufsrechtliche Angaben, wenn einschlägig.

Lege diese Angaben nicht als ungeprüfte Platzhalter öffentlich ab. Erstelle ein echtes Impressum erst mit den zutreffenden Betreiberinformationen und verlinke es von jeder öffentlich erreichbaren Einstiegsseite.

### 3. Datenschutzhinweise erstellen

VPSPanel kann je nach Nutzung insbesondere folgende Daten verarbeiten:

- GitHub-ID, Benutzername und Avatar-URL,
- verschlüsseltes GitHub-OAuth-Token,
- gehashte Sitzungstokens und technisch erforderliche Cookies,
- Repository-, Projekt-, Domain- und Deployment-Metadaten,
- verschlüsselte Umgebungsvariablen und Datenbank-Zugangsdaten,
- Build-, Container-, Zugriffs- und Fehlerprotokolle,
- IP-Adressen und Zeitstempel in Proxy-, Server- oder Provider-Logs.

Datenschutzhinweise müssen zum tatsächlichen Betrieb passen und unter anderem Verantwortlichen, Zwecke, Rechtsgrundlagen, Datenkategorien, Empfänger, Drittlandtransfers, Speicherdauer, Betroffenenrechte und Beschwerdemöglichkeiten erklären. Artikel 13 DSGVO verlangt diese Informationen grundsätzlich zum Zeitpunkt der Datenerhebung.

Prüfe insbesondere:

- Welche Logs werden von Caddy, Docker, dem Hoster und den Anwendungen erzeugt?
- Wie lange werden Sessions, Deployments, Backups und Logs gespeichert?
- Werden GitHub oder andere Anbieter außerhalb der EU/des EWR einbezogen?
- Bestehen erforderliche Auftragsverarbeitungsverträge, etwa mit dem Hoster?
- Wer bearbeitet Auskunfts-, Berichtigungs- und Löschanfragen?
- Welche technischen und organisatorischen Maßnahmen erfüllen das risikogerechte Schutzniveau nach Artikel 32 DSGVO?

### 4. Cookies und ähnliche Zugriffe

Das Panel setzt technisch erforderliche Session- und OAuth-State-Cookies. Dokumentiere Zweck und Lebensdauer in den Datenschutzhinweisen. § 25 Abs. 2 TDDDG sieht für unbedingt erforderliche Zugriffe eine Ausnahme vom Einwilligungserfordernis vor. Ob ein Cookie tatsächlich unbedingt erforderlich ist, muss für den konkreten Einsatz beurteilt werden.

Füge Analyse-, Tracking- oder Marketingdienste nicht ohne gesonderte rechtliche Prüfung hinzu.

### 5. Verträge und Nutzungsbedingungen

Sobald Dritte die Instanz nutzen, können zusätzliche Regeln erforderlich sein, zum Beispiel

- interne Nutzungs- und Berechtigungskonzepte,
- Verträge zur Auftragsverarbeitung,
- Leistungsbeschreibung, Supportumfang und Verfügbarkeit,
- zulässige Inhalte und Verfahren bei Missbrauch,
- Lösch-, Export- und Beendigungsprozesse,
- rechtswirksame Haftungs- und Gewährleistungsregeln für das konkrete Vertragsmodell.

Die allgemeinen Hinweise dieses Repositories sind keine AGB für deinen Dienst.

## Technische Mindestmaßnahmen

- DNS und HTTPS vor dem produktiven Einsatz vollständig prüfen.
- Firewall aktivieren und nur erforderliche Ports veröffentlichen.
- SSH-Zugriff härten; Passwort-Login und Root-Login nach Möglichkeit deaktivieren.
- GitHub-, Agent-, Session- und Datenbank-Secrets zufällig erzeugen und regelmäßig rotieren.
- Zugriff auf .env, Backups und Docker-Socket streng begrenzen.
- Updates und Sicherheitsmeldungen für Host, Docker, Images und Abhängigkeiten verfolgen.
- Wiederherstellung aus Backups regelmäßig testen.
- Administrative Zugriffe und fehlgeschlagene Deployments überwachen.
- Produktiv- und Testdaten strikt trennen.
- Löschfristen technisch umsetzen, nicht nur dokumentieren.

## Ausfüllhilfe vor dem Go-live

Die folgenden Punkte gehören in deine eigene Dokumentation, nicht unverändert in dieses Repository:

~~~text
Betreiber / Verantwortlicher: [vollständiger Name oder Firma]
Anschrift: [ladungsfähige Anschrift]
Kontakt: [E-Mail und ggf. weiterer Kontaktweg]
Hostinganbieter: [Name, Sitz, Vertragsrolle]
Zwecke der Verarbeitung: [konkret beschreiben]
Rechtsgrundlagen: [für jeden Zweck prüfen]
Empfänger / Drittlandtransfers: [konkret beschreiben]
Speicher- und Löschfristen: [konkret beschreiben]
Datenschutzkontakt / DSB: [falls vorhanden oder erforderlich]
Zuständige Datenschutzaufsicht: [konkret bestimmen]
Stand der Hinweise: [Datum]
~~~

## Primärquellen

- [§ 5 DDG – Allgemeine Informationspflichten](https://www.gesetze-im-internet.de/ddg/__5.html)
- [DSGVO – Artikel 12, 13, 28 und 32](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679)
- [§ 25 TDDDG – Cookies und Endeinrichtungen](https://www.gesetze-im-internet.de/ttdsg/__25.html)
- [Rechtliche Hinweise für das VPSPanel-Projekt](RECHTLICHE-HINWEISE-DE.md)
