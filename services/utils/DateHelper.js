class DateHelper {
  static parseDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      throw new Error("Vui lòng cung cấp startDate và endDate");
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Ngày không hợp lệ");
    }

    if (start > end) {
      throw new Error("startDate phải nhỏ hơn hoặc bằng endDate");
    }

    return { start, end };
  }

  static getTodayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  static getYesterdayRange() {
    const today = this.getTodayRange();
    const start = new Date(today.start);
    start.setDate(start.getDate() - 1);
    const end = new Date(today.start);
    end.setTime(end.getTime() - 1);
    return { start, end };
  }


  static getWeekRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  /**
   * Lấy start và end của một ngày cụ thể
   */
  static getDayRange(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }


  static getDaysDifference(startDate, endDate) {
    return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  }

  static formatDate(date) {
    return date.toISOString().split('T')[0];
  }
}

export default DateHelper;

