// Heizungseffizienz App - JavaScript
// Version: 1.7

class HeizungseffizienzApp {
  constructor() {
    this.measurements = [];
    this.editingId = null;
    this.currentYear = new Date().getFullYear();
    this.currentMonth = 0; // 0 = alle Monate
    this.currentChart = null;
    this.currentChartType = 'cop'; // ← NEU: Aktueller Chart-Typ tracken
    this.pendingImportData = null;

    this.init();
  }

  async init() {
    this.loadData();
    this.setupEventListeners();
    this.updateOverview();
    this.renderMeasurements();
    this.setCurrentDateTime();
    this.initChart(); // Hier wird automatisch das COP-Chart geladen und Menu aktiviert
    this.registerServiceWorker();
  }

  // Service Worker Registration
  async registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        console.log("✅ Service Worker registered:", registration);

        // Sofortige Update-Erkennung
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          console.log("🔄 Neuer Service Worker gefunden");

          newWorker.addEventListener("statechange", () => {
            console.log("📱 SW State:", newWorker.state);

            if (newWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // Update verfügbar
                console.log("🆕 Update verfügbar!");
                this.showUpdateBanner();
              } else {
                // Erste Installation
                console.log("🎉 App erfolgreich installiert");
                this.showMessage("App erfolgreich installiert!", "success");
              }
            }
          });
        });

        // Prüfe auf bereits wartenden Service Worker
        if (registration.waiting) {
          console.log("⏳ Service Worker wartet bereits");
          this.showUpdateBanner();
        }

        // Nachrichten vom Service Worker empfangen
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data && event.data.type === 'SW_UPDATED') {
            console.log("📢 SW Update-Nachricht erhalten:", event.data.version);
            this.showUpdateBanner();
          }
        });

        // Periodische Update-Prüfung alle 30 Sekunden
        setInterval(() => {
          registration.update().catch(err => {
            console.log("Update-Check fehlgeschlagen:", err);
          });
        }, 30000);

      } catch (error) {
        console.error("❌ Service Worker registration failed:", error);
      }
    }
  }

  // Daten laden
  loadData() {
    const saved = localStorage.getItem("heizungseffizienz-data");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.measurements = data.measurements || [];
        this.currentYear = data.currentYear || new Date().getFullYear();
        this.currentMonth = data.currentMonth || 0;
        this.currentChartType = data.currentChartType || 'cop';

        // UI State wiederherstellen
        document.getElementById("jahresauswahl").value = this.currentYear;
        document.getElementById("monatsauswahl").value = this.currentMonth;

        // Menu wird beim ersten Chart-Render automatisch gesetzt
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        this.measurements = [];
      }
    }
  }

  // Neue Funktion hinzufügen:
  restoreUIState() {
    // Aktives Chart-Menü wiederherstellen
    const menuId = `menu-chart-${this.currentChartType === 'temperature' ? 'temp' : this.currentChartType}`;
    this.setActiveMenuChartButton(menuId);
  }

  // Daten speichern
  saveData() {
    const data = {
      measurements: this.measurements,
      currentYear: this.currentYear,
      currentMonth: this.currentMonth,
      currentChartType: this.currentChartType, // ← NEU: Chart-Typ speichern
      lastSaved: new Date().toISOString(),
    };

    try {
      localStorage.setItem("heizungseffizienz-data", JSON.stringify(data));
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      this.showMessage("Fehler beim Speichern der Daten!", "error");
    }
  }

  // Event Listeners
  setupEventListeners() {
    // Jahr/Monat Auswahl
    document.getElementById("jahresauswahl").addEventListener("change", (e) => {
      this.currentYear = parseInt(e.target.value);
      this.saveData();
      this.updateOverview();
      this.renderMeasurements();
      this.renderChart(this.currentChartType);
    });

    document.getElementById("monatsauswahl").addEventListener("change", (e) => {
      this.currentMonth = parseInt(e.target.value);
      this.saveData();
      this.updateOverview();
      this.renderMeasurements();
      this.renderChart(this.currentChartType);
    });

    // Messwert hinzufügen
    document
      .getElementById("measurement-form")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveMeasurement();
      });

    document
      .getElementById("measurement-cancel")
      .addEventListener("click", () => {
        this.cancelEdit();
      });

    // Edit Modal
    document.getElementById("edit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.updateMeasurement();
    });

    document.getElementById("edit-cancel").addEventListener("click", () => {
      this.closeEditModal();
    });

    document.getElementById("modal-close").addEventListener("click", () => {
      this.closeEditModal();
    });

    // Dropdown Menu Toggle
    document.getElementById("menu-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleDropdownMenu();
    });

    // Menu Chart Buttons
    document.getElementById("menu-chart-cop").addEventListener("click", () => {
      this.currentChartType = 'cop';
      this.setActiveMenuChartButton("menu-chart-cop");
      this.renderChart("cop");
      this.closeDropdownMenu();
    });

    document.getElementById("menu-chart-temp").addEventListener("click", () => {
      this.currentChartType = 'temperature';
      this.setActiveMenuChartButton("menu-chart-temp");
      this.renderChart("temperature");
      this.closeDropdownMenu();
    });

    document.getElementById("menu-chart-energy").addEventListener("click", () => {
      this.currentChartType = 'energy';
      this.setActiveMenuChartButton("menu-chart-energy");
      this.renderChart("energy");
      this.closeDropdownMenu();
    });

    document.getElementById("menu-chart-starts").addEventListener("click", () => {
      this.currentChartType = 'starts';
      this.setActiveMenuChartButton("menu-chart-starts");
      this.renderChart("starts");
      this.closeDropdownMenu();
    });

    document.getElementById("menu-chart-kwh").addEventListener("click", () => {
      this.currentChartType = 'kwh';
      this.setActiveMenuChartButton("menu-chart-kwh");
      this.renderChart("kwh");
      this.closeDropdownMenu();
    });

    // Menu Backup Button
    document.getElementById("menu-backup").addEventListener("click", () => {
      this.closeDropdownMenu();
      this.openBackupModal();
    });

    // Backup Modal
    document
      .getElementById("backup-modal-close")
      .addEventListener("click", () => {
        this.closeBackupModal();
      });

    // Backup/Import
    this.setupBackupHandlers();

    // Modal schließen bei Klick außerhalb + Dropdown Menu schließen
    document.addEventListener("click", (e) => {
      const editModal = document.getElementById("edit-modal");
      const backupModal = document.getElementById("backup-modal");
      const dropdownMenu = document.getElementById("dropdown-menu");
      const menuToggle = document.getElementById("menu-toggle");

      // Modal schließen
      if (e.target === editModal) {
        this.closeEditModal();
      }
      if (e.target === backupModal) {
        this.closeBackupModal();
      }

      // Dropdown Menu schließen wenn außerhalb geklickt
      if (!dropdownMenu.contains(e.target) && !menuToggle.contains(e.target)) {
        this.closeDropdownMenu();
      }
    });

    // ESC-Taste zum Schließen von Modals und Dropdown
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Schließe alle offenen Modals und Dropdowns
        this.closeEditModal();
        this.closeBackupModal();
        this.closeDropdownMenu();
      }
    });
  }

  // Dropdown Menu Funktionen
  toggleDropdownMenu() {
    const dropdown = document.getElementById("dropdown-menu");
    dropdown.classList.toggle("show");
  }

  closeDropdownMenu() {
    document.getElementById("dropdown-menu").classList.remove("show");
  }

  setActiveMenuChartButton(activeId) {
    // Sicherheitsüberprüfung ob Element existiert
    const activeElement = document.getElementById(activeId);
    if (!activeElement) {
      console.warn(`Menu button with id '${activeId}' not found`);
      return;
    }

    document.querySelectorAll(".menu-item").forEach((btn) => {
      btn.classList.remove("active");
    });
    activeElement.classList.add("active");
  }

  // Chart initialisieren
  initChart() {
    this.renderChart('cop');
  }

  // Chart ohne Daten - KORRIGIERT
  showNoDataChart() {
    // Zerstöre existierenden Chart
    if (this.currentChart) {
      this.currentChart.destroy();
      this.currentChart = null;
    }

    // Canvas beibehalten und Chart mit "Keine Daten" erstellen
    const canvas = document.getElementById("efficiency-chart");
    const ctx = canvas.getContext("2d");

    this.currentChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Keine Daten'],
        datasets: [{
          data: [1],
          backgroundColor: ['#e2e8f0'],
          borderColor: ['#cbd5e1'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Keine Daten für den ausgewählten Zeitraum',
            font: {
              size: 16,
              weight: 'bold'
            },
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color')
          },
          tooltip: {
            enabled: false
          }
        },
        events: [], // Keine Interaktionen
        animation: {
          duration: 0 // Keine Animation
        }
      }
    });
  }

  // Gefilterte Messungen abrufen
  getFilteredMeasurements() {
    return this.measurements.filter(measurement => {
      const date = new Date(measurement.datum);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      // Jahr filtern
      if (year !== this.currentYear) return false;

      // Monat filtern (0 = alle Monate)
      if (this.currentMonth !== 0 && month !== this.currentMonth) return false;

      return true;
    });
  }

  // Chart rendern - VERBESSERT
  renderChart(type) {
    // Chart-Typ speichern
    this.currentChartType = type;

    const filteredMeasurements = this.getFilteredMeasurements();

    // Zerstöre existierenden Chart IMMER zuerst
    if (this.currentChart) {
      this.currentChart.destroy();
      this.currentChart = null;
    }

    if (filteredMeasurements.length === 0) {
      this.showNoDataChart();
      return;
    }

    // Sortiere nach Datum
    filteredMeasurements.sort((a, b) => new Date(a.datum) - new Date(b.datum));

    // Canvas neu holen
    const canvas = document.getElementById("efficiency-chart");
    if (!canvas) {
      console.error("Chart canvas not found!");
      return;
    }

    const ctx = canvas.getContext("2d");

    switch (type) {
      case "cop":
        this.renderCOPChart(ctx, filteredMeasurements);
        break;
      case "temperature":
        this.renderTemperatureChart(ctx, filteredMeasurements);
        break;
      case "energy":
        this.renderEnergyChart(ctx, filteredMeasurements);
        break;
      case "starts":
        this.renderStartsChart(ctx, filteredMeasurements);
        break;
      case "kwh":
        this.renderKWhChart(ctx, filteredMeasurements);
        break;
      default:
        console.warn(`Unknown chart type: ${type}`);
        this.renderCOPChart(ctx, filteredMeasurements);
    }
  }

  renderCOPChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `$${date.getDate().toString().padStart(2, "0")}.$${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    });

    const copData = measurements.map((m) => m.cop);

    this.currentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "COP (Coefficient of Performance)",
            data: copData,
            borderColor: "rgb(220, 38, 38)",
            backgroundColor: "rgba(220, 38, 38, 0.1)",
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "rgb(220, 38, 38)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "COP Verlauf über Zeit",
            font: {
              size: 16,
              weight: "bold",
            },
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          legend: {
            display: true,
            labels: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "COP Wert",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          x: {
            title: {
              display: true,
              text: "Datum",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  renderTemperatureChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `$${date.getDate().toString().padStart(2, "0")}.$${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    });

    this.currentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Außentemperatur (°C)",
            data: measurements.map((m) => m.aussentemperatur),
            borderColor: "rgb(59, 130, 246)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
          },
          {
            label: "Raumtemperatur (°C)",
            data: measurements.map((m) => m.raumtemperatur),
            borderColor: "rgb(16, 185, 129)",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
          },
          {
            label: "Vorlauftemperatur (°C)",
            data: measurements.map((m) => m.vorlauftemperatur),
            borderColor: "rgb(245, 158, 11)",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Temperaturverlauf",
            font: {
              size: 16,
              weight: "bold",
            },
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          legend: {
            display: true,
            labels: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: "Temperatur (°C)",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          x: {
            title: {
              display: true,
              text: "Datum",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  renderEnergyChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `$${date.getDate().toString().padStart(2, "0")}.$${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    });

    this.currentChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Energieverbrauch (kWh)",
            data: measurements.map((m) => m.energieverbrauch),
            backgroundColor: "rgba(220, 38, 38, 0.7)",
            borderColor: "rgb(220, 38, 38)",
            borderWidth: 1,
          },
          {
            label: "Erzeugte Wärme (kWh)",
            data: measurements.map((m) => m.erzeugteWaerme),
            backgroundColor: "rgba(16, 185, 129, 0.7)",
            borderColor: "rgb(16, 185, 129)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Energieverbrauch vs. Erzeugte Wärme",
            font: {
              size: 16,
              weight: "bold",
            },
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          legend: {
            display: true,
            labels: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Energie (kWh)",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          x: {
            title: {
              display: true,
              text: "Datum",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  renderStartsChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `$${date.getDate().toString().padStart(2, "0")}.$${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    });

    this.currentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Wärmepumpe Starts",
            data: measurements.map((m) => m.startsWaermepumpe),
            borderColor: "rgb(147, 51, 234)",
            backgroundColor: "rgba(147, 51, 234, 0.1)",
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "rgb(147, 51, 234)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 6,
          },
          {
            label: "Δ Starts zum Vortag",
            data: measurements.map((m) => m.deltaStartsVortag || 0),
            borderColor: "rgb(245, 158, 11)",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            borderDash: [5, 5],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Wärmepumpe Starts und Veränderungen",
            font: {
              size: 16,
              weight: "bold",
            },
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          legend: {
            display: true,
            labels: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Anzahl Starts",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          x: {
            title: {
              display: true,
              text: "Datum",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  renderKWhChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    });

    // Berechne Verbrauch zwischen Messungen
    const consumption = [];
    for (let i = 1; i < measurements.length; i++) {
      const diff = measurements[i].kwZaehlerstand - measurements[i - 1].kwZaehlerstand;
      consumption.push(diff > 0 ? diff : 0);
    }
    consumption.unshift(0); // Erste Messung hat keinen Verbrauch

    this.currentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "kW Zählerstand",
            data: measurements.map((m) => m.kwZaehlerstand),
            borderColor: "rgb(99, 102, 241)",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            borderWidth: 3,
            fill: false,
            tension: 0.4,
            pointBackgroundColor: "rgb(99, 102, 241)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 6,
            yAxisID: 'y'
          },
          {
            label: "Verbrauch zwischen Messungen (kWh)",
            data: consumption,
            type: 'bar', // Bar Chart für Verbrauch
            backgroundColor: "rgba(239, 68, 68, 0.7)",
            borderColor: "rgb(239, 68, 68)",
            borderWidth: 1,
            yAxisID: 'y1'
          },
          {
            label: "Wärmepumpen-Verbrauch (kWh)", // ← NEU: Fehlende Messreihe
            data: measurements.map((m) => m.energieverbrauch),
            borderColor: "rgb(16, 185, 129)",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            borderDash: [5, 5], // Gestrichelte Linie
            pointBackgroundColor: "rgb(16, 185, 129)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1,
            pointRadius: 4,
            yAxisID: 'y1'
          }
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: true,
            text: "kW Zählerstand und Verbrauch",
            font: {
              size: 16,
              weight: "bold",
            },
            color: getComputedStyle(document.documentElement).getPropertyValue(
              "--text-color",
            ),
          },
          legend: {
            display: true,
            labels: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              afterLabel: function (context) {
                if (context.datasetIndex === 0) {
                  const measurement = measurements[context.dataIndex];
                  return [
                    `Differenz zu WP: ${(measurement.kwZaehlerstand - measurement.energieverbrauch).toFixed(1)} kWh`,
                  ];
                }
                return null;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Datum",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: "kW Zählerstand (kWh)",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--border-color"),
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: "Verbrauch (kWh)",
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-color"),
            },
            ticks: {
              color: getComputedStyle(
                document.documentElement,
              ).getPropertyValue("--text-secondary"),
            },
            grid: {
              drawOnChartArea: false, // Nur rechte Y-Achse ohne Grid
            },
          },
        },
        animation: {
          duration: 1000,
          easing: "easeInOutQuart",
        },
      },
    });
  }

  // Aktuelle Datum/Zeit setzen
  setCurrentDateTime() {
    const now = new Date();
    const localDateTime = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
    document.getElementById("datum-uhrzeit").value = localDateTime;
  }

  // Messwert speichern
  saveMeasurement() {
    const formData = this.getFormData("measurement-form");

    if (!this.validateMeasurement(formData)) {
      return;
    }

    const measurement = {
      id: this.editingId || Date.now().toString(),
      datum: formData.datumUhrzeit,
      energieverbrauch: parseFloat(formData.energieverbrauch),
      erzeugteWaerme: parseFloat(formData.erzeugteWaerme),
      aussentemperatur: parseFloat(formData.aussentemperatur),
      raumtemperatur: parseFloat(formData.raumtemperatur),
      vorlauftemperatur: parseFloat(formData.vorlauftemperatur),
      startsWaermepumpe: parseInt(formData.startsWaermepumpe),
      kwZaehlerstand: parseFloat(formData.kwZaehlerstand),
      bemerkung: formData.bemerkung || "",
    };

    // Berechnete Felder
    measurement.cop = this.calculateCOP(
      measurement.erzeugteWaerme,
      measurement.energieverbrauch,
    );
    measurement.deltaInnenAussen =
      measurement.raumtemperatur - measurement.aussentemperatur;
    measurement.deltaVerbrauchVortag = this.calculateDeltaVerbrauch(measurement);
    measurement.deltaStartsVortag = this.calculateDeltaStarts(measurement);
    measurement.differenzKwWp = this.calculateDifferenzKwWp(measurement);

    if (this.editingId) {
      // Bearbeiten
      const index = this.measurements.findIndex((m) => m.id === this.editingId);
      if (index !== -1) {
        this.measurements[index] = measurement;
        this.showMessage("Messwert aktualisiert!", "success");
        document.querySelector(".add-measurement-section h2").textContent =
          "📝 Messwerte erfassen";
        document.getElementById("measurement-cancel").style.display = "none";
      }
    } else {
      // Neu hinzufügen
      this.measurements.push(measurement);
      this.showMessage("Messwert gespeichert!", "success");
    }

    // Neu berechnen für alle Messungen (für Delta-Werte)
    this.recalculateAllDeltas();

    this.saveData();
    this.clearForm();
    this.updateOverview();
    this.renderMeasurements();
    this.renderChart(this.currentChartType); // ← Aktueller Chart statt "cop"
    this.cancelEdit();
  }

  // COP Berechnung (Coefficient of Performance)
  calculateCOP(erzeugteWaerme, energieverbrauch) {
    if (energieverbrauch === 0) return 0;
    return Math.round((erzeugteWaerme / energieverbrauch) * 100) / 100;
  }

  // Delta Verbrauch zum Vortag
  calculateDeltaVerbrauch(currentMeasurement) {
    const currentDate = new Date(currentMeasurement.datum);
    const previousDay = new Date(currentDate);
    previousDay.setDate(currentDate.getDate() - 1);

    const previousMeasurement = this.findMeasurementByDate(previousDay);
    if (!previousMeasurement) return 0;

    return (
      Math.round(
        (currentMeasurement.energieverbrauch -
          previousMeasurement.energieverbrauch) *
        10,
      ) / 10
    );
  }

  // Delta Starts zum Vortag
  calculateDeltaStarts(currentMeasurement) {
    const currentDate = new Date(currentMeasurement.datum);
    const previousDay = new Date(currentDate);
    previousDay.setDate(currentDate.getDate() - 1);

    const previousMeasurement = this.findMeasurementByDate(previousDay);
    if (!previousMeasurement) return 0;

    return (
      currentMeasurement.startsWaermepumpe -
      previousMeasurement.startsWaermepumpe
    );
  }

  // Differenz KW - WP
  calculateDifferenzKwWp(measurement) {
    // Hier könnte eine spezifische Berechnung implementiert werden
    // Aktuell: Differenz zwischen KW Zählerstand und Energieverbrauch
    return (
      Math.round(
        (measurement.kwZaehlerstand - measurement.energieverbrauch) * 10,
      ) / 10
    );
  }

  // Hilfsfunktion um Messung nach Datum zu finden
  findMeasurementByDate(date) {
    const searchDate = date.toDateString();
    return this.measurements.find(m => {
      const measurementDate = new Date(m.datum).toDateString();
      return measurementDate === searchDate;
    });
  }

  // Delta-Werte neu berechnen
  recalculateAllDeltas() {
    // Sortiere alle Messungen nach Datum
    this.measurements.sort((a, b) => new Date(a.datum) - new Date(b.datum));

    this.measurements.forEach(measurement => {
      measurement.deltaVerbrauchVortag = this.calculateDeltaVerbrauch(measurement);
      measurement.deltaStartsVortag = this.calculateDeltaStarts(measurement);
    });
  }

  // Formulardaten abrufen
  getFormData(formId) {
    const form = document.getElementById(formId);
    const formData = {};

    const fieldMapping = {
      'datum-uhrzeit': 'datumUhrzeit',
      'energieverbrauch': 'energieverbrauch',
      'erzeugte-waerme': 'erzeugteWaerme',
      'aussentemperatur': 'aussentemperatur',
      'raumtemperatur': 'raumtemperatur',
      'vorlauftemperatur': 'vorlauftemperatur',
      'starts-waermepumpe': 'startsWaermepumpe',
      'kw-zaehlerstand': 'kwZaehlerstand',
      'bemerkung': 'bemerkung',
      // Edit-Form Felder
      'edit-datum-uhrzeit': 'datumUhrzeit',
      'edit-energieverbrauch': 'energieverbrauch',
      'edit-erzeugte-waerme': 'erzeugteWaerme',
      'edit-aussentemperatur': 'aussentemperatur',
      'edit-raumtemperatur': 'raumtemperatur',
      'edit-vorlauftemperatur': 'vorlauftemperatur',
      'edit-starts-waermepumpe': 'startsWaermepumpe',
      'edit-kw-zaehlerstand': 'kwZaehlerstand',
      'edit-bemerkung': 'bemerkung'
    };

    const inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      const mappedName = fieldMapping[input.id] || input.id;
      formData[mappedName] = input.value;
    });

    return formData;
  }

  // Validierung
  validateMeasurement(formData) {
    if (!formData.datumUhrzeit) {
      this.showMessage('Bitte Datum und Uhrzeit eingeben!', 'error');
      return false;
    }
    return true;
  }

  // Formular zurücksetzen
  clearForm() {
    document.getElementById("measurement-form").reset();
    this.setCurrentDateTime();
  }

  // Bearbeitung abbrechen
  cancelEdit() {
    this.editingId = null;
    document.getElementById("measurement-cancel").style.display = "none";
    document.querySelector(".add-measurement-section h2").textContent =
      "📝 Messwerte erfassen";
    this.clearForm();
  }

  // Übersicht aktualisieren
  updateOverview() {
    const filteredMeasurements = this.getFilteredMeasurements();

    // Periode anzeigen
    const periodeText =
      this.currentMonth === 0
        ? this.currentYear.toString()
        : `${this.getMonthName(this.currentMonth)} ${this.currentYear}`;

    document.getElementById("overview-periode").textContent = periodeText;
    document.getElementById("chart-periode").textContent = periodeText;
    document.getElementById("measurements-periode").textContent = periodeText;

    if (filteredMeasurements.length === 0) {
      document.getElementById("avg-cop").textContent = "0.0";
      document.getElementById("total-energy").textContent = "0 kWh";
      document.getElementById("avg-starts").textContent = "0";
      document.getElementById("efficiency-text").textContent = "Keine Daten";
      document.getElementById("efficiency-status").className = "overview-card";
      this.showNoDataChart();
      return;
    }

    // Sortiere für kW-Berechnung
    const sortedMeasurements = [...filteredMeasurements].sort((a, b) => new Date(a.datum) - new Date(b.datum));

    // Durchschnittlicher COP
    const avgCOP =
      filteredMeasurements.reduce((sum, m) => sum + m.cop, 0) /
      filteredMeasurements.length;
    document.getElementById("avg-cop").textContent = avgCOP.toFixed(1);

    // Gesamtenergie aus kW Zählerstand (wenn mehr als eine Messung)
    let totalEnergyFromMeter = 0;
    if (sortedMeasurements.length > 1) {
      const firstReading = sortedMeasurements[0].kwZaehlerstand;
      const lastReading = sortedMeasurements[sortedMeasurements.length - 1].kwZaehlerstand;
      totalEnergyFromMeter = lastReading - firstReading;
    }

    // Zeige beide Werte an
    const totalEnergyWP = filteredMeasurements.reduce(
      (sum, m) => sum + m.energieverbrauch,
      0,
    );

    document.getElementById("total-energy").textContent =
      `${totalEnergyWP.toFixed(1)} kWh (WP)`;

    // Durchschnittliche Starts pro Tag
    const totalStarts = filteredMeasurements.reduce(
      (sum, m) => sum + m.startsWaermepumpe,
      0,
    );
    const avgStarts = Math.round(totalStarts / filteredMeasurements.length);
    document.getElementById("avg-starts").textContent = avgStarts.toString();

    // Effizienz Status
    const efficiencyElement = document.getElementById("efficiency-status");
    const efficiencyTextElement = document.getElementById("efficiency-text");

    if (avgCOP >= 4.5) {
      efficiencyElement.className = "overview-card efficiency-good";
      efficiencyTextElement.textContent = "Sehr gut";
    } else if (avgCOP >= 3.5) {
      efficiencyElement.className = "overview-card efficiency-medium";
      efficiencyTextElement.textContent = "Gut";
    } else if (avgCOP >= 2.5) {
      efficiencyElement.className = "overview-card efficiency-medium";
      efficiencyTextElement.textContent = "Mittelmäßig";
    } else {
      efficiencyElement.className = "overview-card efficiency-poor";
      efficiencyTextElement.textContent = "Verbesserungsbedarf";
    }
  }

  // Messwerte rendern
  renderMeasurements() {
    const container = document.getElementById("measurements-list");
    const filteredMeasurements = this.getFilteredMeasurements();

    if (filteredMeasurements.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Keine Messwerte vorhanden</h3>
          <p>Erfassen Sie Ihre ersten Heizungsdaten oben im Formular.</p>
          <p><small>Aktuell gewählt: ${this.currentYear}, Monat: ${this.currentMonth === 0 ? "Alle" : this.getMonthName(this.currentMonth)}</small></p>
        </div>
      `;
      return;
    }

    // Nach Datum sortieren (neueste zuerst)
    filteredMeasurements.sort((a, b) => new Date(b.datum) - new Date(a.datum));

    const measurementsHtml = filteredMeasurements
      .map((measurement) => {
        const datum = new Date(measurement.datum);
        const datumStr = datum.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const uhrzeitStr = datum.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return `
          <div class="data-item">
            <div class="data-info">
              <div class="data-date">${datumStr} ${uhrzeitStr}</div>
              <div class="data-details">
                COP: <strong>${measurement.cop}</strong> | 
                ${measurement.energieverbrauch}kWh → ${measurement.erzeugteWaerme}kWh | 
                Außen: ${measurement.aussentemperatur}°C | 
                Starts: ${measurement.startsWaermepumpe}
                ${measurement.bemerkung ? `<br><em>${measurement.bemerkung}</em>` : ""}
              </div>
            </div>
            <div class="data-actions">
              <button class="btn-icon" onclick="window.app.editMeasurement('${measurement.id}')" title="Bearbeiten">
                ✏️
              </button>
              <button class="btn-icon danger" onclick="window.app.deleteMeasurement('${measurement.id}')" title="Löschen">
                🗑️
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = measurementsHtml;
  }

  // Messwert bearbeiten
  editMeasurement(id) {
    const measurement = this.measurements.find((m) => m.id === id);
    if (!measurement) return;

    this.editingId = id;

    // Edit Modal füllen
    const datum = new Date(measurement.datum);
    const localDateTime = new Date(
      datum.getTime() - datum.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);

    document.getElementById("edit-id").value = id;
    document.getElementById("edit-datum-uhrzeit").value = localDateTime;
    document.getElementById("edit-energieverbrauch").value =
      measurement.energieverbrauch;
    document.getElementById("edit-erzeugte-waerme").value =
      measurement.erzeugteWaerme;
    document.getElementById("edit-aussentemperatur").value =
      measurement.aussentemperatur;
    document.getElementById("edit-raumtemperatur").value =
      measurement.raumtemperatur;
    document.getElementById("edit-vorlauftemperatur").value =
      measurement.vorlauftemperatur;
    document.getElementById("edit-starts-waermepumpe").value =
      measurement.startsWaermepumpe;
    document.getElementById("edit-kw-zaehlerstand").value =
      measurement.kwZaehlerstand;
    document.getElementById("edit-bemerkung").value = measurement.bemerkung;

    // Modal öffnen
    document.getElementById("edit-modal").style.display = "block";
  }

  // Messwert aktualisieren
  updateMeasurement() {
    const formData = this.getFormData("edit-form");

    if (!this.validateMeasurement(formData)) {
      return;
    }

    const index = this.measurements.findIndex((m) => m.id === this.editingId);
    if (index === -1) return;

    const measurement = {
      ...this.measurements[index],
      datum: formData.datumUhrzeit,
      energieverbrauch: parseFloat(formData.energieverbrauch),
      erzeugteWaerme: parseFloat(formData.erzeugteWaerme),
      aussentemperatur: parseFloat(formData.aussentemperatur),
      raumtemperatur: parseFloat(formData.raumtemperatur),
      vorlauftemperatur: parseFloat(formData.vorlauftemperatur),
      startsWaermepumpe: parseInt(formData.startsWaermepumpe),
      kwZaehlerstand: parseFloat(formData.kwZaehlerstand),
      bemerkung: formData.bemerkung || "",
    };

    // Berechnete Felder aktualisieren
    measurement.cop = this.calculateCOP(
      measurement.erzeugteWaerme,
      measurement.energieverbrauch,
    );
    measurement.deltaInnenAussen =
      measurement.raumtemperatur - measurement.aussentemperatur;

    this.measurements[index] = measurement;

    // Delta-Werte neu berechnen
    this.recalculateAllDeltas();

    this.saveData();
    this.updateOverview();
    this.renderMeasurements();
    this.renderChart(this.currentChartType); // ← Chart-Update hinzufügen
    this.showMessage("Messwert erfolgreich aktualisiert!", "success");
  }

  // Messwert löschen
  deleteMeasurement(id) {
    if (!confirm("Möchten Sie diesen Messwert wirklich löschen?")) {
      return;
    }

    this.measurements = this.measurements.filter((m) => m.id !== id);

    // Delta-Werte neu berechnen
    this.recalculateAllDeltas();

    this.saveData();
    this.updateOverview();
    this.renderMeasurements();
    this.renderChart(this.currentChartType); // ← NEU: Chart-Update hinzufügen
    this.showMessage("Messwert gelöscht!", "success");
  }

  // Edit Modal schließen
  closeEditModal() {
    document.getElementById("edit-modal").style.display = "none";
    this.editingId = null;
  }

  // Backup Modal öffnen
  openBackupModal() {
    document.getElementById("backup-modal").style.display = "block";
    this.updateLastBackupInfo();
  }

  // Backup Modal schließen
  closeBackupModal() {
    document.getElementById("backup-modal").style.display = "none";

    // Import-Zustand komplett zurücksetzen
    document.getElementById("import-options").style.display = "none";
    document.getElementById("import-file-info").textContent = "Keine Datei ausgewählt";
    document.getElementById("import-file-info").className = "file-info";
    document.getElementById("import-file").value = "";

    // Pending import data zurücksetzen
    this.pendingImportData = null;
  }

  // Backup Handlers
  setupBackupHandlers() {
    // Export
    document.getElementById("export-json").addEventListener("click", () => {
      this.exportData();
    });

    // Import
    document
      .getElementById("select-import-file")
      .addEventListener("click", () => {
        document.getElementById("import-file").click();
      });

    document.getElementById("import-file").addEventListener("change", (e) => {
      this.handleImportFile(e.target.files[0]);
    });

    document.getElementById("confirm-import").addEventListener("click", () => {
      this.confirmImport();
    });

    document.getElementById("cancel-import").addEventListener("click", () => {
      this.cancelImport();
    });
  }

  // Daten exportieren
  exportData() {
    const exportData = {
      measurements: this.measurements,
      exportDate: new Date().toISOString(),
      appVersion: "1.7",
      totalMeasurements: this.measurements.length,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const now = new Date();
    const filename = `heizungseffizienz-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Last backup info aktualisieren
    localStorage.setItem(
      "heizungseffizienz-last-backup",
      new Date().toISOString(),
    );
    this.updateLastBackupInfo();

    this.showMessage("Backup erfolgreich erstellt!", "success");
  }

  // Import Datei handhaben
  handleImportFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);

        if (
          !importData.measurements ||
          !Array.isArray(importData.measurements)
        ) {
          throw new Error("Ungültiges Backup-Format");
        }

        document.getElementById("import-file-info").textContent =
          `✅ ${file.name} (${importData.measurements.length} Messwerte)`;
        document.getElementById("import-file-info").className =
          "file-info has-file";
        document.getElementById("import-options").style.display = "block";

        this.pendingImportData = importData;
      } catch (error) {
        console.error("Import error:", error);
        this.showMessage("Fehler beim Lesen der Backup-Datei!", "error");
        document.getElementById("import-file-info").textContent =
          "Fehler beim Lesen der Datei";
        document.getElementById("import-file-info").className = "file-info";
      }
    };
    reader.readAsText(file);
  }

  // Import bestätigen
  confirmImport() {
    if (!this.pendingImportData) return;

    const importMode = document.querySelector(
      'input[name="import-mode"]:checked',
    ).value;
    const importMeasurements = this.pendingImportData.measurements;

    switch (importMode) {
      case "replace":
        this.measurements = importMeasurements;
        this.showMessage(`Alle Daten ersetzt! ${importMeasurements.length} Messwerte geladen.`, "success");
        break;

      case "merge":
        // Vorhandene IDs sammeln
        const existingIds = new Set(this.measurements.map(m => m.id));
        const newMeasurements = importMeasurements.filter(m => !existingIds.has(m.id));
        this.measurements.push(...newMeasurements);
        this.showMessage(`${newMeasurements.length} neue Messwerte hinzugefügt.`, "success");
        break;

      case "add":
        this.measurements.push(...importMeasurements);
        this.showMessage(`${importMeasurements.length} Messwerte hinzugefügt.`, "success");
        break;
    }

    this.recalculateAllDeltas();
    this.saveData();
    this.updateOverview();
    this.renderMeasurements();
    this.renderChart(this.currentChartType); // ← NEU: Chart-Update hinzufügen
    this.closeBackupModal();
  }

  // Import abbrechen
  cancelImport() {
    this.pendingImportData = null;
    document.getElementById("import-options").style.display = "none";
    document.getElementById("import-file-info").textContent = "Keine Datei ausgewählt";
    document.getElementById("import-file-info").className = "file-info";
    document.getElementById("import-file").value = "";
  }

  // Last Backup Info aktualisieren
  updateLastBackupInfo() {
    const lastBackup = localStorage.getItem("heizungseffizienz-last-backup");
    const element = document.getElementById("last-backup-info");

    if (lastBackup) {
      const date = new Date(lastBackup);
      element.textContent = `Letztes Backup: ${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE")}`;
    } else {
      element.textContent = "Noch kein Backup erstellt";
    }
  }

  // Monatsname
  getMonthName(month) {
    const months = [
      "",
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    return months[month] || "";
  }

  // Update-Banner Funktion
  showUpdateBanner() {
    // Entferne bereits existierende Banner
    const existingBanner = document.querySelector('.update-banner');
    if (existingBanner) {
      existingBanner.remove();
    }

    const banner = document.createElement("div");
    banner.className = "update-banner";
    banner.innerHTML = `
      <div class="update-content">
        <span>🆕 Neue Version verfügbar!</span>
        <div class="update-buttons">
          <button id="update-now" class="update-btn primary">
            Jetzt aktualisieren
          </button>
          <button id="update-later" class="update-btn secondary">
            Später
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);
    setTimeout(() => banner.classList.add("show"), 100);

    // Event Listeners für Update-Buttons
    document.getElementById("update-now").addEventListener("click", () => {
      this.performUpdate();
    });

    document.getElementById("update-later").addEventListener("click", () => {
      banner.remove();
    });
  }

  // Update durchführen
  async performUpdate() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.waiting) {
        // Sende Message an wartenden Service Worker
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });

        // Warte auf Controller-Wechsel
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log("🔄 App wird neu geladen...");
          window.location.reload();
        });
      } else {
        // Fallback: Einfach neu laden
        window.location.reload();
      }
    } catch (error) {
      console.error("Update fehlgeschlagen:", error);
      window.location.reload();
    }
  }

  // Nachrichten anzeigen
  showMessage(text, type = "info") {
    const container =
      document.getElementById("message-container") ||
      this.createMessageContainer();

    const message = document.createElement("div");
    message.className = `message ${type}`;
    message.textContent = text;

    container.appendChild(message);

    // Auto-remove nach 4 Sekunden
    setTimeout(() => {
      if (message.parentNode) {
        message.parentNode.removeChild(message);
      }
    }, 4000);
  }

  createMessageContainer() {
    const container = document.createElement("div");
    container.id = "message-container";
    container.style.position = "fixed";
    container.style.top =
      "calc(var(--header-height) + 1rem + env(safe-area-inset-top))";
    container.style.left = "1rem";
    container.style.right = "1rem";
    container.style.zIndex = "1001";
    document.body.appendChild(container);
    return container;
  }
}

// App initialisieren
window.addEventListener("DOMContentLoaded", () => {
  window.app = new HeizungseffizienzApp();
});
