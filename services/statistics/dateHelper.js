export const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const getWeekRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return { start, end: now };
};

export const getMonthRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(now.getMonth() - 1);
  return { start, end: now };
};

export const getYearRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 1);
  return { start, end: now };
};

export const getDayRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const getDaysInRange = (daysCount) => {
  const now = new Date();
  const days = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    days.push(getDayRange(date));
  }
  return days;
};


export const getMonthRangeByIndex = (monthIndex) => {
  const now = new Date();
  const date = new Date(now);
  date.setMonth(date.getMonth() - monthIndex);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return { start, end, month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` };
};

/**
 * Lấy danh sách các tháng trong khoảng thời gian
 */
export const getMonthsInRange = (monthsCount) => {
  const months = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    months.push(getMonthRangeByIndex(i));
  }
  return months;
};

export const getDaysDifference = (startDate, endDate) => {
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
};

export const getThirtyDaysFromNow = () => {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + 30);
  return future;
};

