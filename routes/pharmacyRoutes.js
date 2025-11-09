import express from "express";
import {
  getInvoicesFromDistributor,
  confirmReceipt,
  getDistributionHistory,
  getStatistics,
  trackDrugByNFTId,
  getDrugs,
  searchDrugByATCCode,
  getPharmacyProfile,
  pharmacyChartOneWeek,
  pharmacyChartTodayYesterday,
  getPharmacyInvoicesByDateRange,
  getPharmacyReceiptsByDateRange,
} from "../controllers/pharmacyController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Middleware: chỉ pharmacy mới có thể truy cập
const isPharmacy = authorize("pharmacy");

// Tất cả routes đều cần authenticate và là pharmacy
router.use(authenticate);
router.use(isPharmacy);

// ============ QUẢN LÝ ĐƠN HÀNG TỪ DISTRIBUTOR ============
router.get("/invoices", getInvoicesFromDistributor);
router.post("/invoices/confirm-receipt", confirmReceipt);

// ============ LỊCH SỬ VÀ THỐNG KÊ ============
router.get("/distribution/history", getDistributionHistory);
router.get("/statistics", getStatistics);
router.get("/track/:tokenId", trackDrugByNFTId);

// ============ THỐNG KÊ CHART ============
router.get("/chart/one-week", pharmacyChartOneWeek);
router.get("/chart/today-yesterday", pharmacyChartTodayYesterday);
router.get("/chart/invoices-by-date-range", getPharmacyInvoicesByDateRange);
router.get("/chart/receipts-by-date-range", getPharmacyReceiptsByDateRange);

// ============ QUẢN LÝ THUỐC ============
router.get("/drugs", getDrugs);

// ============ QUẢN LÝ THÔNG TIN CÁ NHÂN ============
router.get("/profile", getPharmacyProfile);

export default router;

