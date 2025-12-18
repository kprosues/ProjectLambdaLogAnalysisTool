// Combined Fuel Trim Tab Module - wraps Short Term and Long Term Fuel Trim functionality
const CombinedFuelTrimTab = {
  // Store references to the wrapped tab modules
  shortTermTab: null,
  longTermTab: null,

  // Expose combined charts from both wrapped modules
  get charts() {
    const combined = {};
    if (this.shortTermTab && this.shortTermTab.charts) {
      Object.keys(this.shortTermTab.charts).forEach(key => {
        combined['shortTerm_' + key] = this.shortTermTab.charts[key];
      });
    }
    if (this.longTermTab && this.longTermTab.charts) {
      Object.keys(this.longTermTab.charts).forEach(key => {
        combined['longTerm_' + key] = this.longTermTab.charts[key];
      });
    }
    return combined;
  },
  
  // Expose combined chartOriginalRanges from both wrapped modules
  get chartOriginalRanges() {
    const combined = {};
    if (this.shortTermTab && this.shortTermTab.chartOriginalRanges) {
      Object.keys(this.shortTermTab.chartOriginalRanges).forEach(key => {
        combined['shortTerm_' + key] = this.shortTermTab.chartOriginalRanges[key];
      });
    }
    if (this.longTermTab && this.longTermTab.chartOriginalRanges) {
      Object.keys(this.longTermTab.chartOriginalRanges).forEach(key => {
        combined['longTerm_' + key] = this.longTermTab.chartOriginalRanges[key];
      });
    }
    return combined;
  },

  initialize() {
    // Initialize Short Term Fuel Trim tab functionality
    if (typeof FuelTrimTab !== 'undefined') {
      this.shortTermTab = FuelTrimTab;
      this.shortTermTab.initialize();
    } else {
      console.warn('FuelTrimTab not found');
    }

    // Initialize Long Term Fuel Trim tab functionality
    if (typeof LongTermFuelTrimTab !== 'undefined') {
      this.longTermTab = LongTermFuelTrimTab;
      this.longTermTab.initialize();
    } else {
      console.warn('LongTermFuelTrimTab not found');
    }
  },

  render(analysisData) {
    // Note: analysisData parameter is ignored since we need to get both analyses separately
    // Render Short Term Fuel Trim section
    if (this.shortTermTab) {
      const shortTermData = tabManager ? tabManager.getCachedAnalysis('fueltrim') : null;
      this.shortTermTab.render(shortTermData);
    }

    // Render Long Term Fuel Trim section
    if (this.longTermTab) {
      const longTermData = tabManager ? tabManager.getCachedAnalysis('longtermfueltrim') : null;
      this.longTermTab.render(longTermData);
    }
  }
};

