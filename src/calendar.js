/**
 * 独立日历窗口（悬浮置顶）
 * 逻辑迁移自 dashboard.js 内嵌日历弹窗，行为保持一致。
 */

// 当前显示的年月
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

// 节假日数据
const holidays = {
  '2026-06-19': '端午节'
};

// 农历日期映射
const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
                   '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                   '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

/**
 * 获取简单的农历日期（简化版）
 */
function getLunarDate(year, month, day) {
  const lunarMonthIndex = (month + 2) % 12;
  const lunarDayIndex = (day - 1) % 30;
  return `${lunarMonths[lunarMonthIndex]}${lunarDays[lunarDayIndex]}`;
}

/**
 * 添加日历日期格子
 */
function addCalendarDay(container, year, month, day, isOtherMonth, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay) {
  const dayElement = document.createElement('div');
  dayElement.className = 'calendar-day';
  dayElement.dataset.year = year;
  dayElement.dataset.month = month;
  dayElement.dataset.day = day;

  if (isOtherMonth) {
    dayElement.classList.add('other-month');
  }

  if (year === todayYear && month === todayMonth && day === todayDay) {
    dayElement.classList.add('today');
  }

  if (year === selectedYear && month === selectedMonth && day === selectedDay) {
    dayElement.classList.add('selected');
  }

  const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holidayName = holidays[dateKey];

  const daySpan = document.createElement('span');
  daySpan.textContent = day;
  dayElement.appendChild(daySpan);

  const lunarSpan = document.createElement('span');
  if (holidayName) {
    lunarSpan.textContent = holidayName;
    dayElement.classList.add('holiday');
  } else {
    const lunarDate = getLunarDate(year, month, day);
    lunarSpan.textContent = lunarDate.replace(/[正二三四五六七八九十冬腊]月/, '');
  }
  dayElement.appendChild(lunarSpan);

  dayElement.addEventListener('click', () => {
    const selectedDays = document.querySelectorAll('.calendar-day.selected');
    selectedDays.forEach((el) => el.classList.remove('selected'));
    dayElement.classList.add('selected');
  });

  container.appendChild(dayElement);
}

/**
 * 渲染日历
 */
function renderCalendar(year, month) {
  const daysContainer = document.getElementById('calendar-days');
  const monthYearElement = document.getElementById('calendar-month-year');
  const dateMainElement = document.getElementById('calendar-date-main');
  const dateLunarElement = document.getElementById('calendar-date-lunar');

  if (!daysContainer || !monthYearElement) return;

  monthYearElement.textContent = `${year}年${month + 1}月`;

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();

  if (dateMainElement && dateLunarElement) {
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekDays[now.getDay()];
    dateMainElement.textContent = `${todayMonth + 1}月${todayDay}日, ${weekday}`;
    dateLunarElement.textContent = getLunarDate(todayYear, todayMonth, todayDay);
  }

  let selectedDate = document.querySelector('.calendar-day.selected');
  let selectedYear = year;
  let selectedMonth = month;
  let selectedDay = todayDay;

  if (selectedDate) {
    selectedYear = parseInt(selectedDate.dataset.year);
    selectedMonth = parseInt(selectedDate.dataset.month);
    selectedDay = parseInt(selectedDate.dataset.day);
  }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  daysContainer.innerHTML = '';

  let startDay = firstDay.getDay();
  if (startDay === 0) startDay = 7;
  startDay -= 1;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    addCalendarDay(daysContainer, prevYear, prevMonth, day, true, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    addCalendarDay(daysContainer, year, month, day, false, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }

  const remainingCells = 42 - daysContainer.children.length;
  for (let day = 1; day <= remainingCells; day++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    addCalendarDay(daysContainer, nextYear, nextMonth, day, true, todayYear, todayMonth, todayDay, selectedYear, selectedMonth, selectedDay);
  }
}

/**
 * 更新日历窗口内的时钟（精确到秒）
 */
function updateClock() {
  const calendarTime = document.getElementById('calendar-time');
  if (!calendarTime) return;
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  calendarTime.textContent = `${hours}:${minutes}:${seconds}`;
}

/**
 * 主题下发
 */
function applyTheme(theme, accentColor) {
  document.body.classList.toggle('theme-bright', theme === 'bright');
  if (accentColor) {
    document.documentElement.style.setProperty('--accent-color', accentColor);
  }
}

/**
 * 初始化
 */
function init() {
  updateClock();
  setInterval(updateClock, 1000);
  renderCalendar(currentCalendarYear, currentCalendarMonth);

  document.getElementById('calendar-prev-month').addEventListener('click', () => {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
      currentCalendarMonth = 11;
      currentCalendarYear--;
    }
    renderCalendar(currentCalendarYear, currentCalendarMonth);
  });

  document.getElementById('calendar-next-month').addEventListener('click', () => {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) {
      currentCalendarMonth = 0;
      currentCalendarYear++;
    }
    renderCalendar(currentCalendarYear, currentCalendarMonth);
  });

  // 主题由主进程在窗口加载后下发
  window.electronAPI.calendar.onTheme(({ theme, accentColor }) => {
    applyTheme(theme, accentColor);
  });

  // ESC 关闭窗口
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.electronAPI.calendar.hide();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
