import express from "express";
import {
  // Quản lý thuốc
  addDrug,
  updateDrug,
  deleteDrug,
  getDrugs,
  getDrugById,
  searchDrugByATCCode,
  
  // Quản lý sản xuất và phân phối
  packageDrug,
  transferToDistributor,
  getProductionHistory,
  getTransferHistory,
  getStatistics,
  
  // Quản lý thông tin cá nhân
  getPharmaCompanyInfo,
  
  // Danh sách distributors
  getDistributors,
} from "../controllers/pharmaCompanyController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Middleware: chỉ pharma_company mới có thể truy cập
const isPharmaCompany = authorize("pharma_company");

// Tất cả routes đều cần authenticate và là pharma_company
router.use(authenticate);
router.use(isPharmaCompany);

// ============ QUẢN LÝ THUỐC ============
router.post("/drugs", addDrug);
router.get("/drugs", getDrugs);
router.get("/drugs/search", searchDrugByATCCode);
router.get("/drugs/:drugId", getDrugById);
router.put("/drugs/:drugId", updateDrug);
router.delete("/drugs/:drugId", deleteDrug);

// ============ QUẢN LÝ SẢN XUẤT VÀ PHÂN PHỐI ============
router.post("/production/package", packageDrug);
router.post("/production/transfer", transferToDistributor);
router.get("/production/history", getProductionHistory);
router.get("/transfer/history", getTransferHistory);
router.get("/statistics", getStatistics);

// ============ QUẢN LÝ THÔNG TIN CÁ NHÂN ============
router.get("/profile", getPharmaCompanyInfo);

// ============ DANH SÁCH DISTRIBUTORS ============
router.get("/distributors", getDistributors);

export default router;

