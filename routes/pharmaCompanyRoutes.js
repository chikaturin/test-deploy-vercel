import express from "express";
import {
  addDrug,
  updateDrug,
  deleteDrug,
  getDrugs,
  getDrugById,
  searchDrugByATCCode,
  uploadDrugPackageToIPFS,
  saveMintedNFTs,
  transferToDistributor,
  saveTransferTransaction,
  getProductionHistory,
  getTransferHistory,
  getStatistics,
  getPharmaCompanyInfo,
  getDistributors,
  getAvailableTokensForProduction,
  pharmaCompanyChart1Week,
  pharmaCompanyChartTodayYesterday,
  getProofOfProductionByDateRange,
  getProofOfDistributionByDateRange,
  getManufactureIPFSStatus,
  getManufacturerTransfersByDateRange,
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
// Bước 1: Upload folder lên IPFS
router.post("/production/upload-ipfs", uploadDrugPackageToIPFS);
// Bước 2: Lưu NFT vào DB sau khi mint thành công (FE đã gọi smart contract)
router.post("/production/save-minted", saveMintedNFTs);
// Chuyển giao: Bước 1 - Lưu invoice với status pending
router.post("/production/transfer", transferToDistributor);
// Chuyển giao: Bước 2 - Lưu transactionHash sau khi FE gọi smart contract thành công
router.post("/production/save-transfer", saveTransferTransaction);
router.get("/production/history", getProductionHistory);
// Danh sách tokenId còn khả dụng theo lô
router.get("/production/:productionId/available-tokens", getAvailableTokensForProduction);
router.get("/transfer/history", getTransferHistory);
router.get("/statistics", getStatistics);

// ============ THỐNG KÊ CHART ============
router.get("/chart/one-week", pharmaCompanyChart1Week);
router.get("/chart/today-yesterday", pharmaCompanyChartTodayYesterday);
router.get("/chart/productions-by-date-range", getProofOfProductionByDateRange);
router.get("/chart/distributions-by-date-range", getProofOfDistributionByDateRange);
router.get("/chart/transfers-by-date-range", getManufacturerTransfersByDateRange);

// ============ QUẢN LÝ THÔNG TIN CÁ NHÂN ============
router.get("/profile", getPharmaCompanyInfo);

// ============ DANH SÁCH DISTRIBUTORS ============
router.get("/distributors", getDistributors);

// ============ QUẢN LÝ IPFS ============
router.get("/ipfs-status", getManufactureIPFSStatus);

export default router;

