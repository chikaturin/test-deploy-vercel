import StatisticsFactory from "../services/statistics/StatisticsFactory.js";
import { handleStatisticsError } from "../utils/errorHandler.js";

export const getManufacturerDashboard = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "pharma_company"
    );
    const data = await strategy.getDashboard();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê dashboard manufacturer:", res);
  }
};

export const getDistributorDashboard = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "distributor"
    );
    const data = await strategy.getDashboard();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê dashboard distributor:", res);
  }
};

export const getPharmacyDashboard = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "pharmacy"
    );
    const data = await strategy.getDashboard();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê dashboard pharmacy:", res);
  }
};

export const getManufacturerSupplyChainStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "pharma_company"
    );
    const data = await strategy.getSupplyChainStats();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê chuỗi cung ứng:", res);
  }
};

export const getDistributorSupplyChainStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "distributor"
    );
    const data = await strategy.getSupplyChainStats();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê chuỗi cung ứng distributor:", res);
  }
};

export const getPharmacyQualityStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "pharmacy"
    );
    const data = await strategy.getQualityStats();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê chất lượng:", res);
  }
};

export const getBlockchainStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyForBlockchain(req.user);
    const data = await strategy.getBlockchainStats();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê blockchain:", res);
  }
};

export const getAlertsStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategy(req.user);
    const alerts = await strategy.getAlertsStats();

    const totalAlerts = Object.values(alerts).reduce((sum, val) => sum + val, 0);

    return res.status(200).json({
      success: true,
      data: {
        alerts,
        totalAlerts,
      },
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê cảnh báo:", res);
  }
};

export const getMonthlyTrends = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const monthsCount = parseInt(months);

    const strategy = await StatisticsFactory.createStrategy(req.user);
    const trends = await strategy.getMonthlyTrends(monthsCount);

    return res.status(200).json({
      success: true,
      data: {
        trends,
        period: `${monthsCount} tháng gần nhất`,
      },
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê xu hướng:", res);
  }
};

export const getProductAnalytics = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategyWithRoleValidation(
      req.user,
      "pharma_company"
    );
    const data = await strategy.getProductAnalytics();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê sản phẩm:", res);
  }
};

export const getPerformanceMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const strategy = await StatisticsFactory.createStrategy(req.user);
    const metrics = await strategy.getPerformanceMetrics(startDate, endDate);

    const start = startDate ? new Date(startDate) : new Date();
    start.setMonth(start.getMonth() - 1);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    return res.status(200).json({
      success: true,
      data: {
        period: {
          from: start,
          to: end,
        },
        metrics,
      },
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê hiệu suất:", res);
  }
};

export const getComplianceStats = async (req, res) => {
  try {
    const strategy = await StatisticsFactory.createStrategy(req.user);
    const compliance = await strategy.getComplianceStats();

    return res.status(200).json({
      success: true,
      data: {
        compliance,
      },
    });
  } catch (error) {
    return handleStatisticsError(error, "Lỗi khi lấy thống kê tuân thủ:", res);
  }
};
