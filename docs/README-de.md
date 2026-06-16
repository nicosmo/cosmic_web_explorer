# Cosmic Web Explorer


[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.18915566-blue.svg)](https://doi.org/10.5281/zenodo.18915566) und [![arXiv](https://img.shields.io/badge/arXiv-2603.18145-b31b1b.svg)](https://arxiv.org/abs/2603.18145)

[** Live Demo**](https://nicosmo.github.io/cosmic_web_explorer/)


<p align="center">
  <video src="https://github.com/user-attachments/assets/a6712709-7ea4-48f9-bd26-4f384046de06" autoplay loop muted playsinline width="40%"></video>
</p>



**Ursprüngliches Konzept von [Simon Bouchard](https://github.com/SBouchard01) und [Nico Schuster](https://orcid.org/0000-0001-5620-8554) | Entwicklung von [Nico Schuster](https://orcid.org/0000-0001-5620-8554). Übersetzung ins Deutsche von Nico Schuster.**

Eine interaktive Echtzeit-Simulation der großräumigen Struktur (LSS) des Universums, die vollständig in deinem Browser läuft.

Dieses Projekt visualisiert die nichtlineare Entwicklung einer anfänglichen Verteilung von Materieteilchen. Beobachten, wie ursprüngliche Fluktuationen unter dem Einfluss der Schwerkraft und der kosmischen Expansion kollabieren und ein komplexes Netzwerk aus kosmischen Voids, Filamenten und Halos bilden.

Die Entwicklung wird durch die Kombination der analytischen Lagrange-Störungstheorie zweiter Ordnung (2LPT) mit einem lokalen, quasi-N-Körper-Gravitationsschema (aktiviert im „Play“-Modus) berechnet. Die Simulation nutzt WebGL für hochleistungsfähiges Rendering und WebGPU (mit CPU-Fallback) für parallele physikalische Berechnungen.


> **Hinweis zur physikalischen Genauigkeit**
> Dies ist ein pädagogisches und Visualisierungswerkzeug. Um eine flüssige, interaktive Darstellung direkt im Browser zu gewährleisten, sollte man sich den Cosmic Web Explorer am besten als „2,5D-Universum“ vorstellen, als einen dünnen Ausschnitt eines 3D-Universums, der auf eine 2D-Ebene projiziert wird. Wir gehen hinsichtlich der physikalischen Genauigkeit einige strenge Kompromisse ein:
> - *Wechselwirkungen & Kräfte:* Während die Hintergrundexpansion $H(z)$, der Wachstumsfaktor $D_1(z)$ und die Übertragungsfunktionen streng aus der 3D-Physik abgeleitet werden, finden Teilchenwechselwirkungen auf einer 2D-Ebene statt. Folglich wird durch die Verwendung einer 2D-$1/r$-Gravitationskraft die realistische Bildung dichter 3D-Halos zugunsten eines beschleunigten, visuell eindrucksvollen Netzwerks kosmischer Filamente geopfert.
> - *Auflösungsgrenzen:* Eine geringe Tracer-Anzahl (20k – 200k) kann zu strukturellen Artefakten führen. Darüber hinaus werden lokale Gravitationskräfte künstlich abgeschnitten, um interaktive Bildraten aufrechtzuerhalten.
> - *Phänomenologische Modelle:* Echte Gashydrodynamik fehlt. Die kollisionsfreie Dynamik wird über ein „Adhäsions“-Modell approximiert, um zu verhindern, dass Cluster visuell explodieren, und ein phänomenologisches Modell wird implementiert, um zu verhindern, dass Tracer zu einzelnen Punktmassen kollabieren.
> - *Redshift Space:* Dient der visuellen Veranschaulichung von Tracern im Rotverschiebungsraum und ist nicht vollkommen genau. Das Geschwindigkeitsfeld in der Sichtlinie wird näherungsweise modelliert, um Verzerrungsmuster hervorzuheben. Daher sollte die angezeigte RSD-Amplitude qualitativ interpretiert werden und nicht als exakte Beobachtungsvorhersage.




---

## Galerie


|  BAO-Modellierungsmodus | Thermische Gasansicht |
| :---: | :---: |
| <a href="../Examples/BAO_example.png"><img src="../Examples/BAO_example.png" width="350"></a> | <a href="../Examples/Thermal_example.png"><img src="../Examples/Thermal_example.png" width="350"></a> |
| *Evolution von BAO Anfangsbedingungen (ICs).* | *Imitiert lokale Temperatur.* |


| Realistische LSS | Void Identifizierung |
| :---: | :---: |
| <a href="../Examples/LSS_example.png"><img src="../Examples/LSS_example.png" width="350"></a> | <a href="../Examples/Voids_example.png"><img src="../Examples/Voids_example.png" width="350"></a> |
| *Evolution von Eisenstein & Hu P(k) ICs.* | *Echtzeit Void Identifizierung.* |

| Teilchenbewegung Movement | Split-Screen Vergleich |
| :---: | :---: |
| <a href="../Examples/Trails_example.png"><img src="../Examples/Trails_example.png" width="350"></a> | <a href="../Examples/Comparison_example.png"><img src="../Examples/Comparison_example.png" width="350"></a> |
| *Die bisherigen Bewegungen der Teilchen darstellen.* | *Kosmologie-Vergleich auf zwei Panels.* |


---

## Mitwirken & Feedback

Beiträge, Vorschläge für neue Funktionen und Fehlermeldungen sind herzlich willkommen!

* **Issues:** Wenn du eine Idee hast, eine physikalische Annäherung diskutieren möchtest oder einen Fehler gefunden hast, eröffne bitte ein Issue auf GitHub.
* **Pull Requests:** Wenn du Code beisteuern möchtest, kannst du das Repository gerne forken und einen Pull Request einreichen.

---

## Aufgebaut mit
* **Benutzeroberfläche & Interaktivität:** React 18, TailwindCSS und Babel (Standalone). Entwickelt mit einer **Zero-Build-Architektur**: läuft vollständig im Browser ohne Node.js oder Webpack.
* **Grafik & Rendering:** Benutzerdefiniertes WebGL (Shader) & HTML5-Canvas-API.
* **Physikberechnung:** WebGPU (Compute Shaders) mit einem synchronen CPU-Spatial-Hash-Fallback.
* **Computational Geometry:** d3-delaunay (wird außerhalb des Hauptthreads in Hintergrund-Web-Workern ausgeführt).
* **Videokodierung:** WebCodecs API (Hardware H.264) & ffmpeg.wasm.

---

## Funktionen

### Interaktive Simulation & Kosmologie
* **Echtzeit-Entwicklung:** Beobachte direkt im Browser, wie sich kosmische Strukturen von der Rotverschiebung $z=10$ (frühes Universum) bis $z=0$ (heute) bilden.
* **Konfigurierbare Anfangsbedingungen:** Wähle zwischen realistischen Anfangsbedingungen (ICs) und BAO-idealisierten ICs (Details weiter unten im Abschnitt "Wissenschaft"). Du kannst außerdem die Anzahl der Materieteilchen (zwischen 20.000 und 200.000) festlegen und das Sichtfeld (500–3000 Mpc) anpassen.
* **Kosmologische Steuerelemente:** Passe kosmologische Parameter an, um deren Auswirkungen auf das Strukturwachstum sofort zu beobachten. Unterstützt standardmäßiges flaches/nicht-flaches $\Lambda\text{CDM}$, $w\text{CDM}$ und dynamische dunkle Energie ($w_0w_a\text{CDM}$ über die CPL-Parametrisierung).
* **Zeitsteuerung:** Bewege die Zeit mit dem Zeitleisten-Schieberegler vorwärts und rückwärts durch die kosmische Geschichte (berechnet sofort 2LPT-Verschiebungen, keine lokale Gravitation) oder klicke auf "Start" für eine genauere Entwicklung.
* **Split-Screen-Vergleich:** Führe zwei unabhängige Simulationen nebeneinander aus. Lege unterschiedliche kosmologische Parameter für Panel A und Panel B fest, während beide denselben Zufallsstartwert verwenden. Panel B synchronisiert sich mit der Rotverschiebung ($z$) von Panel A, um direkte visuelle Vergleiche der Strukturbildung im exakt gleichen Stadium der kosmischen Expansion zu ermöglichen.
* **Rotverschiebungsraum:** Wechsele zwischen dem realen Raum und dem Rotverschiebungsraum, um Tracer entlang einer wählbaren Sichtlinie aufgrund einer Dopplerverschiebung durch ihre eigene Bewegung unter Verwendung modellierter Eigenbewegungen zu verschieben. Die Stärke der Verzerrungen im Rotverschiebungsraum (RSD) ist einstellbar, um einen direkten visuellen Vergleich der anisotropen Clusterbildung zu ermöglichen.



### Visualisierungsmodi
* **Tracer & Spuren:** Zeigt die Standardverteilung der Massenteilchen (Tracer) an. Wechsel zwischen den Modi **Frühere Pfade** (frühere Trajektorien) und **Geschwindigkeitsvektoren** (überhöhte aktuelle Geschwindigkeit), um Massenbewegungen zu visualisieren.
* **Thermische (Gas-)Ansicht:** Nähert die Gaserwärmung in kollabierten Strukturen mithilfe additiver radialer Gradienten an. Die Farben entsprechen der lokalen Dichte ($\text{Blau} \to \text{Cyan} \to \text{Weiß} \to \text{Gold}$) und zeigen die Gaserwärmung beim Einfallen in Cluster.
* **Überlagerung der Anfangsbedingungen:** Hebt die ursprünglichen Lagrange-Gitterpositionen bei $z=10$ hervor, um Massenströme von ihrem Ursprung aus zu verfolgen.
* **Benutzerdefinierte Bildüberlagerung:** Lade ein externes Bild hoch (z. B. Daten aus Galaxienvermessungen oder Bilder aus Referenzsimulationen), um es direkt mit dem sich entwickelnden kosmischen Netz zu vergleichen. Enthält Schieberegler zur Feineinstellung von Deckkraft, Skalierung und X/Y-Positionierung für die Ausrichtung.

### Analysewerkzeuge
* **Voronoi-Tessellation:** Zeigt die Voronoi-Zellen der Tracer an und hebt Bereiche mit geringer Dichte hervor.
* **Echtzeit-Hohlraumidentifizierung:** Findet kosmische Voids mithilfe eines im Hintergrund laufenden Web Workers, der einen Voronoi-Watershed-Algorithmus ausführt (ähnlich wie [VIDE](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract)). Filtere Voidzellen nach "Farbgrenzwert", führe sie unter Verwendung eines "Mindestradius" zusammen und zeige geometrische oder Zentren mit minimaler Dichte an.
* **Hohlraumdichteprofile:** Berechne und zeichne die radialen Dichteprofile ($\rho(r)/\bar{\rho}$) identifizierter Voids unter Verwendung von Median- oder volumengewichteter Stapelung.
* **Leistungsspektrum $P(k)$:** Extrahiert im realistischen IC-Modus das 2D-Leistungsspektrum aus dem entwickelten Dichtefeld. Bietet exakte Auswertung von Gittergrößen, die keine 2er-Potenzen sind (Bluesteins FFT), sowie Interlacing ([Sefusatti et al. 2016](https://ui.adsabs.harvard.edu/abs/2016MNRAS.460.3624S/abstract)).
* **2-Punkt-Korrelation:** Im BAO-Modus wird die Kreuzkorrelation $\xi(r)$ von Tracern um bekannte BAO-Seeds berechnet.
* **Dichteverteilung:** Ein in Echtzeit normalisiertes Histogramm des Tracer-Dichtekontrasts ($\delta = \rho/\bar{\rho} - 1$), das den Übergang von linearen Gaußschen Fluktuationen zu einer schiefen nichtlinearen Verteilung verfolgt.
* **Lineal:** Messe mitbewegende Entfernungen (Mpc, unter der Annahme $h = 0,674$) direkt im Web. *(Interaktion: Klicke zum Starten, klicke zum Beenden, Doppelklick in der Nähe des Startpunkts zum Löschen).*

### Interaktivität & hochwertiger Export
* **Modelliermodus:** Bei $z=0$ kannst Du direkt mit der Physik-Engine interagieren. *(Interaktion: Klicke und ziehe die Maus, um manuelle Gravitationsfelder zu erzeugen und Filamente physikalisch zu ziehen).*
* **Hochwertige Videoaufzeichnung:** Eine deterministische Rendering-Pipeline exportiert frame-genaue Videos unabhängig von Browser-Verzögerungen. Zeichne genau das auf, was du siehst, oder erzwinge 720p/1080p. Nutzt Hardware-WebCodecs (H.264), ffmpeg.wasm oder reine JS-WebM-Assembly.
* **Snapshot-Export:** Lade hochauflösende PNGs der aktuellen Visualisierung herunter, komplett mit physikalischen HUD-Overlays, die das kosmische Alter und die Rotverschiebung detailliert darstellen.
* **Datenexport (CSV):** Exportiere die exakten komovierenden Koordinaten (Mpc/h) aller Tracer in eine CSV-Datei (unterstützt vollständig den gleichzeitigen doppelten Export im Split-Screen-Modus).

### Text-Imprint – Schreiben im kosmischen Netz

Aktiviere unter dem Steuerelement **Startwert** in der Seitenleiste die Option **"Füge deinen eigenen Text hinzu"**, gebe einen Text (maximal 16 Zeichen) ein und klicke auf **Anwenden**. Der Text ist bei $z = 10$ unsichtbar und taucht im Laufe der Entwicklung des Universums in Richtung $z \approx 0$ allmählich als dichte Filamente auf.

Der Abdruck funktioniert durch die Nutzung der Korrekturen der Lagrange-Störungstheorie zweiter Ordnung (2LPT). Die primären (1LPT) Anfangsbedingungen bleiben vollständig rein und physikalisch. Da die 2LPT-Korrektur quadratisch mit dem Wachstumsfaktor ($D_1(z)^2$) skaliert, ist der Textversatz bei $z = 10$ praktisch null und zwingt die Teilchen mathematisch dazu, genau dann auf die Buchstabenstiche zu konvergieren, wenn $D_1(z) \rightarrow 1$ ist. Das umgebende kosmische Netz bleibt davon unberührt. Die Funktion ist **standardmäßig deaktiviert und muss aktiviert werden**. Wenn sie nicht aktiviert ist, entspricht die Simulation dem Standardlauf.

---

## Erste Schritte

Da dieses Projekt eine **Zero-Build-Architektur** nutzt und vollständig auf native Browsertechnologien (HTML5, WebGL, WebGPU, Web Workers) sowie über CDN bereitgestellte Bibliotheken setzt, sind weder ein `npm install` noch eine komplexe Build-Pipeline erforderlich.

### Voraussetzungen
* Ein moderner Webbrowser (Chrome, Edge, Firefox, Safari).
* **Empfohlen:** Ein Browser mit aktiviertem WebGPU für parallele Physikberechnungen. Falls WebGPU nicht verfügbar ist, weicht die Simulation nahtlos auf eine synchrone CPU-Spatial-Hash-Implementierung aus.

### Lokale Ausführung
Um Cross-Origin-Sicherheitsbeschränkungen (CORS) des Browsers beim Laden von Web Workers und lokalen Modulen zu umgehen, müssen die Dateien über einen lokalen HTTP-Server bereitgestellt werden:

1.  Öffne dein Terminal und navigiere zum Projektordner.
2.  Starte einen lokalen Server (z. B. mit Python): `python3 -m http.server 8080` (oder deinen bevorzugten lokalen Server).
3.  Öffne `http://localhost:8080` in deinem Browser.

---



## Projektstruktur

```text
cosmic_web_explorer/
├── index.html              # Main HTML containing the React UI
├── styles.css              # Application styling
├── .github/
│   └── workflows/
│       └── smoke.yml         # CI startup smoke test
├── docs/                   # Translations
├── Examples/               # Demo videos and gallery images
├── tests/
│   └── smoke.spec.js         # Playwright startup/mount smoke coverage
├── src/
│   ├── constants.js          # Cosmological parameters (Planck 2018)
│   ├── cosmology.js          # Expansion history & growth factor LUTs
│   ├── transfer-function.js  # Eisenstein & Hu P(k) transfer functions
│   ├── pert2lpt.js           # 2LPT displacement via 2D FFT
│   ├── sim-physics.js        # Core Leapfrog KDK integration & Adhesion model
│   ├── redshift-space.js     # Redshift-space LOS shifting & hybrid velocity logic
│   ├── analysis-keys.js      # Shared cache key/signature helpers for analysis spaces
│   ├── panel-render-loop.js  # Extracted per-panel physics and RSD update pipeline
│   ├── startup-guard.js      # Startup preflight checks and global fatal-error fallback
│   ├── bao-forces.js         # Sculpted BAO initialization logic
│   ├── gpu-gravity.js        # WebGPU N-body compute shader
│   ├── gpu-correlation.js    # WebGPU pair-counting compute shader
│   ├── sim-renderer.js       # Canvas2D drawing logic for overlays & charts
│   ├── webgl-utils.js        # WebGL rendering for tracers & gas
│   ├── color-luts.js         # Color maps for density/temperature
│   ├── recorder.js           # Multi-pipeline video encoder
│   ├── ui-components.js      # Reusable React UI elements (Tooltips)
│   └── icons.js              # SVG Icons
└── workers/
    └── void-worker.js        # Background void finding (Delaunay/Watershed)
```

---

## Die Wissenschaft

### 1. Kosmologischer Hintergrund

Der Kern der Visualisierung stützt sich auf die Expansion eines Friedmann-Lemaître-Robertson-Walker-Universums (FLRW), um den Zeitablauf und die Geschwindigkeit der Strukturbildung zu bestimmen.

**Expansionsgeschichte:**
Die dimensionslose Hubble-Expansionsrate $E(z) \equiv H(z)/H_0$ bestimmt die kosmische Reibung und wird wie folgt berechnet:

$$
E(z) = \sqrt{\Omega_m (1+z)^3 + \Omega_k (1+z)^2 + \Omega_{DE}(z)}
$$

wo $\Omega_k = 1 - \Omega_m - \Omega_\Lambda$.  Zur Unterstützung dynamischer Modelle der Dunklen Energie ($w_0w_a \text{CDM}$) implementieren wir die CPL-Parametrisierung:

$$
\Omega_{DE}(z) = \Omega_\Lambda (1+z)^{3(1+w_0+w_a)} \exp\left(-\frac{3 w_a z}{1+z}\right)
$$

**Zeit- und Wachstumsintegration:**
Die Abbildung der Rotverschiebung ($z$) erfordert die Berechnung der kosmischen Zeit $t(z)$ und des linearen Wachstumsfaktors $D_1(z)$, der die Teilchenverschiebungen skaliert. Um interaktive Bildraten aufrechtzuerhalten, ohne diese Integrale im laufenden Betrieb zu lösen, berechnet die Engine vorab eine Look-Up-Tabelle (LUT) mit 10.000 Schritten für eine $O(1)$-Abtastung:

$$
t(z) = \frac{1}{H_0} \int_z^\infty \frac{dz'}{(1+z') E(z')}
$$
$$
D_1(z) \propto E(z) \int_z^\infty \frac{1+z'}{E(z')^3} dz'
$$

### 2. Anfangsbedingungen: Zwei Modi

Die Visualisierung bietet zwei unterschiedliche Modi zur Erzeugung des Dichtefeldes bei $z=10$, die sowohl der visuellen Veranschaulichung als auch der statistischen Genauigkeit gerecht werden.

#### 2.1 Modus mit strenger $P(k)$-Darstellung
Für eine mathematisch genaue Darstellung der primordialen Fluktuationen verwenden wir die Übertragungsfunktion von [Eisenstein & Hu (1998)](https://ui.adsabs.harvard.edu/abs/1998ApJ...496..605E/abstract).

* **3D-zu-2D-Projektion:** Da die Visualisierung auf einer 2D-Leinwand erfolgt, wird das theoretische 3D-Powerspektrum $P_{3D}(k)$ unter Verwendung eines Abel-Integrals in eine 2D-Scheibe projiziert, um korrekte statistische Clustering-Eigenschaften zu gewährleisten:

$$
P_{2D}(k_{\perp}) = \frac{1}{2\pi} \int_{-\infty}^{\infty} P_{3D}\left(\sqrt{k_{\perp}^2 + k_z^2}\right) dk_z
$$

* **Gaußsches Zufallsfeld:** Die projizierte Verteilung $P_{2D}(k)$ wird auf ein Gitter im Fourier-Raum abgebildet, mit einer Box-Muller-Gauß-Zufallsverteilung initialisiert und einer inversen FFT unterzogen, um das anfängliche 1LPT-Zel'dovich-Verschiebungsfeld $\mathbf{\Psi}^{(1)}$ zu erzeugen.

#### 2.2 Phänomenologischer und idealisierter BAO-Modus
Da das tatsächliche BAO-Signal statistisch schwach ist (~1 %) und in kleinen Volumina bei niedriger Auflösung mit bloßem Auge nur schwer zu erkennen ist, stellen wir einen idealisierten Modus zur Verfügung, der die akustische Skala explizit hervorhebt.

Wir konstruieren ein Verschiebungsfeld $\mathbf{\Psi}(\mathbf{q})$, indem wir radiale Gaußsche Potentialhüllen um eine Menge zufälliger Zentren $\{ \mathbf{x}_c \}$ überlagern. Dies erzeugt deutliche Überdichten an den Zentren und sphärische Hüllen auf der BAO-Skala. Die Hintergrund-Anfangsbedingungen werden weiterhin aus dem projizierten Leistungsspektrum generiert.

#### 2.3 Lagrange-Störungstheorie zweiter Ordnung (2LPT)
Um nicht-gaußförmige Merkmale, insbesondere die Schärfung von Filamenten und die Abrundung von Voids, vor dem N-Körper-Relaxationsschritt zu erfassen, implementieren wir 2LPT. Die Euler-Position $\mathbf{x}$ eines Teilchens zum Zeitpunkt $t$ ist gegeben durch:
$$\mathbf{x}(t) = \mathbf{q} + D_1(t)\mathbf{\Psi}^{(1)}(\mathbf{q}) + D_2(t)\mathbf{\Psi}^{(2)}(\mathbf{q})$$

Wir gehen von der für $\Lambda\text{CDM}$-ähnliche Kosmologien geltenden Standardnäherung aus:
$$D_2(t) \approx -\frac{3}{7} D_1(t)^2$$

**Berechnung mittels FFT:** Der Code berechnet das Verschiebungspotential zweiter Ordnung $\phi_2$ durch Lösung der Poisson-Gleichung auf einem Gitter unter Verwendung der schnellen Fourier-Transformation:

$$
\nabla^2 \phi_2 = \phi_{1,xx} \phi_{1,yy} - (\phi_{1,xy})^2
$$

Der Quellterm ist der Determinante der Hesse-Matrix des Potenzials erster Ordnung. Die 2LPT-Verschiebung ist dann der Gradient dieses Potenzials: $\mathbf{\Psi}^{(2)} = - \nabla \phi^{(2)}$.

### 3. Dynamik: Quasi-N-Körper-Modell und Adhäsion

Um interaktive Bildraten und stabile Strukturen in 2D zu erzielen, verwenden wir einen hybriden Ansatz, der die Standard-N-Körper-Dynamik modifiziert.

**Das "Adhäsions"-Modell (Cluster-Physik)**
In Bereichen hoher Dichte kreuzen sich rein LPT-gesteuerte Trajektorien (Shell-Crossing). Anstatt ein rechenintensives Viskositätsmodell nach der Burgers-Gleichung zu implementieren, verwenden wir ein phänomenologisches Adhäsionsmodell. Wir verfolgen für jedes Teilchen einen "Shell-Crossing-Akkumulator" $N_{cross}$, der sich erhöht, wenn benachbarte Teilchen antiparallele Verschiebungsrichtungen aufweisen:

$$
\mathbf{\Psi}_{1,i} \cdot \mathbf{\Psi}_{1,j} < 0 ,
$$

was auf konvergierende Strömungen hindeutet. Der effektive lineare Wachstumsfaktor für dieses Teilchen ist lokal gedämpft:

$$
D_{\mathrm{eff}}^{(i)}(t) = \frac{D_1(t)}{1 + \alpha \cdot N_{cross}^{(i)}}
$$

Dadurch wird die Ausbreitung des Verschiebungsfeldes in Bereichen hoher Dichte praktisch "eingefroren", was die Bildung stabiler, virialisierter Strukturen nachahmt. Um eine unerwünschte Dämpfung in Bereichen mit geringer Dichte zu verhindern, werden Kreuzungsereignisse nur dort akkumuliert, wo die lokale Dichte $2 \cdot \bar{\rho}$ übersteigt.

**Lokale Gravitation und Integration**
Wir fügen Kurzreichweitenkräfte mithilfe einer gitterbasierten Teilchen-Teilchen-Methode mit einem abgeschwächten $1/r$-Kraftgesetz (2D-Newtonsche Gravitation) hinzu:

$$
\mathbf{F}_{ij} = G_{\mathrm{eff}} \cdot \frac{\mathbf{d}_{ij}}{|\mathbf{d}_{ij}|^2 + \varepsilon^2}
$$

Die Kopplungskonstante $G_{\mathrm{eff}}$ skaliert heuristisch mit der dimensionslosen linearen Wachstumsrate $f(a) \approx \Omega_m(a)^{0,55}$ ([Linder 2005](https://ui.adsabs.harvard.edu/abs/2005PhRvD.. 72d3529L/abstract)), um sicherzustellen, dass die Clusterbildung optisch ausbleibt, sobald die Dunkle Energie dominiert:
$$G_{\mathrm{eff}} = G_{\mathrm{base}} \cdot \Omega_m(a)^{0.55} \cdot \frac{\Delta t}{\Delta t_{\mathrm{ref}}} \cdot \frac{N_{\mathrm{ref}}}{N}$$

Die Integration erfolgt über ein Leapfrog-KDK-Verfahren (Kick-Drift-Kick). Der während des Drift-Schritts angewandte mitbewegte Reibungsterm lautet:

$$
\mathbf{v} \leftarrow \mathbf{v} \cdot \exp \left(-2 \, E(z) \cdot C_{\mathrm{drag}} \cdot \frac{H_0 t_0}{(H_0 t_0)_{\mathrm{ref}}} \cdot \frac{\Delta t}{\Delta t_{\mathrm{ref}}}\right)
$$

wobei $C_{\mathrm{drag}} = 0,25$ empirisch über dem rein physikalischen Wert kalibriert wurde, um die Dämpfung der nicht aufgelösten Geschwindigkeitsdispersion unterhalb der Gittergröße zu berücksichtigen.

Um beobachtete Verzerrungen im Rotverschiebungsraum (RSD) nachzubilden, wenden wir eine Verschiebung entlang der Sichtlinie (LOS) unter Verwendung eines phänomenologischen hybriden Geschwindigkeitsfeldes an. Die lokale Dichte bestimmt, inwieweit jeder Tracer perturbative (großräumige) bzw. lokale (nichtlineare) Geschwindigkeitsinformationen nutzt:

$$
\mathbf{v}_{\mathrm{hyb}}=(1-w_\rho)\,\mathbf{v}_{\mathrm{PT}}+w_\rho\,\mathbf{v}_{\mathrm{local}}.
$$

$$
w_\rho = w_{\min} + (w_{\max}-w_{\min})\,s\!\left(\rho/\bar{\rho}\right),
\qquad
w_{\min}=0.15,\; w_{\max}=0.85,
$$

wobei $s$ als glatte, dichteabhängige Übergangsfunktion von einer PT-Gewichtung bei niedriger Dichte ($\rho/\bar{\rho}\le 0,5$) zu einer lokalen Geschwindigkeitsgewichtung bei hoher Dichte ($\rho/\bar{\rho}\ge 5,0$) gewählt wird.

Die Abbildung in den Rotverschiebungsraum lautet dann:

$$
\mathbf{x}_{\mathrm{RSD}}=\mathbf{x}_{\mathrm{real}}+
A_{\mathrm{RSD}}\,
\frac{h\,(\mathrm{pxPerMpc})\,v_{\parallel,\mathrm{hyb}}}{a\,E(z)}\,\hat{\mathbf{n}},
$$

wobei $A_{\mathrm{RSD}}$ die vom Benutzer gesteuerte Amplitude, $\hat{\mathbf{n}}$ der LOS-Einheitsvektor und $E(z)=H(z)/H_0$ ist.

Wird der manuelle Zeitschieberegler im Pausenmodus bewegt, werden die lokalen Geschwindigkeiten an festen Positionen kurzzeitig neu geschätzt, um die Kontinuität der RSD-Ansicht zu gewährleisten.


### 4. Implementation: CPU vs. WebGPU

Die Physik-Engine umfasst zwei Schwerkraft-Backends, um eine hohe Leistung auf allen Geräten zu gewährleisten:

| Feature | CPU Mode | GPU Mode (WebGPU) |
| :--- | :--- | :--- |
| **Technik** | Spatial Hash Grid | Compute Shaders |
| **Suchmuster** | $3 \times 3$ Grid-Zellen | Kreisradius ($r \le 4$) |
| **Durchsuchte Zellen** | 9 | ~49 ($x^2 + y^2 \le 16$) |
| **Pipeline** | Synchron | Asynchron (Double-buffered) |

**Asynchrone GPU-Pipeline:** Bei der Live-Wiedergabe nutzt der WebGPU-Compute-Shader asynchrones Auslesen mit doppelt gepuffertem Staging, um Pipeline-Blockaden zu vermeiden. Frame $N$ leitet den Rechenvorgang ein und liest gleichzeitig das Ergebnis von Frame $N-1$ aus, was zu einer vernachlässigbaren Latenz von einem Frame führt. Während der Videoaufzeichnung wechselt die Pipeline automatisch in den synchronen Modus, um frame-genaue, deterministische Ergebnisse zu gewährleisten.


### 5. Void-Identifizierung und Strukturanalyse

Die Echtzeit-Voiderkennung wird an einen im Hintergrund laufenden Web Worker ausgelagert. Die Engine implementiert eine Methodik, die stark von standardmäßigen kosmologischen Werkzeugen wie [ZOBOV](https://ui.adsabs.harvard.edu/abs/2008MNRAS.386.2101N/abstract) und [VIDE](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract) inspiriert ist.

* **Dichteabschätzung (VTFE):** Die Simulation berechnet die Delaunay-Triangulation und die entsprechenden Voronoi-Zellen für alle Tracer. Die lokale Dichte wird über die inverse Zellfläche geschätzt: $\rho_i = \overline{A}/A_i$, wobei $\rho = 1$ die mittlere Dichte und $\overline{A}$ die mittlere Zellgröße ist.
* **Watershed-Algorithmus:** Das Feld wird durch die Ermittlung lokaler Dichteminima segmentiert. Benachbarte Zellen fließen "bergab" in diese Minima und gruppieren das Universum in unterschiedliche Voids.
* **Automatische Zusammenführung:** Der Algorithmus analysiert die gemeinsamen Grenzen zwischen benachbarten Voids. Wenn mehr als 20 % einer gemeinsamen Grenze (und mindestens 4 Zellpaare in absoluter Anzahl) aus Wänden mit einer Dichte unterhalb des kosmischen Mittelwerts bestehen, werden die Hohlräume zusammengeführt. Dies verhindert eine durch Poisson-Rauschen verursachte künstliche Fragmentierung.
* **Zusätzliche Zusammenführung:** Kleine Voids ($R < R_{min}$) können iterativ in ihren größten benachbarten Voids absorbiert werden. Alle topologischen Berechnungen berücksichtigen periodische Grenzen unter Verwendung eines umlaufenden "Geisterteilchen"-Puffers.


### 6. Thermische Streuung zur Darstellungszeit

Um die Geschwindigkeitsdispersion (Virialisierung) von Dunkle-Materie-Halos unterhalb des Gitters darzustellen, ohne den Rechenaufwand echter hochauflösender N-Körper-Bahnen zu verursachen, wendet die Engine zum Zeitpunkt des Renderings einen physikalisch modulierten kosmetischen Versatz an. Die Streuamplitude wird von fünf Faktoren bestimmt:

* **Dichteabhängige Amplitude:** Die Amplitude nähert sich in Voids einem Basiswert an und wird in dichten Strukturen unterdrückt:
$$
\sigma \propto \frac{1}{1 + \alpha (\rho / \bar{\rho})}
$$

* **Anisotrope Dehnung:** Die Streuung wird entlang des lokalen 1LPT-Kraftvektors gestreckt, um Partikel nachzubilden, die entlang von Filamenten strömen.
* **Skalierung der Wachstumsrate:** Skaliert mit $f(a)^{0,5}$, wobei $f(a) \approx \Omega_m(a)^{0,55}$ gilt, um die Thermalisierung der kinetischen Energie in späten kosmischen Zeiten darzustellen.
* **Gewichtung durch Shell-Crossing:** Die Streuung wird in Shell-Crossing Regionen verstärkt, um Bereiche visuell darzustellen, in denen eine heftige Relaxation stattgefunden hat.
* **Kohärente persistente Phasen:** Die zufälligen Versätze werden über eine vorberechnete Sinus-/Kosinus-Tabelle auf der Grundlage eines persistenten Phasenwinkels abgeleitet, wodurch eine sanfte Bahnverschiebung anstelle von störendem Bild-zu-Bild-Rauschen gewährleistet wird.


---


## Quellen & Literaturverzeichnis

* **Eisenstein, D. J., & Hu, W. (1998).** *Baryonic Features in the Matter Transfer Function.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/1998ApJ...496..605E/abstract)
  > Used to generate the rigorous 3D $P(k)$ initial conditions.
* **Chevallier, M., & Polarski, D. (2001).** *Accelerating universes with scaling dark matter.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2001IJMPD..10..213C)
  > Basis for the dynamic Dark Energy ($w_0w_a$CDM) parameterization.
* **Linder, E. V. (2005).** *Cosmic growth history and expansion history.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2005PhRvD..72d3529L/abstract)
  > Used for scaling the effective gravitational coupling constant $G_{\mathrm{eff}}$.
* **Neyrinck, M. C. (2008).** *ZOBOV: a parameter-free void-finding algorithm.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2008MNRAS.386.2101N/abstract)
  > Theoretical basis for the Voronoi Tessellation Field Estimator (VTFE) and Watershed segmentation.
* **Sefusatti, E., et al. (2016).** *Accurate Estimators of Correlation Functions in Fourier Space.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2016MNRAS.460.3624S/abstract)
  > Guided the void identification.
* **Sutter, P. M., et al. (2015).** *VIDE: The Void IDentification and Examination toolkit.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract)
  > Guided the void identification.


---


## Danksagungen

* **Ursprüngliches Konzept:** Simon Bouchard und Nico Schuster
* **Entwicklung:** Nico Schuster
* **Code-Generierung:** Google Gemini Pro 3.0/3.1 und Claude Opus 4.5/4.6
* **Kernbibliotheken:** Die Visualisierung zur Erkennung von Voids stützt sich stark auf die hervorragende Bibliothek [d3-delaunay](https://github.com/d3/d3-delaunay) für computergestützte Geometrie.

Die Autoren dieses Codes danken Julien Zoubian und Dennis Frei für ihre wertvollen Beiträge zur Entwicklung des Codes sowie Julian Bautista, Marie-Claude Cousinou, Steffen Hagstotz, Nico Hamaus, Geray Karademir, Arnaud de Mattia, Alice Pisani, Benjamin Racine, und Pauline Zarrouk für nützliche Diskussionen und Rückmeldungen. NS wird durch den Investitionsplan „France 2030“ der französischen Regierung (A*MIDEX AMX-22-CEI-03) unterstützt.


## Quellenangabe

Wenn Du den Cosmic Web Explorer in Unterrichtsmaterialien, Präsentationen oder Forschungsarbeiten verwendest, gebe ihn bitte unter Angabe der Zenodo-DOI an:

[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.18915566-blue.svg)](https://doi.org/10.5281/zenodo.18915566)

```bibtex
@software{Schuster_CosmicWebExplorer_2026,
  author       = {Schuster, Nico and Bouchard, Simon and Zoubian, Julien and Frei, Dennis},
  title        = {Cosmic Web Explorer: Real-Time Large-Scale Structure in the Browser},
  month        = mar,
  year         = 2026,
  publisher    = {Zenodo},
  version      = {v1.0.0},
  doi          = {10.5281/zenodo.18915566},
  url          = {https://doi.org/10.5281/zenodo.18915566}
}
```

## Datenschutz und Webanalyse
Die GitHub-Pages-Website dieses Projekts nutzt [GoatCounter](https://www.goatcounter.com/), ein datenschutzfreundliches Open-Source-Tool zur Webanalyse. Es ermöglicht es, zu sehen, wie viele Besucher die Website

## Lizenz & Open Science

Dieses Projekt unterliegt der **GNU Affero General Public License v3.0 (AGPLv3)**.

Wir haben diese Lizenz nicht gewählt, um Einschränkungen zu schaffen, sondern um sicherzustellen, dass der **Cosmic Web Explorer** eine dauerhafte, freie Ressource für die Astronomie-Community bleibt. Durch die Verwendung der AGPLv3 garantieren wir:
* **Open Access:** Der Code bleibt stets Open Source.
* **Gemeinsame Verbesserungen:** Wenn Du die Physik oder die Benutzeroberfläche verbesserst, bleiben diese Verbesserungen in der Community, sodass alle davon profitieren können.
* **Namensnennung:** Deine harte Arbeit (und unsere) ist geschützt. Die ursprünglichen Urheberangaben müssen immer erhalten bleiben.

**Kurz gesagt:** Du kannst das Projekt gerne forken, auseinandernehmen und etwas Besseres daraus machen – sorge nur dafür, dass es für den Nächsten weiterläuft!




