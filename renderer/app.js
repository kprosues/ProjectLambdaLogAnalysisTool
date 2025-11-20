// Analysis modules are loaded via script tags in index.html
let dataProcessor = null;
let knockDetector = null;
let charts = {};
let currentSort = { column: null, direction: 'asc' };
let chartOriginalRanges = {}; // Store original min/max for each chart

// DOM Elements
const openFileBtn = document.getElementById('openFileBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const dropZone = document.getElementById('dropZone');
const contentArea = document.getElementById('contentArea');
const loadingIndicator = document.getElementById('loadingIndicator');
const progressSection = document.getElementById('progressSection');
const loadingText = document.getElementById('loadingText');
const progressBar = document.getElementById('progressBar');
const loadingStatus = document.getElementById('loadingStatus');
const fileName = document.getElementById('fileName');

// Statistics elements
const totalKnockEvents = document.getElementById('totalKnockEvents');
const maxKnockRetard = document.getElementById('maxKnockRetard');
const timeWithKnock = document.getElementById('timeWithKnock');
const severeEvents = document.getElementById('severeEvents');

// Table elements
const anomalyTableBody = document.getElementById('anomalyTableBody');
const searchInput = document.getElementById('searchInput');
const severityFilter = document.getElementById('severityFilter');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Ensure all DOM elements are available
  if (!openFileBtn) {
    console.error('Open file button not found');
    return;
  }
  
  setupEventListeners();
});

function setupEventListeners() {
  // Open file button
  if (openFileBtn) {
    openFileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleOpenFile();
    });
  } else {
    console.error('Open file button not found during setup');
  }
  
  // Reset zoom button - attach listener when button is available
  // The button exists in DOM but is hidden initially
  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Reset zoom button clicked');
      resetChartZoom();
    });
  } else {
    console.warn('Reset zoom button not found during setup');
  }
  
  // Drag and drop
  if (dropZone) {
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', (e) => {
      e.preventDefault();
      handleOpenFile();
    });
  }
  
  // Table sorting
  document.querySelectorAll('#anomalyTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });
  
  // Search and filter
  searchInput.addEventListener('input', updateTable);
  severityFilter.addEventListener('change', updateTable);
}

async function handleOpenFile() {
  console.log('handleOpenFile called');
  
  if (!window.electronAPI) {
    alert('Electron API not available. Please run this application in Electron.');
    return;
  }

  try {
    const result = await window.electronAPI.openFileDialog();
    console.log('File dialog result:', result);
    
    if (result && result.success) {
      await processFile(result.content, result.path);
    } else if (result && !result.canceled) {
      alert(`Error opening file: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in handleOpenFile:', error);
    alert(`Error opening file: ${error.message}`);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].name.endsWith('.csv')) {
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      await processFile(event.target.result, file.name);
    };
    
    reader.readAsText(file);
  } else {
    alert('Please drop a CSV file.');
  }
}

async function processFile(content, filePath) {
  try {
    console.log('processFile started');
    
    // Show progress bar immediately (part of page, not modal)
    if (progressSection) {
      progressSection.style.display = 'block';
    }
    updateProgress(0, 'Starting...');
    
    // Show loading modal only briefly for initial feedback
    showLoading(true);
    // Hide modal quickly, keep progress bar visible
    setTimeout(() => {
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
    }, 100);
    
    // Step 1: Parse CSV (40% of progress)
    console.log('Starting CSV parse...');
    updateProgress(10, 'Parsing CSV file...');
    dataProcessor = new DataProcessor();
    
    // Create progress callback that safely handles errors
    const progressCallback = (progress) => {
      try {
        // PapaParse progress is 0-100, map to 10-40% of total
        const mappedProgress = 10 + (progress * 0.3);
        console.log('CSV parse progress:', progress, '->', mappedProgress);
        updateProgress(mappedProgress, 'Parsing CSV file...');
      } catch (err) {
        console.warn('Progress update error:', err);
      }
    };
    
    console.log('Calling parseCSV...');
    const parseResult = await dataProcessor.parseCSV(content, progressCallback);
    console.log('CSV parse completed:', parseResult);
    
    updateProgress(40, 'CSV parsed successfully');
    
    // Debug: Log column names to console
    console.log('Parsed columns:', dataProcessor.getColumns());
    console.log('Total rows:', parseResult.rowCount);
    
    // Step 2: Detect knock events (30% of progress)
    updateProgress(45, 'Detecting knock events...');
    
    // Check if knock retard column exists
    const columns = dataProcessor.getColumns();
    const hasKnockColumn = columns.some(col => 
      col.toLowerCase().includes('knock') && 
      col.toLowerCase().includes('retard')
    );
    console.log('Knock retard column found:', hasKnockColumn);
    
    // Sample a few rows to check knock retard values
    const sampleData = dataProcessor.getData().slice(0, 10);
    console.log('Sample knock retard values:', 
      sampleData.map(row => row['Knock Retard (°)'] || row['Knock Retard'] || 'N/A')
    );
    
    knockDetector = new KnockDetector(dataProcessor);
    const events = knockDetector.detectKnockEvents();
    
    updateProgress(70, `Found ${events.length} knock events`);
    console.log('Detected knock events:', events.length);
    
    // Step 3: Update UI (10% of progress)
    console.log('Updating UI...');
    updateProgress(75, 'Updating interface...');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    fileName.textContent = filePath.split(/[\\/]/).pop();
    dropZone.style.display = 'none';
    contentArea.style.display = 'block';
    
    // Show reset zoom button
    if (resetZoomBtn) {
      resetZoomBtn.style.display = 'inline-block';
    }
    
    // Step 4: Update statistics (5% of progress)
    console.log('Updating statistics...');
    updateProgress(80, 'Calculating statistics...');
    await new Promise(resolve => setTimeout(resolve, 10));
    updateStatistics();
    
    // Step 5: Render charts (10% of progress)
    console.log('Rendering charts...');
    updateProgress(85, 'Rendering charts...');
    await new Promise(resolve => setTimeout(resolve, 10));
    renderCharts();
    
    // Step 6: Update table (5% of progress)
    console.log('Updating table...');
    updateProgress(95, 'Updating anomaly table...');
    await new Promise(resolve => setTimeout(resolve, 10));
    updateTable();
    
    // Complete
    console.log('File processing complete!');
    updateProgress(100, 'Complete!');
    
    // Hide progress bar after a brief delay to show 100%
    setTimeout(() => {
      if (progressSection) {
        progressSection.style.display = 'none';
      }
      showLoading(false);
    }, 500);
    
  } catch (error) {
    console.error('Error processing file:', error);
    alert(`Error processing file: ${error.message}`);
    showLoading(false);
  }
}

function updateStatistics() {
  const stats = knockDetector.getStatistics();
  
  totalKnockEvents.textContent = stats.totalEvents.toLocaleString();
  // Display absolute value since knock retard is negative
  maxKnockRetard.textContent = Math.abs(stats.maxKnockRetard).toFixed(2) + '°';
  timeWithKnock.textContent = stats.timeWithKnock.toFixed(2) + '%';
  severeEvents.textContent = stats.severeEvents;
}

function renderCharts() {
  const data = dataProcessor.getData();
  const events = knockDetector.getKnockEvents();
  
  if (!data || data.length === 0) return;
  
  // Prepare data
  const times = data.map(row => row['Time (s)']);
  const knockRetards = data.map(row => {
    const val = row['Knock Retard (°)'] || 0;
    // Convert to absolute value for display (knock retard is negative)
    return val < 0 ? Math.abs(val) : 0;
  });
  const rpms = data.map(row => row['Engine Speed (rpm)'] || 0);
  const throttles = data.map(row => row['Throttle Position (%)'] || 0);
  const afrs = data.map(row => row['Air/Fuel Sensor #1 (λ)'] || 0);
  
  // Create knock event point arrays (aligned with time indices)
  const createKnockPointArray = (events, dataArray, valueExtractor) => {
    const pointArray = new Array(times.length).fill(NaN);
    events.forEach(event => {
      // Find closest time index
      let closestIdx = 0;
      let minDiff = Math.abs(times[0] - event.time);
      for (let i = 1; i < times.length; i++) {
        const diff = Math.abs(times[i] - event.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      // Use absolute value for knock retard display
      const value = valueExtractor(event);
      pointArray[closestIdx] = typeof value === 'number' && value < 0 ? Math.abs(value) : value;
    });
    return pointArray;
  };
  
  const knockRpmPoints = createKnockPointArray(events, rpms, e => e.rpm);
  const knockThrottlePoints = createKnockPointArray(events, throttles, e => e.throttle);
  const knockAfrPoints = createKnockPointArray(events, afrs, e => e.afr);
  
  // Separate events by severity for knock chart
  const severeEvents = events.filter(e => e.severity === 'severe');
  const mildEvents = events.filter(e => e.severity === 'mild');
  
  const createSeverityPointArray = (eventList) => {
    const pointArray = new Array(times.length).fill(NaN);
    eventList.forEach(event => {
      let closestIdx = 0;
      let minDiff = Math.abs(times[0] - event.time);
      for (let i = 1; i < times.length; i++) {
        const diff = Math.abs(times[i] - event.time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      // Use absolute value for display (knock retard is negative)
      pointArray[closestIdx] = Math.abs(event.knockRetard);
    });
    return pointArray;
  };
  
  const severeKnockPoints = createSeverityPointArray(severeEvents);
  const mildKnockPoints = createSeverityPointArray(mildEvents);
  
  // Chart configuration with zoom
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        mode: 'index',
        intersect: false
      },
      zoom: {
        zoom: {
          wheel: {
            enabled: true,
            modifierKey: 'ctrl'
          },
          pinch: {
            enabled: true
          },
          drag: {
            enabled: true,
            modifierKey: null, // No modifier key needed - just click and drag
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            borderColor: 'rgba(0, 0, 0, 0.3)',
            borderWidth: 1
          },
          mode: 'x',
          onZoomComplete: (ctx) => {
            // Synchronize zoom across all charts
            synchronizeChartZoom(ctx.chart);
          }
        },
        pan: {
          enabled: true,
          mode: 'x',
          modifierKey: 'shift',
          onPanComplete: (ctx) => {
            // Synchronize pan across all charts
            synchronizeChartZoom(ctx.chart);
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time (s)'
        },
        type: 'linear'
      }
    },
    interaction: {
      mode: 'index',
      intersect: false
    }
  };
  
  // Knock Retard Chart
  if (charts.knock) charts.knock.destroy();
  
  const knockDatasets = [{
    label: 'Knock Retard (°)',
    data: knockRetards,
    borderColor: 'rgb(220, 53, 69)',
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4
  }];
  
  // Add severity-specific point datasets
  if (severeEvents.length > 0) {
    knockDatasets.push({
      label: 'Severe Knock',
      data: severeKnockPoints,
      borderColor: 'rgb(220, 53, 69)',
      backgroundColor: 'rgba(220, 53, 69, 0.8)',
      borderWidth: 0,
      pointRadius: 6,
      pointHoverRadius: 8,
      showLine: false,
      spanGaps: false
    });
  }
  
  if (mildEvents.length > 0) {
    knockDatasets.push({
      label: 'Mild Knock',
      data: mildKnockPoints,
      borderColor: 'rgb(255, 193, 7)',
      backgroundColor: 'rgba(255, 193, 7, 0.8)',
      borderWidth: 0,
      pointRadius: 4,
      pointHoverRadius: 6,
      showLine: false,
      spanGaps: false
    });
  }
  
  charts.knock = new Chart(document.getElementById('knockChart'), {
    type: 'line',
    data: {
      labels: times,
      datasets: knockDatasets
    },
    options: chartOptions
  });
  
  // Store original range for synchronization
  if (times.length > 0) {
    chartOriginalRanges.knock = {
      min: parseFloat(times[0]),
      max: parseFloat(times[times.length - 1])
    };
  }
  
  // RPM vs Knock Chart
  if (charts.rpm) charts.rpm.destroy();
  charts.rpm = new Chart(document.getElementById('rpmChart'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        {
          label: 'Engine Speed (RPM)',
          data: rpms,
          borderColor: 'rgb(40, 167, 69)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: 'Knock Events',
          data: knockRpmPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.5)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false
        }
      ]
    },
    options: chartOptions
  });
  
  // Store original range
  if (times.length > 0) {
    chartOriginalRanges.rpm = {
      min: parseFloat(times[0]),
      max: parseFloat(times[times.length - 1])
    };
  }
  
  // Throttle vs Knock Chart
  if (charts.throttle) charts.throttle.destroy();
  charts.throttle = new Chart(document.getElementById('throttleChart'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        {
          label: 'Throttle Position (%)',
          data: throttles,
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: 'Knock Events',
          data: knockThrottlePoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.6)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false
        }
      ]
    },
    options: chartOptions
  });
  
  // Store original range
  if (times.length > 0) {
    chartOriginalRanges.throttle = {
      min: parseFloat(times[0]),
      max: parseFloat(times[times.length - 1])
    };
  }
  
  // AFR vs Knock Chart
  if (charts.afr) charts.afr.destroy();
  charts.afr = new Chart(document.getElementById('afrChart'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        {
          label: 'Air/Fuel Ratio (λ)',
          data: afrs,
          borderColor: 'rgb(255, 193, 7)',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: 'Knock Events',
          data: knockAfrPoints,
          borderColor: 'rgb(220, 53, 69)',
          backgroundColor: 'rgba(220, 53, 69, 0.6)',
          borderWidth: 0,
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          spanGaps: false
        }
      ]
    },
    options: chartOptions
  });
  
  // Store original range
  if (times.length > 0) {
    chartOriginalRanges.afr = {
      min: parseFloat(times[0]),
      max: parseFloat(times[times.length - 1])
    };
  }
}

function updateTable() {
  if (!knockDetector) return;
  
  const searchTerm = searchInput.value;
  const severity = severityFilter.value;
  const filteredEvents = knockDetector.filterEvents(searchTerm, severity);
  
  // Sort if needed
  let sortedEvents = [...filteredEvents];
  if (currentSort.column) {
    sortedEvents.sort((a, b) => {
      let aVal = a[currentSort.column];
      let bVal = b[currentSort.column];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (currentSort.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }
  
  // Clear table
  anomalyTableBody.innerHTML = '';
  
  // Populate table
  sortedEvents.forEach(event => {
    const row = document.createElement('tr');
    // Show duration if this is a grouped event
    const timeDisplay = event.duration !== undefined 
      ? `${event.time.toFixed(3)} (${(event.duration * 1000).toFixed(0)}ms)`
      : event.time.toFixed(3);
    
    row.innerHTML = `
      <td>${timeDisplay}</td>
      <td>${Math.abs(event.knockRetard).toFixed(2)}</td>
      <td>${Math.round(event.rpm)}</td>
      <td>${event.throttle.toFixed(1)}</td>
      <td>${event.load.toFixed(2)}</td>
      <td>${event.afr.toFixed(3)}</td>
      <td><span class="severity-badge severity-${event.severity}">${event.severity}</span></td>
    `;
    anomalyTableBody.appendChild(row);
  });
}

function handleSort(column) {
  // Map column names
  const columnMap = {
    'time': 'time',
    'knockRetard': 'knockRetard',
    'rpm': 'rpm',
    'throttle': 'throttle',
    'load': 'load',
    'afr': 'afr',
    'severity': 'severity'
  };
  
  const mappedColumn = columnMap[column];
  if (!mappedColumn) return;
  
  // Toggle sort direction
  if (currentSort.column === mappedColumn) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = mappedColumn;
    currentSort.direction = 'asc';
  }
  
  // Update header indicators
  document.querySelectorAll('#anomalyTable th').forEach(th => {
    th.textContent = th.textContent.replace(' ↑', '').replace(' ↓', '');
    if (th.dataset.sort === column) {
      th.textContent += currentSort.direction === 'asc' ? ' ↑' : ' ↓';
    }
  });
  
  updateTable();
}

function showLoading(show) {
  // Show/hide the modal spinner (for initial loading state)
  if (loadingIndicator) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
  }
  
  // Show/hide the progress bar section (part of the page)
  if (progressSection) {
    progressSection.style.display = show ? 'block' : 'none';
  }
  
  if (show) {
    updateProgress(0, 'Starting...');
  } else {
    // Reset progress when hiding
    updateProgress(0, '');
  }
}

function updateProgress(percent, text) {
  try {
    const clampedPercent = Math.min(100, Math.max(0, percent));
    
    // Use requestAnimationFrame to ensure UI updates are visible
    requestAnimationFrame(() => {
      if (progressBar) {
        progressBar.style.width = `${clampedPercent}%`;
      } else {
        console.warn('progressBar element not found');
      }
      
      if (loadingStatus) {
        loadingStatus.textContent = `${Math.round(clampedPercent)}%`;
      } else {
        console.warn('loadingStatus element not found');
      }
      
      if (loadingText && text) {
        loadingText.textContent = text;
      } else if (text) {
        console.warn('loadingText element not found');
      }
    });
  } catch (error) {
    console.error('Error updating progress:', error);
  }
}

function resetChartZoom() {
  console.log('resetChartZoom called');
  
  // Check if charts exist
  if (!charts || Object.keys(charts).length === 0) {
    console.warn('No charts available to reset');
    return;
  }
  
  // Reset all charts to show full data range
  Object.keys(charts).forEach(key => {
    const chart = charts[key];
    if (!chart) {
      console.warn(`Chart ${key} is null`);
      return;
    }
    
    const originalRange = chartOriginalRanges[key];
    if (!originalRange) {
      console.warn(`No original range for ${key}`);
      return;
    }
    
    // Always use manual reset to ensure consistent behavior
    // The zoom plugin's resetZoom() can have state issues after first use
    resetChartManually(chart, originalRange);
  });
}

function resetChartManually(chart, originalRange) {
  // Manual reset: properly clear zoom plugin state and restore original range
  if (!chart.options?.scales?.x) {
    return;
  }
  
  // Clear any zoom plugin internal state by resetting the zoom limits
  if (chart.options.plugins?.zoom?.limits?.x) {
    chart.options.plugins.zoom.limits.x.min = originalRange.min;
    chart.options.plugins.zoom.limits.x.max = originalRange.max;
  }
  
  // Delete min/max from scale options to clear current zoom
  delete chart.options.scales.x.min;
  delete chart.options.scales.x.max;
  
  // Also clear from the scale object itself if it exists
  if (chart.scales?.x) {
    // Force the scale to recalculate by clearing its cached min/max
    if (chart.scales.x.options) {
      delete chart.scales.x.options.min;
      delete chart.scales.x.options.max;
    }
  }
  
  // Update chart to clear zoom state
  chart.update('none');
  
  // Now set to original range
  chart.options.scales.x.min = originalRange.min;
  chart.options.scales.x.max = originalRange.max;
  
  // Update again with new range
  chart.update('none');
  
  // Verify the reset worked
  setTimeout(() => {
    const scale = chart.scales?.x;
    if (scale && (scale.min !== originalRange.min || scale.max !== originalRange.max)) {
      // Force reset again if it didn't work
      scale.min = originalRange.min;
      scale.max = originalRange.max;
      if (chart.options?.scales?.x) {
        chart.options.scales.x.min = originalRange.min;
        chart.options.scales.x.max = originalRange.max;
      }
      chart.update('none');
    }
  }, 50);
}

function synchronizeChartZoom(sourceChart) {
  // Prevent infinite loop by checking if we're already synchronizing
  if (sourceChart._syncing) {
    return;
  }
  
  // Get the X-axis scale from the source chart
  const sourceScale = sourceChart.scales.x;
  if (!sourceScale) {
    return;
  }
  
  // Get the min and max values from the source chart's X-axis
  const min = sourceScale.min;
  const max = sourceScale.max;
  
  // Find which chart this is
  let sourceChartKey = null;
  Object.keys(charts).forEach(key => {
    if (charts[key] === sourceChart) {
      sourceChartKey = key;
    }
  });
  
  if (!sourceChartKey || !chartOriginalRanges[sourceChartKey]) {
    return;
  }
  
  const originalMin = chartOriginalRanges[sourceChartKey].min;
  const originalMax = chartOriginalRanges[sourceChartKey].max;
  const originalRange = originalMax - originalMin;
  const currentRange = max - min;
  
  // Check if we're at full zoom (within 1% tolerance)
  const isFullZoom = Math.abs(currentRange - originalRange) / originalRange < 0.01;
  
  // Apply the same zoom to all other charts
  Object.keys(charts).forEach(key => {
    if (charts[key] && charts[key] !== sourceChart) {
      const targetChart = charts[key];
      targetChart._syncing = true; // Prevent recursive sync
      
      if (isFullZoom) {
        // Reset zoom on all charts using manual reset
        const targetOriginal = chartOriginalRanges[key];
        if (targetOriginal) {
          resetChartManually(targetChart, targetOriginal);
        }
      } else {
        // Calculate the relative position in the original range
        const sourceRelativeMin = (min - originalMin) / originalRange;
        const sourceRelativeMax = (max - originalMin) / originalRange;
        
        // Apply same relative zoom to target chart
        const targetOriginal = chartOriginalRanges[key];
        if (targetOriginal) {
          const targetMin = targetOriginal.min + (sourceRelativeMin * (targetOriginal.max - targetOriginal.min));
          const targetMax = targetOriginal.min + (sourceRelativeMax * (targetOriginal.max - targetOriginal.min));
          
          targetChart.options.scales.x.min = targetMin;
          targetChart.options.scales.x.max = targetMax;
          targetChart.update('none');
        }
      }
      
      targetChart._syncing = false;
    }
  });
  
  sourceChart._syncing = false;
}

