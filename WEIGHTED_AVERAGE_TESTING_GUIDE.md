# Weighted Average Autotune - Testing Guide

## Overview

This guide provides test scenarios to verify the weighted average autotune enhancement works correctly. The new feature weights data points based on their proximity to cell centers, providing more accurate fuel base adjustments.

## New Feature: Min Hit Weight Parameter

- **Location**: Fueling tab → Autotune section
- **UI Element**: Slider labeled "Min Hit Weight (Cell Centering)"
- **Range**: 0.00 to 1.00
- **Default**: 0.00
- **Purpose**: Filter data points based on how centered they are within their RPM/Load cells

## How Weighting Works

### Cell Weight Calculation

For each data point at coordinates (rpm, load):

1. **RPM Weight**: Based on distance from RPM cell center
   - Weight = 1.0 at exact cell center
   - Weight = 0.0 at cell boundary
   - Linear interpolation between

2. **Load Weight**: Based on distance from Load cell center
   - Same calculation as RPM

3. **Combined Weight**: `rpm_weight × load_weight`

4. **Filtering**: Points with weight < Min Hit Weight are excluded

### Examples

```
Cell boundaries: RPM [2000, 2500], Load [1.0, 1.5]
Cell center: (2250 rpm, 1.25 g/rev)

Data Point 1: (2250, 1.25) → Weight = 1.0 × 1.0 = 1.00 (center)
Data Point 2: (2400, 1.40) → Weight = 0.6 × 0.6 = 0.36 (off-center)
Data Point 3: (2000, 1.0)  → Weight = 0.0 × 0.0 = 0.00 (corner/edge)

With minHitWeight = 0.5:
- Point 1: Included (1.00 >= 0.5) ✓
- Point 2: Excluded (0.36 < 0.5) ✗
- Point 3: Excluded (0.00 < 0.5) ✗
```

## Test Scenarios

### Test 1: Baseline (Backward Compatibility)

**Objective**: Verify that minHitWeight=0 produces similar results to the previous implementation

**Steps**:
1. Load a tune file (e.g., `Keith Proseus_1999JDMSTI_DW740_VF28_21builtStroker_v8.tune`)
2. Load a datalog file (e.g., `tuner_log_25-11-27_1038_V8.csv`)
3. Set parameters:
   - Min Samples: 150
   - Change Limit: 5%
   - **Min Hit Weight: 0.00**
4. Run analysis
5. Note the number of cells updated and the suggested changes

**Expected Results**:
- Analysis completes successfully
- All data points are included (weighted by their position)
- Filtered samples count should be 0
- Fuel base adjustments should be reasonable

---

### Test 2: Moderate Filtering

**Objective**: Test moderate edge filtering

**Steps**:
1. Use the same tune and log from Test 1
2. Set parameters:
   - Min Samples: 150
   - Change Limit: 5%
   - **Min Hit Weight: 0.25**
3. Run analysis
4. Compare results to Test 1

**Expected Results**:
- Some samples filtered (check status message)
- Fewer cells may qualify for updates
- Adjustments should be slightly different (more centered data)
- Cells with mostly edge data may drop below min samples threshold

---

### Test 3: Aggressive Filtering

**Objective**: Test aggressive edge filtering

**Steps**:
1. Use the same tune and log from Test 1
2. Set parameters:
   - Min Samples: 150
   - Change Limit: 5%
   - **Min Hit Weight: 0.50**
3. Run analysis
4. Compare results to Tests 1 and 2

**Expected Results**:
- Significantly more samples filtered
- Substantially fewer cells updated
- Only cells with well-centered data produce adjustments
- Status message shows high filtered sample count

---

### Test 4: Extreme Filtering

**Objective**: Test near-center-only filtering

**Steps**:
1. Use the same tune and log from Test 1
2. Set parameters:
   - Min Samples: 150
   - Change Limit: 5%
   - **Min Hit Weight: 0.90**
3. Run analysis

**Expected Results**:
- Very high filtered sample count
- Very few or no cells updated (unless data is very centered)
- May show "0 cells updated" if no data is sufficiently centered
- This demonstrates the filtering is working correctly

---

### Test 5: UI Validation

**Objective**: Verify UI elements work correctly

**Steps**:
1. Navigate to Fueling tab → Autotune section
2. Locate the "Min Hit Weight" slider
3. Move the slider and verify:
   - Value display updates in real-time (shows 0.00 to 1.00)
   - Slider moves smoothly
   - Value is bold and properly aligned

**Expected Results**:
- Slider responds to input
- Value display updates immediately
- Format is always two decimal places (e.g., "0.50", not "0.5")

---

### Test 6: Analysis Message Validation

**Objective**: Verify status messages include filtering information

**Steps**:
1. Run analysis with minHitWeight = 0.30
2. Check the status message after completion

**Expected Results**:
- Message format: "Analysis complete. X cells updated. Y samples filtered by min hit weight (0.30)."
- Filtered count should be present when minHitWeight > 0 and samples were filtered
- If no samples filtered, that part of the message should be absent

---

### Test 7: Progressive Filtering Comparison

**Objective**: Observe how adjustments change with increasing filter strength

**Steps**:
1. Run analysis 5 times with same data but different minHitWeight:
   - 0.00, 0.25, 0.50, 0.75, 1.00
2. For each run, record:
   - Total cells updated
   - Samples filtered
   - A few specific cell adjustments (pick 2-3 cells with good data)

**Expected Results**:
- As minHitWeight increases:
  - Filtered samples increase
  - Total cells updated decreases
  - Adjustments for remaining cells may change (more conservative or more accurate)
  - Some cells may disappear from results entirely

---

## Validation Checklist

- [ ] Weight calculation functions added to autotuneEngine.js
- [ ] analyze() accepts and validates minHitWeight parameter (0 to 1)
- [ ] Binning uses weighted sums instead of simple sums
- [ ] Filtered samples are tracked and reported
- [ ] UI slider exists and updates value display
- [ ] Parameter is passed from UI to engine
- [ ] Status message includes filter information when applicable
- [ ] README documentation updated
- [ ] No linter errors in modified files
- [ ] Backward compatibility maintained (minHitWeight=0 works)

## Debugging Tips

### Check Console Output

If issues occur, open the browser DevTools (F12) and check for:
- JavaScript errors
- Warning messages about invalid parameters
- Analysis results object structure

### Verify Weight Calculations

Add temporary console.log statements to see weights:

```javascript
// In autotuneEngine.js, after weight calculation:
console.log(`Data point: rpm=${rpm}, load=${load}, weight=${cellWeight.toFixed(3)}`);
```

### Check Binning

Verify bins are accumulating weighted data:

```javascript
// After creating bins:
console.log('Open bins:', Object.values(openBins).slice(0, 3));
console.log('Closed bins:', Object.values(closedBins).slice(0, 3));
```

## Known Behaviors

1. **Edge Data**: Data points exactly on cell boundaries have weight ≈ 0.0
2. **First/Last Cells**: Edge cells may have different effective ranges
3. **Sparse Data**: High minHitWeight values may result in no updates for some cells
4. **Transients**: Rapid RPM/load changes will naturally have lower weights

## Performance Notes

The weighted averaging adds minimal computational overhead:
- Two additional multiplications per data point
- Negligible impact on analysis time
- No change to memory usage patterns

## Success Criteria

✅ **Implementation is successful if:**
1. Analysis completes without errors at all minHitWeight values (0.0 to 1.0)
2. Increasing minHitWeight results in more filtered samples
3. UI slider is responsive and displays current value
4. Results are sensible and reproducible
5. minHitWeight=0 produces similar results to previous implementation
6. Status messages correctly report filtered sample counts
7. No linter errors or console warnings

---

## Questions or Issues?

If you encounter unexpected behavior:
1. Check the browser console for errors
2. Verify input data quality (log file and tune file)
3. Try with minHitWeight=0 first (baseline)
4. Review the analysis result object in console
5. Check that tune file axes match expected RPM/Load ranges

