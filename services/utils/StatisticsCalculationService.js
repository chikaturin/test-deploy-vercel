class StatisticsCalculationService {
  static calculatePercentChange(currentValue, previousValue) {
    const diff = currentValue - previousValue;
    let percentChange = null;

    if (previousValue === 0) {
      percentChange = currentValue === 0 ? 0 : 100;
    } else {
      percentChange = (diff / previousValue) * 100;
    }

    return { diff, percentChange };
  }

  static calculateTodayYesterdayStats(todayCount, yesterdayCount) {
    const { diff, percentChange } = this.calculatePercentChange(todayCount, yesterdayCount);
    
    return {
      todayCount,
      yesterdayCount,
      diff,
      percentChange
    };
  }

  static calculateNFTStatusStats(nfts) {
    return {
      minted: nfts.filter((nft) => nft.status === "minted").length,
      transferred: nfts.filter((nft) => nft.status === "transferred").length,
      sold: nfts.filter((nft) => nft.status === "sold").length,
      expired: nfts.filter((nft) => nft.status === "expired").length,
      recalled: nfts.filter((nft) => nft.status === "recalled").length,
    };
  }

  static calculateStatusStats(items, statuses = null) {
    const stats = {};
    
    if (statuses) {
      statuses.forEach(status => {
        stats[status] = items.filter(item => item.status === status).length;
      });
    } else {
      items.forEach(item => {
        const status = item.status || 'unknown';
        stats[status] = (stats[status] || 0) + 1;
      });
    }

    return stats;
  }

  static calculateAveragePerDay(total, days) {
    return days > 0 ? total / days : 0;
  }
}

export default StatisticsCalculationService;

