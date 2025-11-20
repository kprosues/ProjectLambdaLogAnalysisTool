// KnockDetector class for detecting and analyzing knock events
class KnockDetector {
  constructor(dataProcessor) {
    this.dataProcessor = dataProcessor;
    this.knockEvents = [];
    this.severityThresholds = {
      severe: -4.0  // Less than -4° is severe, -4° or more (less negative) is mild
    };
    this.groupingTimeWindow = 0.1; // Group events within 0.1 seconds (100ms)
  }

  detectKnockEvents() {
    const data = this.dataProcessor.getData();
    if (!data || data.length === 0) {
      return [];
    }

    this.knockEvents = [];

    // Try to find the knock retard column with flexible matching
    const columns = this.dataProcessor.getColumns();
    let knockColumnName = 'Knock Retard (°)';
    
    // Try to find the column (handle potential encoding issues)
    if (!columns.includes(knockColumnName)) {
      // Try alternative column names
      const alternatives = [
        'Knock Retard (°)',
        'Knock Retard (deg)',
        'Knock Retard',
        'Knock Retard (degrees)'
      ];
      
      for (const alt of alternatives) {
        if (columns.includes(alt)) {
          knockColumnName = alt;
          break;
        }
      }
      
      // If still not found, try case-insensitive search
      if (!columns.includes(knockColumnName)) {
        const found = columns.find(col => 
          col.toLowerCase().includes('knock') && 
          col.toLowerCase().includes('retard')
        );
        if (found) {
          knockColumnName = found;
        }
      }
    }

    // Debug: Check first row for knock retard value and sample some rows
    if (data.length > 0) {
      const firstRow = data[0];
      console.log('First row knock retard value:', firstRow[knockColumnName], 'Type:', typeof firstRow[knockColumnName], 'Column name:', knockColumnName);
      console.log('Available keys in first row:', Object.keys(firstRow));
      
      // Sample some random rows to check knock values
      const sampleIndices = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1];
      console.log('Sample knock retard values at various indices:');
      sampleIndices.forEach(idx => {
        if (data[idx]) {
          const val = data[idx][knockColumnName];
          console.log(`  Index ${idx}: ${val} (type: ${typeof val}, parsed: ${parseFloat(val)})`);
        }
      });
    }
    
    // Count total non-zero values for debugging
    let nonZeroCount = 0;
    
    data.forEach((row, index) => {
      // Try multiple ways to access the knock retard value
      let knockRetard = row[knockColumnName];
      
      // If not found, try direct property access with various column name formats
      if (knockRetard === undefined || knockRetard === null || isNaN(knockRetard)) {
        // Try all possible column name variations
        const possibleNames = [
          'Knock Retard (°)',
          'Knock Retard (deg)',
          'Knock Retard',
          'Knock Retard (degrees)',
          'KnockRetard',
          'knock retard (°)',
          'knock retard'
        ];
        
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null) {
            knockRetard = row[name];
            break;
          }
        }
      }
      
      // Ensure it's a number - handle string values that might be "0.0" or similar
      if (typeof knockRetard === 'string') {
        knockRetard = knockRetard.trim();
      }
      knockRetard = parseFloat(knockRetard);
      if (isNaN(knockRetard)) {
        knockRetard = 0;
      }
      
      // Check for knock events - knock retard values are NEGATIVE (timing removed)
      // Use a small threshold to catch negative values that represent knock
      const KNOCK_THRESHOLD = -0.0001; // Negative threshold to catch any negative value
      
      // Debug: Log first few non-zero values
      if (knockRetard < KNOCK_THRESHOLD && this.knockEvents.length < 10) {
        console.log(`Knock event found at index ${index}:`, {
          time: row['Time (s)'],
          knockRetard: knockRetard,
          columnUsed: knockColumnName,
          rawValue: row[knockColumnName]
        });
      }
      
      // Knock events are indicated by negative knock retard values
      if (knockRetard < KNOCK_THRESHOLD) {
        const event = {
          index: index,
          time: row['Time (s)'],
          knockRetard: knockRetard,
          rpm: row['Engine Speed (rpm)'] || 0,
          throttle: row['Throttle Position (%)'] || 0,
          load: row['Load (MAF) (g/rev)'] || 0,
          afr: row['Air/Fuel Sensor #1 (λ)'] || 0,
          boost: row['Manifold Absolute Pressure (kPa)'] || 0,
          coolantTemp: row['Coolant Temperature (°C)'] || 0,
          intakeTemp: row['Intake Air Temperature (°C)'] || 0,
          severity: this.categorizeSeverity(knockRetard)
        };
        
        this.knockEvents.push(event);
        nonZeroCount++;
      }
    });
    
    console.log(`Total rows processed: ${data.length}`);
    console.log(`Raw knock events detected (before grouping): ${this.knockEvents.length}`);
    console.log(`Total non-zero knock retard values: ${nonZeroCount}`);
    
    // Group nearby knock events
    this.knockEvents = this.groupKnockEvents(this.knockEvents);
    
    console.log(`Grouped knock events: ${this.knockEvents.length}`);

    return this.knockEvents;
  }

  categorizeSeverity(knockRetard) {
    // Knock retard is negative
    // -4° or more (less negative, e.g., -4, -3, -2) = mild
    // Less than -4° (more negative, e.g., -5, -6, -7) = severe
    if (knockRetard < this.severityThresholds.severe) {
      return 'severe';
    } else {
      return 'mild';
    }
  }

  getStatistics() {
    if (this.knockEvents.length === 0) {
      return {
        totalEvents: 0,
        maxKnockRetard: 0,
        timeWithKnock: 0,
        severeEvents: 0,
        mildEvents: 0,
        avgKnockRetard: 0,
        rpmRange: { min: 0, max: 0 },
        timeRange: { min: 0, max: 0 }
      };
    }

    const knockRetards = this.knockEvents.map(e => e.knockRetard);
    const rpms = this.knockEvents.map(e => e.rpm);
    const times = this.knockEvents.map(e => e.time);
    
    const timeRange = this.dataProcessor.getTimeRange();
    const totalTime = timeRange.max - timeRange.min;
    const knockTime = Math.max(...times) - Math.min(...times);
    const timeWithKnockPercent = totalTime > 0 ? (knockTime / totalTime) * 100 : 0;

    // For max knock retard, we want the most negative value (most severe)
    // But display as positive for clarity
    const maxKnockRetardAbs = Math.max(...knockRetards.map(k => Math.abs(k)));
    const maxKnockRetard = Math.min(...knockRetards); // Most negative
    
    return {
      totalEvents: this.knockEvents.length,
      maxKnockRetard: maxKnockRetard, // Keep as negative for display
      maxKnockRetardAbs: maxKnockRetardAbs, // Absolute value for reference
      timeWithKnock: timeWithKnockPercent,
      severeEvents: this.knockEvents.filter(e => e.severity === 'severe').length,
      mildEvents: this.knockEvents.filter(e => e.severity === 'mild').length,
      avgKnockRetard: knockRetards.reduce((a, b) => a + b, 0) / knockRetards.length,
      rpmRange: {
        min: Math.min(...rpms),
        max: Math.max(...rpms)
      },
      timeRange: {
        min: Math.min(...times),
        max: Math.max(...times)
      }
    };
  }

  getKnockEvents() {
    return this.knockEvents;
  }

  groupKnockEvents(events) {
    if (events.length === 0) {
      return [];
    }

    // Sort events by time
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const groupedEvents = [];
    let currentGroup = [sortedEvents[0]];

    for (let i = 1; i < sortedEvents.length; i++) {
      const currentEvent = sortedEvents[i];
      const lastEventInGroup = currentGroup[currentGroup.length - 1];
      const timeDiff = currentEvent.time - lastEventInGroup.time;

      // If within the time window, add to current group
      if (timeDiff <= this.groupingTimeWindow) {
        currentGroup.push(currentEvent);
      } else {
        // Time gap is too large, finalize current group and start new one
        groupedEvents.push(this.createGroupedEvent(currentGroup));
        currentGroup = [currentEvent];
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      groupedEvents.push(this.createGroupedEvent(currentGroup));
    }

    return groupedEvents;
  }

  createGroupedEvent(eventGroup) {
    // Find the most severe knock (most negative value)
    const mostSevereEvent = eventGroup.reduce((prev, current) => {
      return current.knockRetard < prev.knockRetard ? current : prev;
    });

    // Calculate averages for other metrics
    const avgRpm = eventGroup.reduce((sum, e) => sum + e.rpm, 0) / eventGroup.length;
    const avgThrottle = eventGroup.reduce((sum, e) => sum + e.throttle, 0) / eventGroup.length;
    const avgLoad = eventGroup.reduce((sum, e) => sum + e.load, 0) / eventGroup.length;
    const avgAfr = eventGroup.reduce((sum, e) => sum + e.afr, 0) / eventGroup.length;
    const avgBoost = eventGroup.reduce((sum, e) => sum + e.boost, 0) / eventGroup.length;
    const avgCoolantTemp = eventGroup.reduce((sum, e) => sum + e.coolantTemp, 0) / eventGroup.length;
    const avgIntakeTemp = eventGroup.reduce((sum, e) => sum + e.intakeTemp, 0) / eventGroup.length;

    // Use the start time of the group
    const startTime = eventGroup[0].time;
    const endTime = eventGroup[eventGroup.length - 1].time;
    const duration = endTime - startTime;

    return {
      index: mostSevereEvent.index,
      time: startTime, // Start time of the knock event
      endTime: endTime, // End time of the knock event
      duration: duration, // Duration of the knock event
      knockRetard: mostSevereEvent.knockRetard, // Most severe knock retard value
      maxKnockRetard: Math.min(...eventGroup.map(e => e.knockRetard)), // Most negative (most severe)
      avgKnockRetard: eventGroup.reduce((sum, e) => sum + e.knockRetard, 0) / eventGroup.length,
      rpm: Math.round(avgRpm),
      throttle: avgThrottle,
      load: avgLoad,
      afr: avgAfr,
      boost: avgBoost,
      coolantTemp: avgCoolantTemp,
      intakeTemp: avgIntakeTemp,
      severity: this.categorizeSeverity(mostSevereEvent.knockRetard),
      eventCount: eventGroup.length // Number of data points in this grouped event
    };
  }

  getEventsBySeverity(severity) {
    if (severity === 'all') {
      return this.knockEvents;
    }
    return this.knockEvents.filter(e => e.severity === severity);
  }

  filterEvents(searchTerm, severityFilter) {
    let filtered = this.knockEvents;

    // Apply severity filter
    if (severityFilter && severityFilter !== 'all') {
      filtered = filtered.filter(e => e.severity === severityFilter);
    }

    // Apply search filter
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => {
        return (
          e.time.toString().includes(term) ||
          e.knockRetard.toString().includes(term) ||
          e.rpm.toString().includes(term) ||
          e.throttle.toString().includes(term) ||
          e.severity.toLowerCase().includes(term)
        );
      });
    }

    return filtered;
  }
}

