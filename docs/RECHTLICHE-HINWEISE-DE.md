# Rechtliche Hinweise und Haftung

Stand: 18. Juli 2026

Diese Hinweise ergänzen die MIT-Lizenz um eine verständliche Einordnung für Deutschland. Sie verändern die Lizenz nicht und sind keine Rechtsberatung. Für einen gewerblichen, öffentlichen oder sicherheitskritischen Einsatz sollte der konkrete Betrieb rechtlich geprüft werden.

## 1. Open-Source-Software ohne Garantie

VPSPanel wird unter der [MIT-Lizenz](../LICENSE) als Open-Source-Software bereitgestellt. Die Software wird in ihrem jeweiligen Entwicklungsstand ("as is") zur Verfügung gestellt. Es wird insbesondere keine zusätzliche Garantie oder Beschaffenheitszusage dafür übernommen, dass die Software

- jederzeit verfügbar, fehlerfrei oder für einen bestimmten Zweck geeignet ist,
- alle Anwendungen und Repository-Strukturen korrekt erkennt,
- Datenverlust, Fehlkonfigurationen oder Sicherheitsvorfälle verhindert,
- mit jeder zukünftigen Version von Docker, GitHub, Caddy oder anderen Drittdiensten funktioniert.

Dokumentation, Beispiele und Installationsskripte sind allgemeine technische Informationen. Sie ersetzen keine Prüfung der eigenen Infrastruktur und keine individuelle Rechts-, Steuer-, Datenschutz- oder Sicherheitsberatung.

## 2. Zwingende gesetzliche Haftung bleibt unberührt

Dieser Hinweis soll keine Haftung ausschließen oder beschränken, soweit dies nach anwendbarem Recht unzulässig ist. Unberührt bleiben insbesondere gesetzlich zwingende Ansprüche und Haftungstatbestände, etwa

- Haftung für Vorsatz, die nicht im Voraus erlassen werden kann,
- die jeweils anwendbaren Regeln für grobe Fahrlässigkeit sowie Schäden an Leben, Körper oder Gesundheit,
- zwingende Ansprüche nach dem Produkthaftungsrecht,
- ausdrücklich übernommene Garantien, falls solche im Einzelfall tatsächlich erklärt wurden.

Ein pauschaler Ausschluss "jeglicher Haftung" wäre daher keine verlässliche Lösung. Maßgeblich bleiben die MIT-Lizenz, das anwendbare Recht und die Umstände des Einzelfalls.

## 3. Verantwortung der Nutzer und Betreiber

Installation und Betrieb erfolgen in eigener Verantwortung. Vor dem Einsatz sollten Betreiber mindestens

- aktuelle, getestete Backups und einen Wiederherstellungsplan einrichten,
- das Panel zunächst auf einem Testsystem prüfen,
- Firewall, SSH, DNS, TLS, Benutzerrechte und Updates absichern,
- Secrets niemals in Git speichern und kompromittierte Zugangsdaten sofort widerrufen,
- Logs und Deployments überwachen,
- Abhängigkeiten, Container-Images und erzeugte Dockerfiles prüfen,
- für produktive oder personenbezogene Daten eine eigene Risiko- und Datenschutzprüfung durchführen.

Der Deployment-Agent hat Zugriff auf den Docker-Socket. Ein solcher Zugriff ist technisch hochprivilegiert und kann praktisch Kontrolle über den Docker-Host ermöglichen. Der Agent darf deshalb nicht öffentlich erreichbar gemacht oder mit nicht vertrauenswürdigem Code bzw. ungeschützten Tokens betrieben werden.

VPSPanel ist ohne zusätzliche Prüfung und Absicherung nicht für Systeme vorgesehen, deren Ausfall oder Fehlfunktion Menschen gefährden, erhebliche Schäden auslösen oder besondere gesetzliche Anforderungen verletzen könnte.

## 4. Drittanbieter und bereitgestellte Anwendungen

VPSPanel verwendet oder verbindet Drittsoftware und externe Dienste, insbesondere Docker, Caddy, PostgreSQL und GitHub. Für diese gelten deren eigene Lizenzen und Bedingungen. Namen und Marken ihrer jeweiligen Inhaber werden nur beschreibend verwendet; eine geschäftliche Verbindung oder Empfehlung ist damit nicht verbunden.

Der Betreiber ist selbst dafür verantwortlich, dass die über VPSPanel bereitgestellten Anwendungen, Inhalte, Images und Abhängigkeiten rechtmäßig genutzt werden. Das VPSPanel-Projekt prüft fremde Repository-Inhalte nicht und macht sie sich nicht zu eigen.

## 5. Keine Betreiberrolle des Open-Source-Projekts

Wer VPSPanel auf einem eigenen Server installiert, betreibt eine eigenständige Instanz. Die Mitwirkenden dieses Repositories werden dadurch nicht zum Anbieter, Hoster, Auftragsverarbeiter oder Verantwortlichen dieser Instanz. Verantwortlichkeiten des konkreten Betreibers ergeben sich aus seinem tatsächlichen Angebot und seiner Datenverarbeitung.

Für Deutschland enthält die [Betreiber-Checkliste](BETREIBER-CHECKLISTE-DE.md) Hinweise zu Impressum, Datenschutz, Cookies, Verträgen und sicherem Betrieb.

## Maßgebliche Primärquellen

- [§ 276 BGB – Verantwortlichkeit des Schuldners](https://www.gesetze-im-internet.de/bgb/__276.html)
- [§ 309 Nr. 7 BGB – Grenzen von Haftungsausschlüssen in AGB](https://www.gesetze-im-internet.de/bgb/__309.html)
- [§ 14 ProdHaftG – Unabdingbarkeit](https://www.gesetze-im-internet.de/prodhaftg/__14.html)
- [§ 5 DDG – Allgemeine Informationspflichten](https://www.gesetze-im-internet.de/ddg/__5.html)
- [DSGVO, insbesondere Artikel 13 und 32](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679)
- [§ 25 TDDDG – Schutz der Privatsphäre bei Endeinrichtungen](https://www.gesetze-im-internet.de/ttdsg/__25.html)
