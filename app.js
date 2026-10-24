/**
 * 打工薪資小幫手 - 完整前端應用邏輯
 * 支援：多工作管理、跨午夜班次、分鐘級精準計薪、編輯即時預覽、復原刪除、localStorage 與 JSON 備份還原
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'part_time_salary_helper_v1';

  // 柔和且具辨識度的工作識別色盤
  const JOB_COLORS = [
    { id: 'coral', name: '暖珊瑚紅', hex: '#E07A5F', light: '#FCEAE4' },
    { id: 'sage', name: '鼠尾草綠', hex: '#4D8B74', light: '#E3F2EC' },
    { id: 'ocean', name: '晴空海藍', hex: '#3D7EA6', light: '#E3F0F8' },
    { id: 'amber', name: '蜂蜜琥珀', hex: '#D98A2B', light: '#FDF0DF' },
    { id: 'plum', name: '柔和梅紫', hex: '#8E6399', light: '#F1E8F4' },
    { id: 'rose', name: '玫瑰粉紅', hex: '#C86D85', light: '#F9E8EC' },
    { id: 'teal', name: '湖水青綠', hex: '#2E8B8B', light: '#E2F3F3' },
    { id: 'Cocoa', name: '溫暖可可', hex: '#8C6249', light: '#F3EAE4' }
  ];

  const WEEKDAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

  // 取得今日日期資訊
  const now = new Date();
  const TODAY_YEAR = now.getFullYear();
  const TODAY_MONTH = now.getMonth() + 1;
  const TODAY_DAY = now.getDate();
  const TODAY_DATE_STR = formatDateKey(TODAY_YEAR, TODAY_MONTH, TODAY_DAY);

  // 應用程式狀態
  let state = {
    selectedYear: TODAY_YEAR,
    selectedMonth: TODAY_MONTH,
    selectedDate: null, // 'YYYY-MM-DD'
    jobs: [],           // [{ id, name, hourlyWage, color, defaultStart, defaultEnd, defaultBreak, active, createdAt }]
    shifts: [],         // [{ id, date, jobId, jobName, jobColor, hourlyWage, startTime, endTime, isNextDay, breakMinutes, updatedAt }]
    editingShiftId: null,     // null 代表非編輯特定舊班次；'__NEW__' 代表新增班次中
    draftShift: null,         // 編輯中的即時預覽班次草稿
    editingJobId: null,       // 工作管理表單目前編輯的工作 ID
    selectedJobColor: JOB_COLORS[0].hex,
    lastDeletedShift: null,   // 供復原使用的暫存班次
    confirmCallback: null
  };

  // DOM 元素快取
  const els = {};

  function initDomRefs() {
    const ids = [
      'btn-open-jobs', 'job-count-badge', 'btn-open-backup',
      'onboarding-banner', 'btn-onboarding-add-job',
      'jobs-strip-section', 'jobs-strip-list', 'btn-strip-add-job', 'btn-strip-manage-jobs',
      'select-year', 'select-month', 'btn-prev-month', 'btn-current-month', 'btn-next-month',
      'empty-month-hint', 'calendar-grid',
      'day-panel-backdrop', 'day-editor-panel', 'day-panel-badge', 'day-panel-title', 'btn-close-day-panel',
      'chk-has-work', 'day-summary-chip', 'day-no-job-prompt', 'btn-panel-create-job',
      'day-rest-state', 'day-work-content', 'overlap-warning', 'overlap-warning-text',
      'day-shifts-list', 'btn-add-another-shift',
      'shift-form', 'shift-form-title', 'shift-live-tag', 'shift-job-select', 'shift-job-meta',
      'shift-start-time', 'shift-end-time', 'shift-next-day', 'shift-date-span-info',
      'shift-break-mins', 'shift-form-error', 'preview-shift-hours', 'preview-shift-pay',
      'btn-cancel-shift', 'btn-save-shift',
      'salary-summary-widget', 'summary-month-label', 'summary-preview-indicator',
      'summary-total-amount', 'summary-total-hours', 'summary-work-days',
      'btn-toggle-summary-detail', 'toggle-detail-text', 'summary-detail-drawer', 'summary-job-breakdown',
      'jobs-modal-backdrop', 'jobs-modal', 'btn-close-jobs-modal', 'modal-jobs-list', 'btn-show-job-form',
      'job-form', 'job-form-title', 'job-name-input', 'job-wage-input', 'job-color-picker',
      'job-default-start', 'job-default-end', 'job-default-break', 'job-form-error',
      'btn-cancel-job-form', 'btn-save-job-form',
      'backup-modal-backdrop', 'btn-close-backup-modal', 'btn-export-json', 'input-import-json', 'import-error-msg',
      'confirm-modal-backdrop', 'confirm-modal-title', 'confirm-modal-desc', 'btn-confirm-cancel', 'btn-confirm-ok',
      'toast-container'
    ];
    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  // ==================== 工具函式 ====================

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateKey(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  function parseDateKey(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return { year: y, month: m, day: d };
  }

  function getNextDateKey(dateStr) {
    const { year, month, day } = parseDateKey(dateStr);
    const dt = new Date(year, month - 1, day + 1);
    return formatDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }

  function formatFullDateWithWeekday(dateStr) {
    const { year, month, day } = parseDateKey(dateStr);
    const dt = new Date(year, month - 1, day);
    const w = WEEKDAY_NAMES[dt.getDay()];
    return `${year} 年 ${month} 月 ${day} 日（${w}）`;
  }

  // 千分位與小數格式化
  function formatCurrency(amount, decimals = 2) {
    const num = Number(amount) || 0;
    return 'NT$ ' + num.toLocaleString('zh-TW', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatIntegerCurrency(amount) {
    const rounded = Math.round(Number(amount) || 0);
    return 'NT$ ' + rounded.toLocaleString('zh-TW');
  }

  function formatMinutesToHoursText(totalMinutes) {
    const mins = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) {
      return `${h} 小時`;
    }
    return `${h} 小時 ${m} 分鐘`;
  }

  function parseTimeToMinutes(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  /**
   * 精準分鐘級計薪：
   * 計薪分鐘數 = (下班時間 - 上班時間) - 不計薪休息分鐘數
   * 班次薪資 = (計薪分鐘數 / 60) * 該班次時薪 (不先對工時四捨五入)
   */
  function calculateShiftMetrics(startTime, endTime, isNextDay, breakMinutes, hourlyWage) {
    const startMins = parseTimeToMinutes(startTime);
    const endMins = parseTimeToMinutes(endTime);
    const breakMins = Number(breakMinutes);
    const wage = Number(hourlyWage);

    if (startMins === null || endMins === null) {
      return { valid: false, error: '請輸入完整的上班與下班時間。', paidMinutes: 0, exactPay: 0 };
    }
    if (isNaN(breakMins) || breakMins < 0 || !Number.isInteger(breakMins)) {
      return { valid: false, error: '休息時間請輸入 0 以上的整數分鐘。', paidMinutes: 0, exactPay: 0 };
    }
    if (isNaN(wage) || wage <= 0) {
      return { valid: false, error: '時薪必須大於 0。', paidMinutes: 0, exactPay: 0 };
    }

    let rawDuration = endMins - startMins;
    if (isNextDay) {
      rawDuration += 24 * 60;
    }

    if (rawDuration <= 0) {
      return {
        valid: false,
        error: '下班時間需晚於上班時間；若為跨午夜班次，請勾選「隔日下班」。',
        paidMinutes: 0,
        exactPay: 0
      };
    }

    if (rawDuration > 24 * 60) {
      return {
        valid: false,
        error: '單一班次總長度不可超過 24 小時，請確認下班時間與隔日設定。',
        paidMinutes: 0,
        exactPay: 0
      };
    }

    if (breakMins >= rawDuration) {
      return {
        valid: false,
        error: `休息時間（${breakMins} 分鐘）不可超過或等於班次總長度（${rawDuration} 分鐘）。`,
        paidMinutes: 0,
        exactPay: 0
      };
    }

    const paidMinutes = rawDuration - breakMins;
    const exactPay = (paidMinutes / 60) * wage;

    return {
      valid: true,
      error: null,
      rawDuration,
      paidMinutes,
      exactPay,
      startOffset: startMins,
      endOffset: startMins + rawDuration
    };
  }

  // 檢查同日班次是否時間重疊
  function detectOverlappingShifts(shiftsForDay) {
    if (!shiftsForDay || shiftsForDay.length < 2) return [];
    const intervals = [];
    shiftsForDay.forEach((s) => {
      const m = calculateShiftMetrics(s.startTime, s.endTime, s.isNextDay, s.breakMinutes, s.hourlyWage);
      if (m.valid) {
        intervals.push({
          id: s.id,
          jobName: s.jobName,
          start: m.startOffset,
          end: m.endOffset,
          label: `${s.jobName} (${s.startTime}–${s.endTime}${s.isNextDay ? ' 隔日' : ''})`
        });
      }
    });

    const overlaps = [];
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length; j++) {
        const a = intervals[i];
        const b = intervals[j];
        if (a.start < b.end && b.start < a.end) {
          overlaps.push(`${a.label} 與 ${b.label}`);
        }
      }
    }
    return overlaps;
  }

  function getLightColor(hex) {
    const found = JOB_COLORS.find((c) => c.hex.toLowerCase() === String(hex).toLowerCase());
    return found ? found.light : '#F4EFE6';
  }

  // ==================== 資料儲存與讀取 ====================

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.jobs) && Array.isArray(parsed.shifts)) {
        state.jobs = parsed.jobs;
        state.shifts = parsed.shifts;
      }
    } catch (err) {
      console.error('讀取本機儲存失敗：', err);
    }
  }

  function saveToStorage() {
    try {
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        jobs: state.jobs,
        shifts: state.shifts
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('寫入本機儲存失敗：', err);
      showToast('儲存失敗：瀏覽器儲存空間可能已滿或受限。');
    }
  }

  // ==================== 年月選擇器初始化 ====================

  function initYearMonthSelectors() {
    const yearSelect = els['select-year'];
    const monthSelect = els['select-month'];
    yearSelect.innerHTML = '';
    for (let y = TODAY_YEAR - 5; y <= TODAY_YEAR + 5; y++) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = `${y} 年`;
      yearSelect.appendChild(opt);
    }
    monthSelect.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = `${m} 月`;
      monthSelect.appendChild(opt);
    }
    syncYearMonthSelectors();
  }

  function syncYearMonthSelectors() {
    // 若選取年份超出預設範圍則動態補上
    const yearSelect = els['select-year'];
    if (![...yearSelect.options].some((o) => Number(o.value) === state.selectedYear)) {
      const opt = document.createElement('option');
      opt.value = String(state.selectedYear);
      opt.textContent = `${state.selectedYear} 年`;
      yearSelect.appendChild(opt);
    }
    yearSelect.value = String(state.selectedYear);
    els['select-month'].value = String(state.selectedMonth);
  }

  // ==================== 畫面渲染 ====================

  function renderAll() {
    syncYearMonthSelectors();
    renderHeaderAndOnboarding();
    renderCalendar();
    renderDayEditorPanel();
    renderSalarySummary();
  }

  function renderHeaderAndOnboarding() {
    const activeJobs = state.jobs.filter((j) => j.active !== false);
    els['job-count-badge'].textContent = String(activeJobs.length);

    if (state.jobs.length === 0) {
      els['onboarding-banner'].hidden = false;
      els['jobs-strip-section'].hidden = true;
    } else {
      els['onboarding-banner'].hidden = true;
      els['jobs-strip-section'].hidden = false;
      renderJobsStrip();
    }
  }

  function renderJobsStrip() {
    const container = els['jobs-strip-list'];
    container.innerHTML = '';
    state.jobs.forEach((job) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'job-mini-card' + (job.active === false ? ' is-disabled' : '');
      card.setAttribute('role', 'listitem');
      card.title = job.active === false ? `${job.name}（已停用，點擊編輯）` : `點擊編輯「${job.name}」`;

      const dot = document.createElement('span');
      dot.className = 'job-color-dot';
      dot.style.backgroundColor = job.color;

      const nameEl = document.createElement('span');
      nameEl.className = 'job-mini-name';
      nameEl.textContent = job.name + (job.active === false ? '（已停用）' : '');

      const wageEl = document.createElement('span');
      wageEl.className = 'job-mini-wage';
      wageEl.textContent = `${formatCurrency(job.hourlyWage, 0)} / 時`;

      card.appendChild(dot);
      card.appendChild(nameEl);
      card.appendChild(wageEl);

      card.addEventListener('click', () => {
        openJobsModal(job.id);
      });

      container.appendChild(card);
    });
  }

  // 判斷閏年並回傳該月天數
  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function getFirstDayOfWeek(year, month) {
    return new Date(year, month - 1, 1).getDay();
  }

  function getMonthShifts(year, month, includeDraft = false) {
    const prefix = `${year}-${pad2(month)}-`;
    let list = state.shifts.filter((s) => s.date.startsWith(prefix));

    if (includeDraft && state.draftShift && state.draftShift.date.startsWith(prefix)) {
      if (state.editingShiftId && state.editingShiftId !== '__NEW__') {
        list = list.map((s) => (s.id === state.editingShiftId ? state.draftShift : s));
      } else if (state.editingShiftId === '__NEW__') {
        list = [...list, state.draftShift];
      }
    }
    return list;
  }

  function renderCalendar() {
    const year = state.selectedYear;
    const month = state.selectedMonth;
    const daysInMonth = getDaysInMonth(year, month);
    const firstWeekday = getFirstDayOfWeek(year, month);

    const monthShifts = getMonthShifts(year, month, false);
    // 當月無班次且已有工作時，顯示提示
    els['empty-month-hint'].hidden = !(state.jobs.length > 0 && monthShifts.length === 0);

    // 依日期分組班次
    const shiftsByDate = {};
    monthShifts.forEach((s) => {
      if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
      shiftsByDate[s.date].push(s);
    });

    const grid = els['calendar-grid'];
    grid.innerHTML = '';

    const isMobile = window.innerWidth <= 640;
    const maxVisiblePills = isMobile ? 2 : 3;

    // 前置空白格
    for (let i = 0; i < firstWeekday; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day is-empty';
      emptyCell.setAttribute('aria-hidden', 'true');
      grid.appendChild(emptyCell);
    }

    // 當月每一天
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateKey(year, month, day);
      const dayShifts = (shiftsByDate[dateStr] || []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      const isToday = dateStr === TODAY_DATE_STR;
      const isSelected = dateStr === state.selectedDate;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'calendar-day' +
        (isToday ? ' is-today' : '') +
        (dayShifts.length > 0 ? ' has-shifts' : '') +
        (isSelected ? ' is-selected' : '');
      cell.dataset.date = dateStr;
      cell.setAttribute('aria-label', `${year}年${month}月${day}日${isToday ? '（今天）' : ''}，共 ${dayShifts.length} 筆班次`);

      const topRow = document.createElement('div');
      topRow.className = 'day-cell-top';

      const numSpan = document.createElement('span');
      numSpan.className = 'day-number';
      numSpan.textContent = String(day);
      topRow.appendChild(numSpan);

      if (isToday) {
        const todayTag = document.createElement('span');
        todayTag.className = 'today-tag';
        todayTag.textContent = '今天';
        topRow.appendChild(todayTag);
      } else if (dayShifts.length > 0) {
        const dot = document.createElement('span');
        dot.className = 'work-indicator-dot';
        dot.title = '這天有排班';
        topRow.appendChild(dot);
      }

      cell.appendChild(topRow);

      const shiftsContainer = document.createElement('div');
      shiftsContainer.className = 'day-shifts-container';

      const visibleShifts = dayShifts.slice(0, maxVisiblePills);
      visibleShifts.forEach((shift) => {
        const pill = document.createElement('div');
        pill.className = 'cal-shift-pill';
        pill.style.borderLeftColor = shift.jobColor || '#E07A5F';
        pill.style.backgroundColor = getLightColor(shift.jobColor);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'cal-shift-name';
        nameSpan.textContent = shift.jobName;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'cal-shift-time';
        timeSpan.textContent = `${shift.startTime}-${shift.endTime}${shift.isNextDay ? '+1' : ''}`;

        pill.appendChild(nameSpan);
        pill.appendChild(timeSpan);
        shiftsContainer.appendChild(pill);
      });

      if (dayShifts.length > maxVisiblePills) {
        const moreBadge = document.createElement('div');
        moreBadge.className = 'cal-more-badge';
        moreBadge.textContent = `還有 ${dayShifts.length - maxVisiblePills} 筆`;
        shiftsContainer.appendChild(moreBadge);
      }

      cell.appendChild(shiftsContainer);

      cell.addEventListener('click', () => {
        openDayPanel(dateStr);
      });

      grid.appendChild(cell);
    }
  }

  // ==================== 每日排班面板 ====================

  function openDayPanel(dateStr) {
    state.selectedDate = dateStr;
    state.editingShiftId = null;
    state.draftShift = null;
    renderAll();

    const panel = els['day-editor-panel'];
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.querySelector('.workspace-grid').classList.add('has-panel-open');

    if (window.innerWidth <= 960) {
      els['day-panel-backdrop'].hidden = false;
      els['day-panel-backdrop'].classList.add('is-visible');
    }
  }

  function closeDayPanel() {
    state.selectedDate = null;
    state.editingShiftId = null;
    state.draftShift = null;
    els['day-editor-panel'].hidden = true;
    els['day-editor-panel'].setAttribute('aria-hidden', 'true');
    els['day-panel-backdrop'].hidden = true;
    els['day-panel-backdrop'].classList.remove('is-visible');
    document.querySelector('.workspace-grid').classList.remove('has-panel-open');
    renderAll();
  }

  function renderDayEditorPanel() {
    const panel = els['day-editor-panel'];
    if (!state.selectedDate) {
      panel.hidden = true;
      return;
    }

    const dateStr = state.selectedDate;
    els['day-panel-title'].textContent = formatFullDateWithWeekday(dateStr);
    els['day-panel-badge'].hidden = dateStr !== TODAY_DATE_STR;

    const dayShifts = state.shifts
      .filter((s) => s.date === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const activeJobs = state.jobs.filter((j) => j.active !== false);
    const hasWorkChecked = dayShifts.length > 0 || state.editingShiftId !== null || els['chk-has-work'].dataset.manualChecked === 'true';

    els['chk-has-work'].checked = hasWorkChecked;

    if (dayShifts.length > 0) {
      let dayMins = 0;
      let dayPay = 0;
      dayShifts.forEach((s) => {
        const m = calculateShiftMetrics(s.startTime, s.endTime, s.isNextDay, s.breakMinutes, s.hourlyWage);
        if (m.valid) {
          dayMins += m.paidMinutes;
          dayPay += m.exactPay;
        }
      });
      els['day-summary-chip'].textContent = `共 ${dayShifts.length} 班｜${formatCurrency(dayPay, 2)}`;
    } else {
      els['day-summary-chip'].textContent = '無排班';
    }

    if (!hasWorkChecked) {
      els['day-no-job-prompt'].hidden = true;
      els['day-rest-state'].hidden = false;
      els['day-work-content'].hidden = true;
      return;
    }

    els['day-rest-state'].hidden = true;

    // 若沒有任何啟用中的工作且當日也無舊班次
    if (activeJobs.length === 0 && dayShifts.length === 0) {
      els['day-no-job-prompt'].hidden = false;
      els['day-work-content'].hidden = true;
      return;
    }

    els['day-no-job-prompt'].hidden = true;
    els['day-work-content'].hidden = false;

    // 檢查時間重疊（包含正在編輯中的草稿）
    const previewDayShifts = getDayShiftsWithDraft(dateStr);
    const overlaps = detectOverlappingShifts(previewDayShifts);
    if (overlaps.length > 0) {
      els['overlap-warning'].hidden = false;
      els['overlap-warning-text'].textContent = `提醒：班次時間重疊（${overlaps.join('；')}），請確認排班是否正確。`;
    } else {
      els['overlap-warning'].hidden = true;
    }

    // 渲染當日已儲存班次卡片
    const listEl = els['day-shifts-list'];
    listEl.innerHTML = '';
    dayShifts.forEach((shift) => {
      const metrics = calculateShiftMetrics(shift.startTime, shift.endTime, shift.isNextDay, shift.breakMinutes, shift.hourlyWage);
      const card = document.createElement('div');
      card.className = 'shift-item-card';
      card.style.borderLeftColor = shift.jobColor || '#E07A5F';
      card.setAttribute('role', 'listitem');

      const nextDateStr = getNextDateKey(shift.date);
      const timeRangeText = shift.isNextDay
        ? `${shift.date.slice(5)} ${shift.startTime} → ${nextDateStr.slice(5)} ${shift.endTime}（隔日下班）`
        : `${shift.startTime} – ${shift.endTime}`;

      card.innerHTML = `
        <div class="shift-item-top">
          <div class="shift-item-job">
            <span class="job-color-dot" style="background:${shift.jobColor}"></span>
            <span>${escapeHtml(shift.jobName)}</span>
          </div>
          <div class="shift-item-actions">
            <button type="button" class="btn-chip btn-edit-shift" data-id="${shift.id}">編輯</button>
            <button type="button" class="btn-chip danger btn-delete-shift" data-id="${shift.id}">刪除</button>
          </div>
        </div>
        <div class="shift-item-details">
          <span>🕒 ${timeRangeText}</span>
          <span>☕ 休息 ${shift.breakMinutes} 分鐘</span>
          <span>💰 時薪 ${formatCurrency(shift.hourlyWage, 0)}</span>
        </div>
        <div class="shift-item-pay-row">
          <span>計薪工時：<strong>${formatMinutesToHoursText(metrics.paidMinutes)}</strong></span>
          <span class="shift-item-pay">${formatCurrency(metrics.exactPay, 2)}</span>
        </div>
      `;

      card.querySelector('.btn-edit-shift').addEventListener('click', () => {
        startEditShift(shift.id);
      });
      card.querySelector('.btn-delete-shift').addEventListener('click', () => {
        deleteShiftWithUndo(shift.id);
      });

      listEl.appendChild(card);
    });

    // 控制「新增同一天的其他班次」按鈕與表單顯示
    if (state.editingShiftId !== null) {
      els['btn-add-another-shift'].hidden = true;
      els['shift-form'].hidden = false;
    } else {
      els['shift-form'].hidden = true;
      els['btn-add-another-shift'].hidden = activeJobs.length === 0;
    }
  }

  function getDayShiftsWithDraft(dateStr) {
    let list = state.shifts.filter((s) => s.date === dateStr);
    if (state.draftShift && state.draftShift.date === dateStr) {
      if (state.editingShiftId && state.editingShiftId !== '__NEW__') {
        list = list.map((s) => (s.id === state.editingShiftId ? state.draftShift : s));
      } else if (state.editingShiftId === '__NEW__') {
        list = [...list, state.draftShift];
      }
    }
    return list;
  }

  // 開始新增班次
  function startNewShift() {
    const activeJobs = state.jobs.filter((j) => j.active !== false);
    if (activeJobs.length === 0) {
      els['day-no-job-prompt'].hidden = false;
      return;
    }
    state.editingShiftId = '__NEW__';
    els['shift-form-title'].textContent = '新增班次';
    els['shift-form-error'].hidden = true;

    populateShiftJobSelect(activeJobs[0].id);
    applyJobDefaultsToShiftForm(activeJobs[0]);
    updateDraftShiftAndPreview();
    renderDayEditorPanel();
  }

  // 開始編輯既有班次
  function startEditShift(shiftId) {
    const shift = state.shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    state.editingShiftId = shiftId;
    els['shift-form-title'].textContent = '編輯班次';
    els['shift-form-error'].hidden = true;

    populateShiftJobSelect(shift.jobId, shift);
    els['shift-start-time'].value = shift.startTime;
    els['shift-end-time'].value = shift.endTime;
    els['shift-next-day'].checked = Boolean(shift.isNextDay);
    els['shift-break-mins'].value = String(shift.breakMinutes);

    updateDraftShiftAndPreview();
    renderDayEditorPanel();
  }

  function populateShiftJobSelect(selectedJobId, existingShift = null) {
    const select = els['shift-job-select'];
    select.innerHTML = '';

    const activeJobs = state.jobs.filter((j) => j.active !== false);
    activeJobs.forEach((job) => {
      const opt = document.createElement('option');
      opt.value = job.id;
      opt.textContent = `${job.name}（NT$ ${job.hourlyWage.toLocaleString('zh-TW')} / 時）`;
      select.appendChild(opt);
    });

    // 若編輯的舊班次所屬工作已停用，仍保留該選項供檢視與維持原時薪
    if (existingShift && !activeJobs.some((j) => j.id === existingShift.jobId)) {
      const opt = document.createElement('option');
      opt.value = existingShift.jobId;
      opt.textContent = `${existingShift.jobName}（已停用｜本班次時薪 NT$ ${existingShift.hourlyWage.toLocaleString('zh-TW')}）`;
      select.appendChild(opt);
    }

    select.value = selectedJobId;
  }

  function applyJobDefaultsToShiftForm(job) {
    if (!job) return;
    els['shift-start-time'].value = job.defaultStart || '09:00';
    els['shift-end-time'].value = job.defaultEnd || '17:00';

    // 若預設下班時間小於等於上班時間，自動勾選隔日下班
    const startMins = parseTimeToMinutes(els['shift-start-time'].value);
    const endMins = parseTimeToMinutes(els['shift-end-time'].value);
    els['shift-next-day'].checked = (startMins !== null && endMins !== null && endMins <= startMins);

    els['shift-break-mins'].value = String(job.defaultBreak ?? 0);
  }

  function getSelectedShiftJobSnapshot() {
    const selectedJobId = els['shift-job-select'].value;
    const existingShift = state.editingShiftId && state.editingShiftId !== '__NEW__'
      ? state.shifts.find((s) => s.id === state.editingShiftId)
      : null;

    // 若編輯既有班次且未更換工作，保留該班次建立時的歷史時薪
    if (existingShift && existingShift.jobId === selectedJobId) {
      const currentJob = state.jobs.find((j) => j.id === selectedJobId);
      return {
        jobId: existingShift.jobId,
        jobName: currentJob ? currentJob.name : existingShift.jobName,
        jobColor: currentJob ? currentJob.color : existingShift.jobColor,
        hourlyWage: existingShift.hourlyWage
      };
    }

    const job = state.jobs.find((j) => j.id === selectedJobId);
    if (job) {
      return {
        jobId: job.id,
        jobName: job.name,
        jobColor: job.color,
        hourlyWage: job.hourlyWage
      };
    }
    return null;
  }

  // 當表單輸入改變時即時更新預覽與右下角月薪摘要
  function updateDraftShiftAndPreview() {
    if (!state.selectedDate || !state.editingShiftId) return;

    const jobSnap = getSelectedShiftJobSnapshot();
    if (!jobSnap) return;

    // 顯示所選工作的識別色與時薪資訊
    els['shift-job-meta'].innerHTML = `
      <span class="job-color-dot" style="background:${jobSnap.jobColor}"></span>
      <span>套用時薪：<strong>${formatCurrency(jobSnap.hourlyWage, 0)} / 時</strong></span>
    `;

    const startTime = els['shift-start-time'].value;
    const endTime = els['shift-end-time'].value;
    const isNextDay = els['shift-next-day'].checked;
    const breakMinutes = Number(els['shift-break-mins'].value || 0);

    // 跨午夜班次起訖日期提示
    if (isNextDay) {
      const nextDate = getNextDateKey(state.selectedDate);
      els['shift-date-span-info'].textContent = `起訖時間：${state.selectedDate} ${startTime || '--:--'} → ${nextDate} ${endTime || '--:--'}（歸屬於開始日期 ${state.selectedDate.slice(0, 7)} 月份統計）`;
    } else {
      els['shift-date-span-info'].textContent = `起訖時間：${state.selectedDate} ${startTime || '--:--'} → ${state.selectedDate} ${endTime || '--:--'}`;
    }

    const metrics = calculateShiftMetrics(startTime, endTime, isNextDay, breakMinutes, jobSnap.hourlyWage);

    if (!metrics.valid) {
      els['shift-form-error'].hidden = false;
      els['shift-form-error'].textContent = metrics.error;
      els['preview-shift-hours'].textContent = '0 小時 0 分鐘';
      els['preview-shift-pay'].textContent = 'NT$ 0.00';
      state.draftShift = null;
    } else {
      els['shift-form-error'].hidden = true;
      els['preview-shift-hours'].textContent = formatMinutesToHoursText(metrics.paidMinutes);
      els['preview-shift-pay'].textContent = formatCurrency(metrics.exactPay, 2);

      state.draftShift = {
        id: state.editingShiftId === '__NEW__' ? '__DRAFT__' : state.editingShiftId,
        date: state.selectedDate,
        jobId: jobSnap.jobId,
        jobName: jobSnap.jobName,
        jobColor: jobSnap.jobColor,
        hourlyWage: jobSnap.hourlyWage,
        startTime,
        endTime,
        isNextDay,
        breakMinutes
      };
    }

    // 同步檢查當日重疊與即時更新右下角月薪資摘要
    const previewDayShifts = getDayShiftsWithDraft(state.selectedDate);
    const overlaps = detectOverlappingShifts(previewDayShifts);
    if (overlaps.length > 0) {
      els['overlap-warning'].hidden = false;
      els['overlap-warning-text'].textContent = `提醒：班次時間重疊（${overlaps.join('；')}），請確認排班是否正確。`;
    } else {
      els['overlap-warning'].hidden = true;
    }

    renderSalarySummary();
  }

  function handleSaveShiftForm(e) {
    e.preventDefault();
    const jobSnap = getSelectedShiftJobSnapshot();
    if (!jobSnap) {
      els['shift-form-error'].hidden = false;
      els['shift-form-error'].textContent = '請先選擇一份工作。';
      return;
    }

    const startTime = els['shift-start-time'].value;
    const endTime = els['shift-end-time'].value;
    const isNextDay = els['shift-next-day'].checked;
    const breakMinutes = Number(els['shift-break-mins'].value || 0);

    const metrics = calculateShiftMetrics(startTime, endTime, isNextDay, breakMinutes, jobSnap.hourlyWage);
    if (!metrics.valid) {
      els['shift-form-error'].hidden = false;
      els['shift-form-error'].textContent = metrics.error;
      return;
    }

    if (state.editingShiftId === '__NEW__') {
      const newShift = {
        id: 'shift_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        date: state.selectedDate,
        jobId: jobSnap.jobId,
        jobName: jobSnap.jobName,
        jobColor: jobSnap.jobColor,
        hourlyWage: jobSnap.hourlyWage,
        startTime,
        endTime,
        isNextDay,
        breakMinutes,
        updatedAt: new Date().toISOString()
      };
      state.shifts.push(newShift);
      showToast(`已新增「${jobSnap.jobName}」班次！`);
    } else {
      const idx = state.shifts.findIndex((s) => s.id === state.editingShiftId);
      if (idx !== -1) {
        state.shifts[idx] = {
          ...state.shifts[idx],
          jobId: jobSnap.jobId,
          jobName: jobSnap.jobName,
          jobColor: jobSnap.jobColor,
          hourlyWage: jobSnap.hourlyWage,
          startTime,
          endTime,
          isNextDay,
          breakMinutes,
          updatedAt: new Date().toISOString()
        };
        showToast(`已更新「${jobSnap.jobName}」班次！`);
      }
    }

    state.editingShiftId = null;
    state.draftShift = null;
    els['chk-has-work'].dataset.manualChecked = 'true';
    saveToStorage();
    renderAll();
  }

  function handleCancelShiftForm() {
    state.editingShiftId = null;
    state.draftShift = null;
    const dayShifts = state.shifts.filter((s) => s.date === state.selectedDate);
    if (dayShifts.length === 0) {
      els['chk-has-work'].dataset.manualChecked = 'false';
    }
    renderAll();
  }

  function deleteShiftWithUndo(shiftId) {
    const idx = state.shifts.findIndex((s) => s.id === shiftId);
    if (idx === -1) return;
    const removed = state.shifts[idx];
    state.lastDeletedShift = removed;
    state.shifts.splice(idx, 1);

    if (state.editingShiftId === shiftId) {
      state.editingShiftId = null;
      state.draftShift = null;
    }

    const remaining = state.shifts.filter((s) => s.date === state.selectedDate);
    if (remaining.length === 0) {
      els['chk-has-work'].dataset.manualChecked = 'false';
    }

    saveToStorage();
    renderAll();

    showToast(`已刪除「${removed.jobName}」(${removed.startTime}–${removed.endTime}) 班次`, {
      undoText: '復原',
      onUndo: () => {
        if (state.lastDeletedShift) {
          state.shifts.push(state.lastDeletedShift);
          state.lastDeletedShift = null;
          saveToStorage();
          renderAll();
          showToast('已復原刪除的班次！');
        }
      }
    });
  }

  // ==================== 當月薪資摘要計算與渲染 ====================

  function renderSalarySummary() {
    const year = state.selectedYear;
    const month = state.selectedMonth;
    els['summary-month-label'].textContent = `${year} 年 ${month} 月`;

    // 是否處於編輯即時預覽狀態
    const isPreviewing = Boolean(state.editingShiftId !== null && state.draftShift !== null);
    els['summary-preview-indicator'].hidden = !isPreviewing;

    // 取得當月所有班次（含即時預覽草稿）
    const monthShifts = getMonthShifts(year, month, true);

    let totalPaidMinutes = 0;
    let totalExactSalary = 0;
    const uniqueWorkDays = new Set();
    const jobBreakdownMap = new Map();

    monthShifts.forEach((shift) => {
      const m = calculateShiftMetrics(shift.startTime, shift.endTime, shift.isNextDay, shift.breakMinutes, shift.hourlyWage);
      if (!m.valid) return;

      totalPaidMinutes += m.paidMinutes;
      totalExactSalary += m.exactPay;
      uniqueWorkDays.add(shift.date);

      const key = shift.jobId || shift.jobName;
      if (!jobBreakdownMap.has(key)) {
        // 優先顯示最新工作名稱與顏色
        const latestJob = state.jobs.find((j) => j.id === shift.jobId);
        jobBreakdownMap.set(key, {
          jobId: key,
          name: latestJob ? latestJob.name : shift.jobName,
          color: latestJob ? latestJob.color : shift.jobColor,
          paidMinutes: 0,
          exactPay: 0,
          shiftCount: 0
        });
      }
      const entry = jobBreakdownMap.get(key);
      entry.paidMinutes += m.paidMinutes;
      entry.exactPay += m.exactPay;
      entry.shiftCount += 1;
    });

    // 總計於加總後統一四捨五入（並同時提供小數點後兩位明細）
    const roundedTotal = Math.round(totalExactSalary);
    els['summary-total-amount'].textContent = `${formatIntegerCurrency(roundedTotal)}（${formatCurrency(totalExactSalary, 2)}）`;
    els['summary-total-hours'].textContent = formatMinutesToHoursText(totalPaidMinutes);
    els['summary-work-days'].textContent = `${uniqueWorkDays.size} 天`;

    // 渲染各工作小計
    const breakdownContainer = els['summary-job-breakdown'];
    breakdownContainer.innerHTML = '';

    if (jobBreakdownMap.size === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'summary-disclaimer';
      emptyEl.textContent = '本月尚無排班紀錄。';
      breakdownContainer.appendChild(emptyEl);
    } else {
      Array.from(jobBreakdownMap.values())
        .sort((a, b) => b.exactPay - a.exactPay)
        .forEach((item) => {
          const row = document.createElement('div');
          row.className = 'breakdown-item';
          row.setAttribute('role', 'listitem');
          row.innerHTML = `
            <div class="breakdown-job-info">
              <span class="job-color-dot" style="background:${item.color}"></span>
              <span class="breakdown-job-name">${escapeHtml(item.name)}（${item.shiftCount} 班）</span>
            </div>
            <div class="breakdown-job-stats">
              <span class="breakdown-pay">${formatCurrency(item.exactPay, 2)}</span>
              <span class="breakdown-hours">${formatMinutesToHoursText(item.paidMinutes)}</span>
            </div>
          `;
          breakdownContainer.appendChild(row);
        });
    }
  }

  // ==================== 工作管理 Modal ====================

  function initColorPicker() {
    const container = els['job-color-picker'];
    container.innerHTML = '';
    JOB_COLORS.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (c.hex === state.selectedJobColor ? ' is-selected' : '');
      btn.style.backgroundColor = c.hex;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(c.hex === state.selectedJobColor));
      btn.setAttribute('aria-label', c.name);
      btn.title = c.name;
      btn.textContent = c.hex === state.selectedJobColor ? '✓' : '';

      btn.addEventListener('click', () => {
        state.selectedJobColor = c.hex;
        initColorPicker();
      });

      container.appendChild(btn);
    });
  }

  function openJobsModal(editJobId = null) {
    els['jobs-modal-backdrop'].hidden = false;
    renderModalJobsList();

    if (editJobId === '__NEW__' || state.jobs.length === 0) {
      showJobForm(null);
    } else if (editJobId) {
      const target = state.jobs.find((j) => j.id === editJobId);
      if (target) showJobForm(target);
    } else {
      els['job-form'].hidden = true;
      els['btn-show-job-form'].hidden = false;
    }
  }

  function closeJobsModal() {
    els['jobs-modal-backdrop'].hidden = true;
    state.editingJobId = null;
  }

  function renderModalJobsList() {
    const listEl = els['modal-jobs-list'];
    listEl.innerHTML = '';

    if (state.jobs.length === 0) {
      const p = document.createElement('p');
      p.className = 'modal-subtitle';
      p.textContent = '目前還沒有建立任何工作，請在下方輸入工作名稱與時薪！';
      listEl.appendChild(p);
      return;
    }

    state.jobs.forEach((job) => {
      const card = document.createElement('div');
      card.className = 'job-card' + (job.active === false ? ' is-disabled' : '');
      card.style.borderLeftColor = job.color;
      card.setAttribute('role', 'listitem');

      const defaultTimeText = (job.defaultStart && job.defaultEnd)
        ? `預設時間：${job.defaultStart}–${job.defaultEnd}（休息 ${job.defaultBreak || 0} 分）`
        : '未設定預設班表時間';

      card.innerHTML = `
        <div class="job-card-info">
          <div class="job-card-title-row">
            <span class="job-color-dot" style="background:${job.color}"></span>
            <span class="job-card-name">${escapeHtml(job.name)}</span>
            ${job.active === false ? '<span class="status-tag">已停用</span>' : ''}
          </div>
          <div class="job-card-meta">
            時薪：<strong>${formatCurrency(job.hourlyWage, 0)}</strong> ｜ ${defaultTimeText}
          </div>
        </div>
        <div class="job-card-actions">
          <button type="button" class="btn-chip btn-edit-job">編輯</button>
          <button type="button" class="btn-chip btn-toggle-job">${job.active === false ? '重新啟用' : '停用'}</button>
        </div>
      `;

      card.querySelector('.btn-edit-job').addEventListener('click', () => {
        showJobForm(job);
      });

      card.querySelector('.btn-toggle-job').addEventListener('click', () => {
        job.active = job.active === false ? true : false;
        saveToStorage();
        renderModalJobsList();
        renderAll();
        showToast(job.active ? `已重新啟用「${job.name}」` : `已停用「${job.name}」（歷史班表與薪資均完整保留）`);
      });

      listEl.appendChild(card);
    });
  }

  function showJobForm(job = null) {
    els['job-form'].hidden = false;
    els['btn-show-job-form'].hidden = true;
    els['job-form-error'].hidden = true;

    if (job) {
      state.editingJobId = job.id;
      els['job-form-title'].textContent = `編輯工作：${job.name}`;
      els['job-name-input'].value = job.name;
      els['job-wage-input'].value = String(job.hourlyWage);
      state.selectedJobColor = job.color || JOB_COLORS[0].hex;
      els['job-default-start'].value = job.defaultStart || '';
      els['job-default-end'].value = job.defaultEnd || '';
      els['job-default-break'].value = job.defaultBreak ? String(job.defaultBreak) : '';
    } else {
      state.editingJobId = null;
      els['job-form-title'].textContent = '新增工作';
      els['job-name-input'].value = '';
      els['job-wage-input'].value = '';
      const usedColors = new Set(state.jobs.map((j) => j.color));
      const unused = JOB_COLORS.find((c) => !usedColors.has(c.hex));
      state.selectedJobColor = unused ? unused.hex : JOB_COLORS[state.jobs.length % JOB_COLORS.length].hex;
      els['job-default-start'].value = '';
      els['job-default-end'].value = '';
      els['job-default-break'].value = '';
    }

    initColorPicker();
    els['job-name-input'].focus();
  }

  function handleSaveJobForm(e) {
    e.preventDefault();
    const name = els['job-name-input'].value.trim();
    const wageRaw = els['job-wage-input'].value.trim();
    const wage = Number(wageRaw);
    const defaultStart = els['job-default-start'].value;
    const defaultEnd = els['job-default-end'].value;
    const defaultBreakRaw = els['job-default-break'].value.trim();
    const defaultBreak = defaultBreakRaw === '' ? 0 : Number(defaultBreakRaw);

    if (!name) {
      els['job-form-error'].hidden = false;
      els['job-form-error'].textContent = '請輸入工作名稱（必填）。';
      els['job-name-input'].focus();
      return;
    }

    if (!wageRaw || isNaN(wage) || wage <= 0) {
      els['job-form-error'].hidden = false;
      els['job-form-error'].textContent = '時薪為必填，且只能輸入大於 0 的數字。';
      els['job-wage-input'].focus();
      return;
    }

    if (isNaN(defaultBreak) || defaultBreak < 0 || !Number.isInteger(defaultBreak)) {
      els['job-form-error'].hidden = false;
      els['job-form-error'].textContent = '預設休息分鐘數需為 0 以上的整數。';
      return;
    }

    if (state.editingJobId) {
      const idx = state.jobs.findIndex((j) => j.id === state.editingJobId);
      if (idx !== -1) {
        const oldJob = state.jobs[idx];
        state.jobs[idx] = {
          ...oldJob,
          name,
          hourlyWage: wage,
          color: state.selectedJobColor,
          defaultStart,
          defaultEnd,
          defaultBreak
        };
        // 同步更新歷史班次顯示的工作名稱與識別色，但嚴格保留歷史班次原本的 hourlyWage！
        state.shifts.forEach((s) => {
          if (s.jobId === oldJob.id) {
            s.jobName = name;
            s.jobColor = state.selectedJobColor;
          }
        });
        showToast(`已儲存「${name}」設定（已建立的歷史班次保留原時薪）`);
      }
    } else {
      const newJob = {
        id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name,
        hourlyWage: wage,
        color: state.selectedJobColor,
        defaultStart,
        defaultEnd,
        defaultBreak,
        active: true,
        createdAt: new Date().toISOString()
      };
      state.jobs.push(newJob);
      showToast(`已新增工作「${name}」！現在可以點選月曆日期開始排班。`);
    }

    saveToStorage();
    els['job-form'].hidden = true;
    els['btn-show-job-form'].hidden = false;
    state.editingJobId = null;
    renderModalJobsList();
    renderAll();
  }

  // ==================== JSON 備份匯出與匯入 ====================

  function handleExportJson() {
    const payload = {
      appName: '打工薪資小幫手',
      version: 1,
      exportedAt: new Date().toISOString(),
      jobs: state.jobs,
      shifts: state.shifts
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateTag = formatDateKey(TODAY_YEAR, TODAY_MONTH, TODAY_DAY);
    a.href = url;
    a.download = `打工薪資小幫手_備份_${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已匯出 JSON 備份檔案！');
  }

  function validateBackupPayload(data) {
    if (!data || typeof data !== 'object') {
      return '檔案內容不是有效的 JSON 物件。';
    }
    if (!Array.isArray(data.jobs) || !Array.isArray(data.shifts)) {
      return '備份檔缺少 jobs 或 shifts 陣列欄位。';
    }
    for (const j of data.jobs) {
      if (!j || typeof j.id !== 'string' || typeof j.name !== 'string' || typeof j.hourlyWage !== 'number' || j.hourlyWage <= 0) {
        return '工作項目資料格式有誤（需包含有效名稱與大於 0 的時薪）。';
      }
    }
    for (const s of data.shifts) {
      if (!s || typeof s.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || typeof s.hourlyWage !== 'number') {
        return '班次紀錄格式有誤（需包含有效日期 YYYY-MM-DD 與時薪）。';
      }
    }
    return null;
  }

  function handleImportJsonFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    els['import-error-msg'].hidden = true;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const errMsg = validateBackupPayload(parsed);
        if (errMsg) {
          els['import-error-msg'].hidden = false;
          els['import-error-msg'].textContent = `匯入驗證失敗：${errMsg}`;
          return;
        }

        const applyImport = () => {
          state.jobs = parsed.jobs;
          state.shifts = parsed.shifts;
          state.editingShiftId = null;
          state.draftShift = null;
          saveToStorage();
          els['backup-modal-backdrop'].hidden = true;
          renderAll();
          showToast(`成功匯入 ${parsed.jobs.length} 份工作與 ${parsed.shifts.length} 筆班次！`);
        };

        if (state.jobs.length > 0 || state.shifts.length > 0) {
          openConfirmModal(
            '確認覆蓋既有資料',
            `匯入備份將會覆蓋目前瀏覽器中的 ${state.jobs.length} 份工作與 ${state.shifts.length} 筆班次紀錄。確定要繼續嗎？`,
            applyImport
          );
        } else {
          applyImport();
        }
      } catch (err) {
        els['import-error-msg'].hidden = false;
        els['import-error-msg'].textContent = '無法解析 JSON 檔案，請確認檔案格式是否正確。';
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  // ==================== 確認視窗與 Toast ====================

  function openConfirmModal(title, desc, onConfirm) {
    els['confirm-modal-title'].textContent = title;
    els['confirm-modal-desc'].textContent = desc;
    state.confirmCallback = onConfirm;
    els['confirm-modal-backdrop'].hidden = false;
  }

  function closeConfirmModal() {
    els['confirm-modal-backdrop'].hidden = true;
    state.confirmCallback = null;
  }

  function showToast(message, options = {}) {
    const container = els['toast-container'];
    const toast = document.createElement('div');
    toast.className = 'toast-item';

    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);

    if (options.undoText && typeof options.onUndo === 'function') {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'btn-undo';
      undoBtn.textContent = options.undoText;
      undoBtn.addEventListener('click', () => {
        options.onUndo();
        toast.remove();
      });
      toast.appendChild(undoBtn);
    }

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, options.undoText ? 6500 : 3200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==================== 事件綁定 ====================

  function bindEvents() {
    // 年份與月份選擇器
    els['select-year'].addEventListener('change', (e) => {
      state.selectedYear = Number(e.target.value);
      renderAll();
    });

    els['select-month'].addEventListener('change', (e) => {
      state.selectedMonth = Number(e.target.value);
      renderAll();
    });

    els['btn-prev-month'].addEventListener('click', () => {
      if (state.selectedMonth === 1) {
        state.selectedYear -= 1;
        state.selectedMonth = 12;
      } else {
        state.selectedMonth -= 1;
      }
      renderAll();
    });

    els['btn-current-month'].addEventListener('click', () => {
      state.selectedYear = TODAY_YEAR;
      state.selectedMonth = TODAY_MONTH;
      renderAll();
    });

    els['btn-next-month'].addEventListener('click', () => {
      if (state.selectedMonth === 12) {
        state.selectedYear += 1;
        state.selectedMonth = 1;
      } else {
        state.selectedMonth += 1;
      }
      renderAll();
    });

    // 開關工作管理 Modal
    els['btn-open-jobs'].addEventListener('click', () => openJobsModal());
    els['btn-onboarding-add-job'].addEventListener('click', () => openJobsModal('__NEW__'));
    els['btn-strip-add-job'].addEventListener('click', () => openJobsModal('__NEW__'));
    els['btn-strip-manage-jobs'].addEventListener('click', () => openJobsModal());
    els['btn-panel-create-job'].addEventListener('click', () => openJobsModal('__NEW__'));
    els['btn-close-jobs-modal'].addEventListener('click', closeJobsModal);

    els['btn-show-job-form'].addEventListener('click', () => showJobForm(null));
    els['btn-cancel-job-form'].addEventListener('click', () => {
      els['job-form'].hidden = true;
      els['btn-show-job-form'].hidden = false;
      state.editingJobId = null;
    });
    els['job-form'].addEventListener('submit', handleSaveJobForm);

    // 每日排班面板
    els['btn-close-day-panel'].addEventListener('click', closeDayPanel);
    els['day-panel-backdrop'].addEventListener('click', closeDayPanel);

    // 「這天有上班」勾選切換（若該日已有班次，取消勾選前先提示確認再清除）
    els['chk-has-work'].addEventListener('change', (e) => {
      const checked = e.target.checked;
      const dateStr = state.selectedDate;
      if (!dateStr) return;

      const dayShifts = state.shifts.filter((s) => s.date === dateStr);

      if (!checked && dayShifts.length > 0) {
        // 先還原勾選狀態，待使用者確認後再清除
        e.target.checked = true;
        openConfirmModal(
          '確定清除當日所有班次？',
          `${formatFullDateWithWeekday(dateStr)} 目前已有 ${dayShifts.length} 筆班次紀錄。取消勾選「這天有上班」將會清除當日所有班次，確定要清除嗎？`,
          () => {
            state.shifts = state.shifts.filter((s) => s.date !== dateStr);
            state.editingShiftId = null;
            state.draftShift = null;
            els['chk-has-work'].dataset.manualChecked = 'false';
            saveToStorage();
            renderAll();
            showToast('已清除當日班次紀錄');
          }
        );
        return;
      }

      els['chk-has-work'].dataset.manualChecked = checked ? 'true' : 'false';
      if (checked && dayShifts.length === 0) {
        startNewShift();
      } else if (!checked) {
        state.editingShiftId = null;
        state.draftShift = null;
        renderAll();
      } else {
        renderDayEditorPanel();
      }
    });

    els['btn-add-another-shift'].addEventListener('click', startNewShift);

    // 班次表單欄位變更即時預覽
    els['shift-job-select'].addEventListener('change', () => {
      // 新增班次時切換工作，自動帶入該工作的預設時間與時薪
      if (state.editingShiftId === '__NEW__') {
        const job = state.jobs.find((j) => j.id === els['shift-job-select'].value);
        if (job) applyJobDefaultsToShiftForm(job);
      }
      updateDraftShiftAndPreview();
    });

    ['shift-start-time', 'shift-end-time', 'shift-next-day', 'shift-break-mins'].forEach((id) => {
      els[id].addEventListener('input', updateDraftShiftAndPreview);
      els[id].addEventListener('change', updateDraftShiftAndPreview);
    });

    els['shift-form'].addEventListener('submit', handleSaveShiftForm);
    els['btn-cancel-shift'].addEventListener('click', handleCancelShiftForm);

    // 展開/收合薪資摘要明細
    els['btn-toggle-summary-detail'].addEventListener('click', () => {
      const drawer = els['summary-detail-drawer'];
      const expanded = !drawer.hidden;
      drawer.hidden = expanded;
      els['btn-toggle-summary-detail'].setAttribute('aria-expanded', String(!expanded));
      els['toggle-detail-text'].textContent = expanded ? '展開明細' : '收合明細';
    });

    // 資料備份 Modal
    els['btn-open-backup'].addEventListener('click', () => {
      els['import-error-msg'].hidden = true;
      els['backup-modal-backdrop'].hidden = false;
    });
    els['btn-close-backup-modal'].addEventListener('click', () => {
      els['backup-modal-backdrop'].hidden = true;
    });
    els['btn-export-json'].addEventListener('click', handleExportJson);
    els['input-import-json'].addEventListener('change', handleImportJsonFile);

    // 確認對話框
    els['btn-confirm-cancel'].addEventListener('click', closeConfirmModal);
    els['btn-confirm-ok'].addEventListener('click', () => {
      const fn = state.confirmCallback;
      closeConfirmModal();
      if (typeof fn === 'function') fn();
    });

    // 鍵盤 Escape 支援
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els['confirm-modal-backdrop'].hidden) {
          closeConfirmModal();
        } else if (!els['jobs-modal-backdrop'].hidden) {
          closeJobsModal();
        } else if (!els['backup-modal-backdrop'].hidden) {
          els['backup-modal-backdrop'].hidden = true;
        } else if (state.selectedDate) {
          closeDayPanel();
        }
      }
    });

    // 視窗尺寸改變時重新渲染月曆顯示筆數
    window.addEventListener('resize', () => {
      renderCalendar();
    });
  }

  // ==================== 啟動應用 ====================

  function init() {
    initDomRefs();
    loadFromStorage();
    initYearMonthSelectors();
    initColorPicker();
    bindEvents();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
