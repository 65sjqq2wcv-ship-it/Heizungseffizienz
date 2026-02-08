// Heizungseffizienz App - JavaScript
// Version: 1.2

class HeizungseffizienzApp {
  constructor() {
    this.measurements = [];
    this.editingId = null;
    this.currentYear = new Date().getFullYear();
    this.currentMonth = 0; // 0 = alle Monate

    this.init();
  }

  async init() {
    this.loadData();
    this.setupEventListeners();
    this.updateOverview();
    this.renderMeasurements();
    this.setCurrentDateTime();
    this.registerServiceWorker();
  }

  // Service Worker Registration
  async registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        console.log("Service Worker registered successfully:", registration);

        // Update handling
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              this.showUpdateBanner();
            }
          });
        });
      } catch (error) {
        console.error("Service Worker registration failed:", error);
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

        // UI State wiederherstellen
        document.getElementById("jahresauswahl").value = this.currentYear;
        document.getElementById("monatsauswahl").value = this.currentMonth;
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        this.measurements = [];
      }
    }
  }

  // Daten speichern
  saveData() {
    const data = {
      measurements: this.measurements,
      currentYear: this.currentYear,
      currentMonth: this.currentMonth,
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
    });

    document.getElementById("monatsauswahl").addEventListener("change", (e) => {
      this.currentMonth = parseInt(e.target.value);
      this.saveData();
      this.updateOverview();
      this.renderMeasurements();
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

    // Backup Modal
    document.getElementById("backup-icon").addEventListener("click", () => {
      this.openBackupModal();
    });

    document
      .getElementById("backup-modal-close")
      .addEventListener("click", () => {
        this.closeBackupModal();
      });

    // Backup/Import
    this.setupBackupHandlers();

    // Modal schließen bei Klick außerhalb
    window.addEventListener("click", (e) => {
      const editModal = document.getElementById("edit-modal");
      const backupModal = document.getElementById("backup-modal");

      if (e.target === editModal) {
        this.closeEditModal();
      }
      if (e.target === backupModal) {
        this.closeBackupModal();
      }
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
      erstelltAm: this.editingId
        ? this.measurements.find((m) => m.id === this.editingId)?.erstelltAm ||
          new Date().toISOString()
        : new Date().toISOString(),
    };

    // Berechnete Felder hinzufügen
    measurement.cop = this.calculateCOP(
      measurement.erzeugteWaerme,
      measurement.energieverbrauch,
    );
    measurement.deltaInnenAussen =
      measurement.raumtemperatur - measurement.aussentemperatur;
    measurement.deltaVerbrauchVortag =
      this.calculateDeltaVerbrauch(measurement);
    measurement.deltaStartsVortag = this.calculateDeltaStarts(measurement);
    measurement.differenzKwWp = this.calculateDifferenzKwWp(measurement);

    if (this.editingId) {
      const index = this.measurements.findIndex((m) => m.id === this.editingId);
      if (index !== -1) {
        this.measurements[index] = measurement;
        this.showMessage("Messwert erfolgreich aktualisiert!", "success");
      }
    } else {
      this.measurements.push(measurement);
      this.showMessage("Messwert erfolgreich gespeichert!", "success");
    }

    // Neu berechnen für alle Messungen (für Delta-Werte)
    this.recalculateAllDeltas();

    this.saveData();
    this.clearForm();
    this.updateOverview();
    this.renderMeasurements();
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

  // Messung anhand Datum finden
  findMeasurementByDate(date) {
    const targetDateStr = date.toISOString().split("T")[0];
    return this.measurements.find((m) => {
      const measurementDateStr = new Date(m.datum).toISOString().split("T")[0];
      return measurementDateStr === targetDateStr;
    });
  }

  // Alle Delta-Werte neu berechnen
  recalculateAllDeltas() {
    // Sortieren nach Datum für korrekte Delta-Berechnung
    this.measurements.sort((a, b) => new Date(a.datum) - new Date(b.datum));

    this.measurements.forEach((measurement) => {
      measurement.deltaVerbrauchVortag =
        this.calculateDeltaVerbrauch(measurement);
      measurement.deltaStartsVortag = this.calculateDeltaStarts(measurement);
      measurement.differenzKwWp = this.calculateDifferenzKwWp(measurement);
    });
  }

  // Formular validieren
  validateMeasurement(data) {
    if (!data.datumUhrzeit || !data.energieverbrauch || !data.erzeugteWaerme) {
      this.showMessage("Bitte füllen Sie alle Pflichtfelder aus!", "error");
      return false;
    }

    if (
      parseFloat(data.energieverbrauch) <= 0 ||
      parseFloat(data.erzeugteWaerme) <= 0
    ) {
      this.showMessage(
        "Energieverbrauch und Wärme müssen größer als 0 sein!",
        "error",
      );
      return false;
    }

    return true;
  }

  // Formular Daten abrufen
  getFormData(formId) {
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    const data = {};

    // Spezifische Feldnamen mapping
    const fieldMapping = {
      "datum-uhrzeit": "datumUhrzeit",
      energieverbrauch: "energieverbrauch",
      "erzeugte-waerme": "erzeugteWaerme",
      aussentemperatur: "aussentemperatur",
      raumtemperatur: "raumtemperatur",
      vorlauftemperatur: "vorlauftemperatur",
      "starts-waermepumpe": "startsWaermepumpe",
      "kw-zaehlerstand": "kwZaehlerstand",
      bemerkung: "bemerkung",
      // Edit form fields
      "edit-datum-uhrzeit": "datumUhrzeit",
      "edit-energieverbrauch": "energieverbrauch",
      "edit-erzeugte-waerme": "erzeugteWaerme",
      "edit-aussentemperatur": "aussentemperatur",
      "edit-raumtemperatur": "raumtemperatur",
      "edit-vorlauftemperatur": "vorlauftemperatur",
      "edit-starts-waermepumpe": "startsWaermepumpe",
      "edit-kw-zaehlerstand": "kwZaehlerstand",
      "edit-bemerkung": "bemerkung",
    };

    // Alle Inputs durchgehen
    const inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach((input) => {
      const mappedName = fieldMapping[input.id] || input.id;
      data[mappedName] = input.value;
    });

    return data;
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
      return;
    }

    // Durchschnittlicher COP
    const avgCOP =
      filteredMeasurements.reduce((sum, m) => sum + m.cop, 0) /
      filteredMeasurements.length;
    document.getElementById("avg-cop").textContent = avgCOP.toFixed(1);

    // Gesamtenergie
    const totalEnergy = filteredMeasurements.reduce(
      (sum, m) => sum + m.energieverbrauch,
      0,
    );
    document.getElementById("total-energy").textContent =
      `${totalEnergy.toFixed(1)} kWh`;

    // Durchschnittliche Starts pro Tag
    const totalStarts = filteredMeasurements.reduce(
      (sum, m) => sum + m.startsWaermepumpe,
      0,
    );
    const avgStarts = Math.round(totalStarts / filteredMeasurements.length);
    document.getElementById("avg-starts").textContent = avgStarts.toString();

    // Effizienz Status
    this.updateEfficiencyStatus(avgCOP);
  }

  // Effizienz Status aktualisieren
  updateEfficiencyStatus(avgCOP) {
    const statusCard = document.getElementById("efficiency-status");
    const statusText = document.getElementById("efficiency-text");

    // Effizienz bewerten
    if (avgCOP >= 4.0) {
      statusCard.className = "overview-card efficiency-good";
      statusText.textContent = "Sehr gut";
    } else if (avgCOP >= 3.0) {
      statusCard.className = "overview-card efficiency-medium";
      statusText.textContent = "Gut";
    } else if (avgCOP >= 2.0) {
      statusCard.className = "overview-card efficiency-medium";
      statusText.textContent = "Befriedigend";
    } else if (avgCOP > 0) {
      statusCard.className = "overview-card efficiency-poor";
      statusText.textContent = "Verbesserungsbedarf";
    } else {
      statusCard.className = "overview-card";
      statusText.textContent = "Keine Daten";
    }
  }

  // Gefilterte Messungen abrufen (Debug-Version)
  getFilteredMeasurements() {
    console.log("Filtering measurements:", {
      total: this.measurements.length,
      currentYear: this.currentYear,
      currentMonth: this.currentMonth,
    });

    const filtered = this.measurements.filter((measurement) => {
      const measurementDate = new Date(measurement.datum);
      const measurementYear = measurementDate.getFullYear();
      const measurementMonth = measurementDate.getMonth() + 1;

      console.log("Checking measurement:", {
        datum: measurement.datum,
        measurementYear,
        measurementMonth,
        currentYear: this.currentYear,
        currentMonth: this.currentMonth,
      });

      if (measurementYear !== this.currentYear) {
        return false;
      }

      if (this.currentMonth !== 0 && measurementMonth !== this.currentMonth) {
        return false;
      }

      return true;
    });

    console.log("Filtered measurements:", filtered.length);
    return filtered;
  }

  // Messungen rendern (verbesserte Version)
  renderMeasurements() {
    const container = document.getElementById("measurements-list");
    const filteredMeasurements = this.getFilteredMeasurements();

    console.log("Rendering measurements:", filteredMeasurements.length); // Debug-Log

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
    this.closeEditModal();
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
    document.getElementById("import-options").style.display = "none";
    document.getElementById("import-file-info").textContent =
      "Keine Datei ausgewählt";
    document.getElementById("import-file-info").className = "file-info";
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
      appVersion: "1.2",
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
        this.measurements = [...importMeasurements];
        this.showMessage(
          `Alle Daten ersetzt! ${importMeasurements.length} Messwerte importiert.`,
          "success",
        );
        break;

      case "merge":
        // Bestehende IDs sammeln
        const existingIds = new Set(this.measurements.map((m) => m.id));
        const newMeasurements = importMeasurements.filter(
          (m) => !existingIds.has(m.id),
        );
        this.measurements = [...this.measurements, ...newMeasurements];
        this.showMessage(
          `Daten zusammengeführt! ${newMeasurements.length} neue Messwerte hinzugefügt.`,
          "success",
        );
        break;

      case "add":
        // Nur wirklich neue Messwerte (basierend auf Datum)
        const existingDates = new Set(this.measurements.map((m) => m.datum));
        const uniqueNewMeasurements = importMeasurements.filter(
          (m) => !existingDates.has(m.datum),
        );
        this.measurements = [...this.measurements, ...uniqueNewMeasurements];
        this.showMessage(
          `${uniqueNewMeasurements.length} neue Messwerte hinzugefügt.`,
          "success",
        );
        break;
    }

    // Delta-Werte neu berechnen
    this.recalculateAllDeltas();

    this.saveData();
    this.updateOverview();
    this.renderMeasurements();
    this.closeBackupModal();

    this.pendingImportData = null;
  }

  // Import abbrechen
  cancelImport() {
    this.pendingImportData = null;
    document.getElementById("import-options").style.display = "none";
    document.getElementById("import-file-info").textContent =
      "Keine Datei ausgewählt";
    document.getElementById("import-file-info").className = "file-info";
    document.getElementById("import-file").value = "";
  }

  // Last Backup Info aktualisieren (Fortsetzung der vorherigen Funktion)
  updateLastBackupInfo() {
    const lastBackup = localStorage.getItem("heizungseffizienz-last-backup");
    const infoElement = document.getElementById("last-backup-info");

    if (lastBackup) {
      const backupDate = new Date(lastBackup);
      infoElement.textContent = `Letztes Backup: ${backupDate.toLocaleDateString("de-DE")} ${backupDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      infoElement.textContent = "Noch kein Backup erstellt";
    }
  }

  // Chart-Funktionalität (verbesserte Version mit Icons)
initChart() {
    const container = document.getElementById('chart-container');
    container.innerHTML = `
        <div class="chart-controls">
            <button id="chart-cop" class="chart-btn active"> COP Verlauf</button>
            <button id="chart-temp" class="chart-btn"> Temperaturen</button>
            <button id="chart-energy" class="chart-btn"> Energie</button>
            <button id="chart-starts" class="chart-btn"> Starts</button>
        </div>
        <canvas id="efficiency-chart" width="400" height="200"></canvas>
    `;

    this.setupChartControls();
    this.renderChart('cop');
}


  setupChartControls() {
    document.getElementById("chart-cop").addEventListener("click", () => {
      this.setActiveChartButton("chart-cop");
      this.renderChart("cop");
    });

    document.getElementById("chart-temp").addEventListener("click", () => {
      this.setActiveChartButton("chart-temp");
      this.renderChart("temperature");
    });

    document.getElementById("chart-energy").addEventListener("click", () => {
      this.setActiveChartButton("chart-energy");
      this.renderChart("energy");
    });

    document.getElementById("chart-starts").addEventListener("click", () => {
      this.setActiveChartButton("chart-starts");
      this.renderChart("starts");
    });
  }

  setActiveChartButton(activeId) {
    document.querySelectorAll(".chart-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.getElementById(activeId).classList.add("active");
  }

  renderChart(type) {
    const filteredMeasurements = this.getFilteredMeasurements();

    if (filteredMeasurements.length === 0) {
      this.showNoDataChart();
      return;
    }

    // Sortiere nach Datum
    filteredMeasurements.sort((a, b) => new Date(a.datum) - new Date(b.datum));

    // Zerstöre existierenden Chart
    if (this.currentChart) {
      this.currentChart.destroy();
    }

    const ctx = document.getElementById("efficiency-chart").getContext("2d");

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
    }
  }

  renderCOPChart(ctx, measurements) {
    const labels = measurements.map((m) => {
      const date = new Date(m.datum);
      return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`;
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
      return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`;
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
      return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`;
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
      return `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}`;
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

  showNoDataChart() {
    const container = document.getElementById("chart-container");
    container.innerHTML = `
            <div class="chart-controls">
                <button id="chart-cop" class="chart-btn active">COP Verlauf</button>
                <button id="chart-temp" class="chart-btn">Temperaturen</button>
                <button id="chart-energy" class="chart-btn">Energie</button>
                <button id="chart-starts" class="chart-btn">Starts</button>
            </div>
            <div class="empty-state" style="height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                <h3>Keine Daten verfügbar</h3>
                <p>Erfassen Sie Messwerte, um Diagramme zu sehen</p>
            </div>
        `;
    this.setupChartControls();
  }

  // Helper: Monatsname
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

  // Update Banner für App Updates
  showUpdateBanner() {
    const banner = document.createElement("div");
    banner.className = "update-banner";
    banner.innerHTML = `
            ⬆️ Neue Version verfügbar! 
            <button onclick="this.parentElement.style.display='none'; location.reload();">
                Aktualisieren
            </button>
        `;
    document.body.appendChild(banner);
    setTimeout(() => banner.classList.add("show"), 100);
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

  // Init überschreiben um Chart zu initialisieren
  async init() {
    this.loadData();
    this.setupEventListeners();
    this.updateOverview();
    this.renderMeasurements();
    this.setCurrentDateTime();
    this.initChart(); // Chart initialisieren
    this.registerServiceWorker();
  }

  // Overview updaten überschreiben um Chart zu aktualisieren
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
      this.showNoDataChart(); // Chart aktualisieren
      return;
    }

    // Durchschnittlicher COP
    const avgCOP =
      filteredMeasurements.reduce((sum, m) => sum + m.cop, 0) /
      filteredMeasurements.length;
    document.getElementById("avg-cop").textContent = avgCOP.toFixed(1);

    // Gesamtenergie
    const totalEnergy = filteredMeasurements.reduce(
      (sum, m) => sum + m.energieverbrauch,
      0,
    );
    document.getElementById("total-energy").textContent =
      `${totalEnergy.toFixed(1)} kWh`;

    // Durchschnittliche Starts pro Tag
    const totalStarts = filteredMeasurements.reduce(
      (sum, m) => sum + m.startsWaermepumpe,
      0,
    );
    const avgStarts = Math.round(totalStarts / filteredMeasurements.length);
    document.getElementById("avg-starts").textContent = avgStarts.toString();

    // Effizienz Status
    this.updateEfficiencyStatus(avgCOP);

    // Chart aktualisieren
    const activeButton = document.querySelector(".chart-btn.active");
    if (activeButton) {
      const chartType = activeButton.id.replace("chart-", "");
      const typeMap = {
        cop: "cop",
        temp: "temperature",
        energy: "energy",
        starts: "starts",
      };
      this.renderChart(typeMap[chartType] || "cop");
    }
  }
}

// App initialisieren wenn DOM geladen ist
document.addEventListener("DOMContentLoaded", () => {
  window.app = new HeizungseffizienzApp();
});
