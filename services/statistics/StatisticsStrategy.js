class StatisticsStrategy {
  constructor(user, businessEntity) {
    this.user = user;
    this.businessEntity = businessEntity;
  }

  async getDashboard() {
    throw new Error("Method getDashboard() must be implemented");
  }

  async getSupplyChainStats() {
    throw new Error("Method getSupplyChainStats() must be implemented");
  }

  async getAlertsStats() {
    throw new Error("Method getAlertsStats() must be implemented");
  }

  async getBlockchainStats() {
    throw new Error("Method getBlockchainStats() must be implemented");
  }

  async getMonthlyTrends(months) {
    throw new Error("Method getMonthlyTrends() must be implemented");
  }


  async getPerformanceMetrics(startDate, endDate) {
    throw new Error("Method getPerformanceMetrics() must be implemented");
  }


  async getComplianceStats() {
    throw new Error("Method getComplianceStats() must be implemented");
  }


  getFilter() {
    throw new Error("Method getFilter() must be implemented");
  }

  async validate() {
    if (!this.user) {
      throw new Error("User is required");
    }
    if (!this.businessEntity) {
      throw new Error("Business entity is required");
    }
    return true;
  }
}

export default StatisticsStrategy;

