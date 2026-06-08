(function attachConcentrationCalculations(global) {
  'use strict';

  const MOLAR_UNITS = {
    M: 1,
    mM: 1e-3,
    uM: 1e-6,
    nM: 1e-9,
  };

  const MASS_CONCENTRATION_UNITS = {
    'g/L': 1,
    'mg/mL': 1,
    'ug/mL': 0.001,
    ppm: 0.001,
  };

  const VOLUME_UNITS_TO_LITERS = {
    L: 1,
    mL: 0.001,
    uL: 0.000001,
  };

  const VOLUME_UNITS_TO_ML = {
    L: 1000,
    mL: 1,
    uL: 0.001,
  };

  const MASS_UNITS_TO_G = {
    kg: 1000,
    g: 1,
    mg: 0.001,
  };

  const REAGENT_PRESETS = [
    { name: 'NaCl', label: 'NaCl', molecularWeight: 58.44 },
    { name: 'KCl', label: 'KCl', molecularWeight: 74.55 },
    { name: 'Glucose', label: 'Glucose', molecularWeight: 180.16 },
    { name: 'Sucrose', label: 'Sucrose', molecularWeight: 342.3 },
    { name: 'Tris base', label: 'Tris base', molecularWeight: 121.14 },
    { name: 'Glycine', label: 'Glycine', molecularWeight: 75.07 },
    { name: 'SDS', label: 'SDS', molecularWeight: 288.38 },
    { name: 'EDTA disodium', label: 'EDTA disodium', molecularWeight: 372.24 },
    { name: 'MgCl2 anhydrous', label: 'MgCl2 anhydrous', molecularWeight: 95.21 },
    { name: 'CaCl2 anhydrous', label: 'CaCl2 anhydrous', molecularWeight: 110.98 },
  ];

  const allConcentrationUnits = [
    ...Object.keys(MOLAR_UNITS),
    ...Object.keys(MASS_CONCENTRATION_UNITS),
  ];

  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isMolarUnit = (unit) => hasOwn(MOLAR_UNITS, unit);
  const isMassConcentrationUnit = (unit) =>
    hasOwn(MASS_CONCENTRATION_UNITS, unit);

  const ensureFiniteNumber = (value, label) => {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`${label}を数値で入力してください。`);
    }
    return numberValue;
  };

  const ensurePositive = (value, label) => {
    const numberValue = ensureFiniteNumber(value, label);
    if (numberValue <= 0) {
      throw new Error(`${label}を0より大きい値で入力してください。`);
    }
    return numberValue;
  };

  const ensureNonNegative = (value, label) => {
    const numberValue = ensureFiniteNumber(value, label);
    if (numberValue < 0) {
      throw new Error(`${label}は0以上で入力してください。`);
    }
    return numberValue;
  };

  const ensureUnit = (unit, allowedUnits, label) => {
    if (!allowedUnits.includes(unit)) {
      throw new Error(`${label}の単位を選択してください。`);
    }
    return unit;
  };

  const tidyDisplayNumber = (value) => Number(Number(value).toPrecision(12));

  const formatProcessLine = ({ formula, substitution, result }) =>
    `${formula}: ${substitution} = ${result}`;

  const requireMolecularWeight = (molecularWeight) =>
    ensurePositive(molecularWeight, '分子量');

  const toLiters = (value, unit) => {
    const volume = ensurePositive(value, '体積');
    ensureUnit(unit, Object.keys(VOLUME_UNITS_TO_LITERS), '体積');
    return volume * VOLUME_UNITS_TO_LITERS[unit];
  };

  const toMilliliters = (value, unit) => {
    const volume = ensurePositive(value, '体積');
    ensureUnit(unit, Object.keys(VOLUME_UNITS_TO_ML), '体積');
    return volume * VOLUME_UNITS_TO_ML[unit];
  };

  const toGrams = (value, unit) => {
    const mass = ensurePositive(value, '質量');
    ensureUnit(unit, Object.keys(MASS_UNITS_TO_G), '質量');
    return mass * MASS_UNITS_TO_G[unit];
  };

  const concentrationToMolar = ({ value, unit, molecularWeight }) => {
    const concentration = ensureNonNegative(value, '濃度');
    ensureUnit(unit, allConcentrationUnits, '濃度');

    if (isMolarUnit(unit)) {
      return concentration * MOLAR_UNITS[unit];
    }

    const mw = requireMolecularWeight(molecularWeight);
    const gramsPerLiter = concentration * MASS_CONCENTRATION_UNITS[unit];
    return gramsPerLiter / mw;
  };

  const molarToConcentration = ({ molar, unit, molecularWeight }) => {
    const molarValue = ensureNonNegative(molar, '濃度');
    ensureUnit(unit, allConcentrationUnits, '濃度');

    if (isMolarUnit(unit)) {
      return molarValue / MOLAR_UNITS[unit];
    }

    const mw = requireMolecularWeight(molecularWeight);
    const gramsPerLiter = molarValue * mw;
    return gramsPerLiter / MASS_CONCENTRATION_UNITS[unit];
  };

  const convertConcentration = ({ value, fromUnit, toUnit, molecularWeight }) => {
    const molar = concentrationToMolar({
      value,
      unit: fromUnit,
      molecularWeight,
    });
    const convertedValue = molarToConcentration({
      molar,
      unit: toUnit,
      molecularWeight,
    });

    return {
      value: convertedValue,
      fromUnit,
      toUnit,
      molar,
    };
  };

  const calculateMassForMolarSolution = ({
    concentration,
    concentrationUnit,
    volume,
    volumeUnit,
    molecularWeight,
    purityPercent = 100,
  }) => {
    const molar = concentrationToMolar({
      value: concentration,
      unit: concentrationUnit,
      molecularWeight,
    });
    const volumeL = toLiters(volume, volumeUnit);
    const mw = requireMolecularWeight(molecularWeight);
    const purity = ensurePositive(purityPercent, '純度');
    if (purity > 100) {
      throw new Error('純度は100%以下で入力してください。');
    }

    const moles = molar * volumeL;
    const massG = (moles * mw) / (purity / 100);

    return {
      massG,
      massMg: massG * 1000,
      moles,
      molar,
      volumeL,
    };
  };

  const calculateDilution = ({
    stockConcentration,
    stockUnit,
    targetConcentration,
    targetUnit,
    finalVolume,
    finalVolumeUnit,
    molecularWeight,
  }) => {
    const stockMolar = concentrationToMolar({
      value: stockConcentration,
      unit: stockUnit,
      molecularWeight,
    });
    const targetMolar = concentrationToMolar({
      value: targetConcentration,
      unit: targetUnit,
      molecularWeight,
    });
    const finalVolumeMl = toMilliliters(finalVolume, finalVolumeUnit);

    if (targetMolar <= 0) {
      throw new Error('目標濃度を0より大きい値で入力してください。');
    }
    if (targetMolar >= stockMolar) {
      throw new Error('目標濃度は原液濃度より低くしてください。');
    }

    const stockVolumeMl = (targetMolar * finalVolumeMl) / stockMolar;
    const diluentVolumeMl = finalVolumeMl - stockVolumeMl;

    return {
      stockVolumeMl,
      diluentVolumeMl,
      finalVolumeMl,
      stockMolar,
      targetMolar,
    };
  };

  const calculatePercentSolution = ({
    percent,
    mode,
    finalVolume,
    finalVolumeUnit,
    finalAmount,
    finalAmountUnit,
  }) => {
    const percentValue = ensurePositive(percent, '濃度');

    if (!['wv', 'vv', 'wt'].includes(mode)) {
      throw new Error('濃度の種類を選択してください。');
    }
    if (['vv', 'wt'].includes(mode) && percentValue > 100) {
      throw new Error(`${mode === 'vv' ? 'v/v%' : 'wt%'}は100%以下で入力してください。`);
    }

    if (mode === 'wt') {
      const finalMassG = toGrams(finalAmount, finalAmountUnit);
      const soluteAmount = (percentValue * finalMassG) / 100;
      return {
        soluteAmount,
        soluteUnit: 'g',
        solventAmount: finalMassG - soluteAmount,
        solventUnit: 'g',
        finalAmount: finalMassG,
        finalAmountUnit: 'g',
      };
    }

    const finalVolumeMl = toMilliliters(finalVolume, finalVolumeUnit);
    const soluteAmount = (percentValue * finalVolumeMl) / 100;
    const soluteUnit = mode === 'wv' ? 'g' : 'mL';
    const solventAmount =
      mode === 'vv' ? finalVolumeMl - soluteAmount : finalVolumeMl;

    return {
      soluteAmount,
      soluteUnit,
      solventAmount,
      solventUnit: 'mL',
      finalVolumeMl,
    };
  };

  const calculateMixedConcentration = ({ unit, solutions }) => {
    ensureUnit(unit, allConcentrationUnits, '濃度');
    if (!Array.isArray(solutions) || solutions.length < 2) {
      throw new Error('混合する溶液を2つ以上入力してください。');
    }

    let weightedTotal = 0;
    let totalVolumeMl = 0;
    solutions.forEach((solution, index) => {
      const label = `溶液${index + 1}`;
      const concentration = ensureNonNegative(
        solution.concentration,
        `${label}の濃度`,
      );
      const volumeMl = toMilliliters(solution.volume, solution.volumeUnit);
      weightedTotal += concentration * volumeMl;
      totalVolumeMl += volumeMl;
    });

    if (totalVolumeMl <= 0) {
      throw new Error('総体積を0より大きい値にしてください。');
    }

    return {
      concentration: weightedTotal / totalVolumeMl,
      unit,
      totalVolumeMl,
    };
  };

  const calculateSerialDilution = ({
    initialConcentration,
    unit,
    dilutionFactor,
    steps,
  }) => {
    const initial = ensurePositive(initialConcentration, '初期濃度');
    ensureUnit(unit, allConcentrationUnits, '濃度');
    const factor = ensurePositive(dilutionFactor, '希釈倍率');
    if (factor <= 1) {
      throw new Error('希釈倍率は1より大きい値で入力してください。');
    }

    const stepCount = ensurePositive(steps, '段数');
    if (!Number.isInteger(stepCount)) {
      throw new Error('段数は整数で入力してください。');
    }
    if (stepCount > 20) {
      throw new Error('段数は20段以下で入力してください。');
    }

    const calculatedSteps = [];
    let current = initial;
    for (let index = 1; index <= stepCount; index += 1) {
      current /= factor;
      calculatedSteps.push({
        step: index,
        concentration: current,
        unit,
      });
    }

    return {
      steps: calculatedSteps,
      initialConcentration: initial,
      unit,
      dilutionFactor: factor,
    };
  };

  const normalizeSerialDilutionDisplaySteps = ({ steps, unit }) => {
    ensureUnit(unit, allConcentrationUnits, '濃度');
    if (!Array.isArray(steps) || steps.length === 0) {
      return [];
    }
    if (!isMolarUnit(unit)) {
      return steps.map((step) => ({
        ...step,
        unit,
      }));
    }

    const firstStepMolar = steps[0].concentration * MOLAR_UNITS[unit];
    const candidates = [
      ['M', 1],
      ['mM', 1e-3],
      ['uM', 1e-6],
      ['nM', 1e-9],
    ];
    const [displayUnit, factor] =
      candidates.find(([, unitFactor]) => firstStepMolar / unitFactor >= 1) ??
      candidates[candidates.length - 1];

    return steps.map((step) => ({
      ...step,
      concentration: tidyDisplayNumber(
        (step.concentration * MOLAR_UNITS[unit]) / factor,
      ),
      unit: displayUnit,
    }));
  };

  const api = {
    MOLAR_UNITS,
    MASS_CONCENTRATION_UNITS,
    VOLUME_UNITS_TO_LITERS,
    VOLUME_UNITS_TO_ML,
    MASS_UNITS_TO_G,
    REAGENT_PRESETS,
    allConcentrationUnits,
    isMolarUnit,
    isMassConcentrationUnit,
    requireMolecularWeight,
    toLiters,
    toMilliliters,
    toGrams,
    concentrationToMolar,
    molarToConcentration,
    convertConcentration,
    calculateMassForMolarSolution,
    calculateDilution,
    calculatePercentSolution,
    calculateMixedConcentration,
    calculateSerialDilution,
    normalizeSerialDilutionDisplaySteps,
    formatProcessLine,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.ConcentrationCalculations = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
