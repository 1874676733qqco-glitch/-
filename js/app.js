(function startConcentrationCalculator() {
  'use strict';

  const {
  REAGENT_PRESETS,
  allConcentrationUnits,
  calculateDilution,
  calculateMassForMolarSolution,
  calculateMixedConcentration,
  calculatePercentSolution,
  calculateSerialDilution,
  convertConcentration,
  formatProcessLine,
  normalizeSerialDilutionDisplaySteps,
  } = window.ConcentrationCalculations;

const STORAGE_KEY = 'concentration-calculator-history-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  activeTab: 'molar',
  results: {},
  history: [],
};

const calculators = {
  molar: calculateMolar,
  dilution: calculateDilutionForm,
  percent: calculatePercent,
  conversion: calculateConversion,
  mixing: calculateMixing,
  serial: calculateSerial,
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const numericValue = (id) => $(id).value;
const selectValue = (id) => $(id).value;

const precision = () => Number($('#precision').value);

const formatNumber = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '-';
  }

  const digits = precision();
  const abs = Math.abs(numberValue);
  if (numberValue !== 0 && digits > 0 && abs < 10 ** -digits) {
    return numberValue.toExponential(digits);
  }

  return numberValue.toLocaleString('ja-JP', {
    maximumFractionDigits: digits,
  });
};

const formatWithUnit = (value, unit) => `${formatNumber(value)} ${unit}`;

const renderResult = (
  tab,
  { title, rows, formula, process = [], notes = [], tableHtml = '' },
) => {
  const container = $(`#result-${tab}`);
  const rowHtml = rows
    .map(
      (row) => `
        <div class="result-row ${row.primary ? 'result-main' : ''}">
          <dt>${escapeHtml(row.label)}</dt>
          <dd>${escapeHtml(row.value)}</dd>
        </div>
      `,
    )
    .join('');
  const notesHtml = notes.length
    ? `<div class="result-section"><h4>メモ</h4><ul>${notes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join('')}</ul></div>`
    : '';
  const tableSection = tableHtml
    ? `<div class="result-section">${tableHtml}</div>`
    : '';
  const processHtml = process.length
    ? `<div class="result-section"><h4>計算過程</h4><ol class="process-list">${process
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')}</ol></div>`
    : '';

  container.innerHTML = `
    <h3>${escapeHtml(title)}</h3>
    <dl class="result-grid">${rowHtml}</dl>
    <div class="result-section">
      <h4>使用式</h4>
      <p>${escapeHtml(formula)}</p>
    </div>
    ${processHtml}
    ${tableSection}
    ${notesHtml}
  `;

  const plainText = [
    title,
    ...rows.map((row) => `${row.label}: ${row.value}`),
    `使用式: ${formula}`,
    ...process.map((line) => `計算過程: ${line}`),
    ...notes.map((note) => `メモ: ${note}`),
  ].join('\n');

  state.results[tab] = {
    title,
    summary: rows.find((row) => row.primary)?.value ?? rows[0]?.value ?? '',
    plainText,
  };
  updateCopyButton();
};

const renderError = (tab, error) => {
  $(`#result-${tab}`).innerHTML = `
    <div class="error-message" role="alert">${escapeHtml(error.message)}</div>
  `;
  delete state.results[tab];
  updateCopyButton();
};

const renderEmpty = (tab, message) => {
  $(`#result-${tab}`).innerHTML = `<p class="empty-result">${escapeHtml(message)}</p>`;
  delete state.results[tab];
  updateCopyButton();
};

function calculateMolar({ save = true } = {}) {
  const result = calculateMassForMolarSolution({
    concentration: numericValue('#molar-concentration'),
    concentrationUnit: selectValue('#molar-concentration-unit'),
    volume: numericValue('#molar-volume'),
    volumeUnit: selectValue('#molar-volume-unit'),
    molecularWeight: numericValue('#molar-mw'),
    purityPercent: numericValue('#molar-purity'),
  });

  const rows = [
    { label: '必要質量', value: formatWithUnit(result.massG, 'g'), primary: true },
    { label: 'mg換算', value: formatWithUnit(result.massMg, 'mg') },
    { label: '物質量', value: formatWithUnit(result.moles, 'mol') },
    { label: '最終体積', value: formatWithUnit(result.volumeL, 'L') },
  ];

  renderResult('molar', {
    title: 'モル濃度調製の結果',
    rows,
    formula: '必要質量(g) = 濃度(mol/L) × 体積(L) × 分子量 ÷ (純度/100)',
    process: [
      formatProcessLine({
        formula: '必要質量',
        substitution: `${formatWithUnit(result.molar, 'mol/L')} × ${formatWithUnit(
          result.volumeL,
          'L',
        )} × ${formatWithUnit(numericValue('#molar-mw'), 'g/mol')} ÷ (${formatNumber(
          numericValue('#molar-purity'),
        )} / 100)`,
        result: formatWithUnit(result.massG, 'g'),
      }),
      formatProcessLine({
        formula: '物質量',
        substitution: `${formatWithUnit(result.molar, 'mol/L')} × ${formatWithUnit(
          result.volumeL,
          'L',
        )}`,
        result: formatWithUnit(result.moles, 'mol'),
      }),
    ],
    notes: ['量り取った後、溶媒を加えて最終体積に合わせます。'],
  });

  if (save) addHistory('モル濃度調製', rows[0].value);
}

function calculateDilutionForm({ save = true } = {}) {
  const result = calculateDilution({
    stockConcentration: numericValue('#dilution-stock'),
    stockUnit: selectValue('#dilution-stock-unit'),
    targetConcentration: numericValue('#dilution-target'),
    targetUnit: selectValue('#dilution-target-unit'),
    finalVolume: numericValue('#dilution-volume'),
    finalVolumeUnit: selectValue('#dilution-volume-unit'),
    molecularWeight: numericValue('#dilution-mw'),
  });

  const rows = [
    {
      label: '必要な原液量',
      value: formatWithUnit(result.stockVolumeMl, 'mL'),
      primary: true,
    },
    { label: '加える希釈液量', value: formatWithUnit(result.diluentVolumeMl, 'mL') },
    { label: '最終体積', value: formatWithUnit(result.finalVolumeMl, 'mL') },
  ];

  renderResult('dilution', {
    title: 'C1V1希釈の結果',
    rows,
    formula: 'V1 = C2 × V2 ÷ C1',
    process: [
      formatProcessLine({
        formula: 'V1',
        substitution: `${formatWithUnit(result.targetMolar, 'mol/L')} × ${formatWithUnit(
          result.finalVolumeMl,
          'mL',
        )} ÷ ${formatWithUnit(result.stockMolar, 'mol/L')}`,
        result: formatWithUnit(result.stockVolumeMl, 'mL'),
      }),
      formatProcessLine({
        formula: '希釈液量',
        substitution: `${formatWithUnit(result.finalVolumeMl, 'mL')} - ${formatWithUnit(
          result.stockVolumeMl,
          'mL',
        )}`,
        result: formatWithUnit(result.diluentVolumeMl, 'mL'),
      }),
    ],
    notes: ['原液を先に取り、希釈液を加えて最終体積に合わせます。'],
  });

  if (save) addHistory('C1V1希釈', rows[0].value);
}

function calculatePercent({ save = true } = {}) {
  const mode = selectValue('#percent-mode');
  const amount = numericValue('#percent-amount');
  const amountUnit = selectValue('#percent-amount-unit');
  const result = calculatePercentSolution({
    percent: numericValue('#percent-value'),
    mode,
    finalVolume: amount,
    finalVolumeUnit: amountUnit,
    finalAmount: amount,
    finalAmountUnit: amountUnit,
  });

  const typeLabel =
    mode === 'wv' ? 'w/v%' : mode === 'vv' ? 'v/v%' : 'wt%';
  const rows = [
    {
      label: mode === 'vv' ? '必要な原液量' : '必要な溶質量',
      value: formatWithUnit(result.soluteAmount, result.soluteUnit),
      primary: true,
    },
    {
      label: mode === 'wv' ? '溶媒' : '加える溶媒量',
      value: mode === 'wv'
        ? `${formatWithUnit(result.finalVolumeMl, 'mL')} まで`
        : formatWithUnit(result.solventAmount, result.solventUnit),
    },
  ];

  renderResult('percent', {
    title: `${typeLabel}濃度の結果`,
    rows,
    formula: mode === 'wv'
      ? 'w/v% = g / 100 mL'
      : mode === 'vv'
        ? 'v/v% = mL / 100 mL'
        : 'wt% = 溶質質量(g) ÷ 溶液全体の質量(g) × 100',
    process: [
      mode === 'wv'
        ? formatProcessLine({
            formula: '溶質量',
            substitution: `${formatNumber(numericValue('#percent-value'))} × ${formatWithUnit(
              result.finalVolumeMl,
              'mL',
            )} ÷ 100`,
            result: formatWithUnit(result.soluteAmount, result.soluteUnit),
          })
        : mode === 'vv'
          ? formatProcessLine({
              formula: '原液量',
              substitution: `${formatNumber(numericValue('#percent-value'))} × ${formatWithUnit(
                result.finalVolumeMl,
                'mL',
              )} ÷ 100`,
              result: formatWithUnit(result.soluteAmount, result.soluteUnit),
            })
          : formatProcessLine({
              formula: '溶質量',
              substitution: `${formatNumber(numericValue('#percent-value'))} × ${formatWithUnit(
                result.finalAmount,
                'g',
              )} ÷ 100`,
              result: formatWithUnit(result.soluteAmount, result.soluteUnit),
            }),
      mode === 'wv'
        ? `最終体積を${formatWithUnit(result.finalVolumeMl, 'mL')}に合わせます。`
        : formatProcessLine({
            formula: mode === 'vv' ? '希釈液量' : '溶媒量',
            substitution: `${
              mode === 'vv'
                ? formatWithUnit(result.finalVolumeMl, 'mL')
                : formatWithUnit(result.finalAmount, 'g')
            } - ${formatWithUnit(result.soluteAmount, result.soluteUnit)}`,
            result: formatWithUnit(result.solventAmount, result.solventUnit),
          }),
    ],
    notes: [
      mode === 'wt'
        ? 'wt%では、溶質と溶媒を合わせた全体質量を基準にします。'
        : mode === 'vv'
          ? 'v/v%では、原液と希釈液を合わせた最終体積を基準にします。'
          : 'w/v%では、溶質を溶かした後に最終体積へ合わせます。',
    ],
  });

  if (save) addHistory('%濃度', rows[0].value);
}

function calculateConversion({ save = true } = {}) {
  const fromUnit = selectValue('#conversion-from');
  const toUnit = selectValue('#conversion-to');
  const result = convertConcentration({
    value: numericValue('#conversion-value'),
    fromUnit,
    toUnit,
    molecularWeight: numericValue('#conversion-mw'),
  });

  const rows = [
    {
      label: '換算結果',
      value: formatWithUnit(result.value, toUnit),
      primary: true,
    },
    { label: '中間値', value: formatWithUnit(result.molar, 'mol/L') },
  ];

  renderResult('conversion', {
    title: '単位換算の結果',
    rows,
    formula: '質量濃度(g/L) = モル濃度(mol/L) × 分子量',
    process: [
      formatProcessLine({
        formula: 'まずmol/Lへ換算',
        substitution: `${formatWithUnit(numericValue('#conversion-value'), fromUnit)}`,
        result: formatWithUnit(result.molar, 'mol/L'),
      }),
      formatProcessLine({
        formula: `${toUnit}へ換算`,
        substitution: `${formatWithUnit(result.molar, 'mol/L')}`,
        result: formatWithUnit(result.value, toUnit),
      }),
    ],
    notes: [`${fromUnit} から ${toUnit} へ換算しました。`],
  });

  if (save) addHistory('単位換算', rows[0].value);
}

function calculateMixing({ save = true } = {}) {
  const unit = selectValue('#mixing-unit');
  const solutions = $$('.solution-row', $('#mixing-solutions')).map((row) => ({
    concentration: $('.solution-concentration', row).value,
    volume: $('.solution-volume', row).value,
    volumeUnit: $('.solution-volume-unit', row).value,
  }));
  const result = calculateMixedConcentration({ unit, solutions });

  const rows = [
    {
      label: '混合後濃度',
      value: formatWithUnit(result.concentration, unit),
      primary: true,
    },
    { label: '総体積', value: formatWithUnit(result.totalVolumeMl, 'mL') },
  ];

  renderResult('mixing', {
    title: '混合計算の結果',
    rows,
    formula: 'Cmix = Σ(Ci × Vi) ÷ ΣVi',
    process: [
      formatProcessLine({
        formula: 'Σ(Ci × Vi)',
        substitution: solutions
          .map(
            (solution) =>
              `${formatWithUnit(solution.concentration, unit)} × ${formatWithUnit(
                solution.volume,
                solution.volumeUnit,
              )}`,
          )
          .join(' + '),
        result: formatWithUnit(result.concentration * result.totalVolumeMl, `${unit}・mL`),
      }),
      formatProcessLine({
        formula: 'Cmix',
        substitution: `${formatWithUnit(
          result.concentration * result.totalVolumeMl,
          `${unit}・mL`,
        )} ÷ ${formatWithUnit(result.totalVolumeMl, 'mL')}`,
        result: formatWithUnit(result.concentration, unit),
      }),
    ],
    notes: ['同じ単位の溶液を混ぜたときの加重平均です。'],
  });

  if (save) addHistory('混合計算', rows[0].value);
}

function calculateSerial({ save = true } = {}) {
  const unit = selectValue('#serial-unit');
  const result = calculateSerialDilution({
    initialConcentration: numericValue('#serial-initial'),
    unit,
    dilutionFactor: numericValue('#serial-factor'),
    steps: Number(numericValue('#serial-steps')),
  });
  const displaySteps = normalizeSerialDilutionDisplaySteps({
    steps: result.steps,
    unit,
  });

  const tableHtml = `
    <h4>各段階の濃度</h4>
    <table class="result-table">
      <thead>
        <tr><th>段階</th><th>濃度</th></tr>
      </thead>
      <tbody>
        ${displaySteps
          .map(
            (step) =>
              `<tr><td>${step.step}段目</td><td>${escapeHtml(
                formatWithUnit(step.concentration, step.unit),
              )}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
  const lastStep = displaySteps[displaySteps.length - 1];
  const rows = [
    {
      label: '最終段階の濃度',
      value: formatWithUnit(lastStep.concentration, lastStep.unit),
      primary: true,
    },
    { label: '希釈倍率', value: `${formatNumber(result.dilutionFactor)}倍` },
    { label: '段数', value: `${result.steps.length}段` },
  ];

  renderResult('serial', {
    title: '連続希釈の結果',
    rows,
    formula: 'Cn = C0 ÷ 希釈倍率^n',
    process: [
      formatProcessLine({
        formula: '1段目',
        substitution: `${formatWithUnit(
          numericValue('#serial-initial'),
          unit,
        )} ÷ ${formatNumber(result.dilutionFactor)}`,
        result: formatWithUnit(displaySteps[0].concentration, displaySteps[0].unit),
      }),
      formatProcessLine({
        formula: `${result.steps.length}段目`,
        substitution: `${formatWithUnit(
          numericValue('#serial-initial'),
          unit,
        )} ÷ ${formatNumber(result.dilutionFactor)}^${result.steps.length}`,
        result: formatWithUnit(lastStep.concentration, lastStep.unit),
      }),
    ],
    notes: ['表では1段目に合わせた読みやすい単位で表示をそろえます。'],
    tableHtml,
  });

  if (save) addHistory('連続希釈', rows[0].value);
}

const runCalculator = (name, options) => {
  try {
    calculators[name](options);
  } catch (error) {
    renderError(name, error);
  }
};

const addHistory = (title, summary) => {
  state.history.unshift({
    title,
    summary,
    time: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  renderHistory();
};

const renderHistory = () => {
  const list = $('#history-list');
  if (!state.history.length) {
    list.innerHTML =
      '<li class="history-empty">計算ボタンを押すと、直近の結果がここに残ります。</li>';
    return;
  }

  list.innerHTML = state.history
    .map((item) => {
      const time = new Date(item.time).toLocaleString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `
        <li>
          <span class="history-meta">${escapeHtml(time)} / ${escapeHtml(item.title)}</span>
          ${escapeHtml(item.summary)}
        </li>
      `;
    })
    .join('');
};

const loadHistory = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    state.history = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.history = [];
  }
  renderHistory();
};

const updatePercentAmountMode = () => {
  const mode = selectValue('#percent-mode');
  const label = $('#percent-amount-label');
  const help = $('#percent-amount-help');
  const unitSelect = $('#percent-amount-unit');
  const currentValue = unitSelect.value;

  if (mode === 'wt') {
    label.textContent = '最終質量';
    help.textContent = 'wt%は質量基準なので、g / kg / mg で入力します。';
    unitSelect.innerHTML = '<option>g</option><option>kg</option><option>mg</option>';
    unitSelect.value = ['g', 'kg', 'mg'].includes(currentValue) ? currentValue : 'g';
    return;
  }

  label.textContent = '最終体積';
  help.textContent =
    mode === 'vv'
      ? 'v/v%は体積基準なので、mL / L / uL で入力します。'
      : 'w/v%は最終体積基準なので、mL / L / uL で入力します。';
  unitSelect.innerHTML = '<option>mL</option><option>L</option><option>uL</option>';
  unitSelect.value = ['mL', 'L', 'uL'].includes(currentValue) ? currentValue : 'mL';
};

const clearHistory = () => {
  state.history = [];
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
};

const updateCopyButton = () => {
  $('#copy-result').disabled = !state.results[state.activeTab];
};

const fallbackCopy = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const copyActiveResult = async () => {
  const result = state.results[state.activeTab];
  if (!result) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(result.plainText);
    } else {
      fallbackCopy(result.plainText);
    }
  } catch {
    fallbackCopy(result.plainText);
  }

  const button = $('#copy-result');
  const originalText = button.textContent;
  button.textContent = 'コピー済み';
  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1200);
};

const activateTab = (tab) => {
  state.activeTab = tab;
  $$('.tab-button').forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  $$('.calculator-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tab);
  });
  updateCopyButton();
};

const fillConcentrationUnits = () => {
  $$('[data-concentration-units]').forEach((select) => {
    select.innerHTML = allConcentrationUnits
      .map((unit) => `<option>${escapeHtml(unit)}</option>`)
      .join('');
  });

  $('#dilution-stock-unit').value = 'M';
  $('#dilution-target-unit').value = 'mM';
  $('#conversion-from').value = 'M';
  $('#conversion-to').value = 'mg/mL';
  $('#mixing-unit').value = 'mM';
  $('#serial-unit').value = 'mM';
};

const fillReagentPresets = () => {
  $$('[data-reagent-target]').forEach((input) => {
    const list = $(`#${input.getAttribute('list')}`);
    if (!list) return;
    list.innerHTML = '';
    REAGENT_PRESETS.forEach((reagent) => {
      const option = document.createElement('option');
      option.value = reagent.label;
      option.label = `分子量 ${reagent.molecularWeight}`;
      list.append(option);
    });
  });
};

const createSolutionRow = ({ concentration, volume, volumeUnit = 'mL' }) => {
  const row = document.createElement('div');
  row.className = 'solution-row';
  row.innerHTML = `
    <label class="field">
      濃度
      <input class="solution-concentration" type="number" step="any" value="${escapeHtml(
        concentration,
      )}" />
    </label>
    <label class="field">
      体積
      <input class="solution-volume" type="number" step="any" value="${escapeHtml(volume)}" />
    </label>
    <label class="field">
      単位
      <select class="solution-volume-unit">
        <option>mL</option>
        <option>L</option>
        <option>uL</option>
      </select>
    </label>
    <button class="button secondary remove-solution" type="button" aria-label="この行を削除">
      削除
    </button>
  `;
  $('.solution-volume-unit', row).value = volumeUnit;
  return row;
};

const addSolutionRow = (values = { concentration: 0, volume: 10 }) => {
  $('#mixing-solutions').append(createSolutionRow(values));
};

const setupMixingRows = () => {
  addSolutionRow({ concentration: 100, volume: 10 });
  addSolutionRow({ concentration: 0, volume: 90 });
  $('#mixing-solutions').addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-solution');
    if (!removeButton) return;

    const rows = $$('.solution-row', $('#mixing-solutions'));
    if (rows.length <= 2) {
      renderError('mixing', new Error('混合する溶液を2つ以上入力してください。'));
      return;
    }
    removeButton.closest('.solution-row').remove();
  });
};

const setupEvents = () => {
  $$('.tab-button').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  $$('form[data-calculator]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runCalculator(form.dataset.calculator, { save: true });
    });
  });

  $$('[data-reagent-target]').forEach((input) => {
    input.addEventListener('input', () => {
      const typedName = input.value.trim().toLowerCase();
      const matchedReagent = REAGENT_PRESETS.find(
        (reagent) => reagent.label.toLowerCase() === typedName,
      );
      if (!matchedReagent) return;
      $(`#${input.dataset.reagentTarget}`).value = matchedReagent.molecularWeight;
    });
  });

  $('#add-solution').addEventListener('click', () => addSolutionRow());
  $('#percent-mode').addEventListener('change', () => {
    updatePercentAmountMode();
    runCalculator('percent', { save: false });
  });
  $('#precision').addEventListener('change', () => {
    Object.keys(calculators).forEach((name) => runCalculator(name, { save: false }));
  });
  $('#copy-result').addEventListener('click', copyActiveResult);
  $('#clear-history').addEventListener('click', clearHistory);
};

const initialRender = () => {
  Object.keys(calculators).forEach((name) => runCalculator(name, { save: false }));
  activateTab('molar');
};

fillConcentrationUnits();
fillReagentPresets();
setupMixingRows();
updatePercentAmountMode();
setupEvents();
loadHistory();
initialRender();
})();
