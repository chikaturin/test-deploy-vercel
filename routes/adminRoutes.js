import express from "express";
import {
  getRegistrationStatistics,
  retryBlockchainRegistration,
  getAllDrugs,
  getDrugDetails,
  getDrugStatistics,
  getSupplyChainHistory,
  getDistributionHistory,
  getSystemStatistics,
  getBatchList,
  getBatchJourney,
  getNFTJourney,
} from "../controllers/adminController.js";
import { authenticate, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Tất cả routes đều cần authenticate và là admin
router.use(authenticate);
router.use(isAdmin);

// ============ QUẢN LÝ ĐƠN ĐĂNG KÝ ============
router.get("/registration/statistics", getRegistrationStatistics);
router.post("/registration/:requestId/retry-blockchain", retryBlockchainRegistration);

// ============ QUẢN LÝ THUỐC ============
router.get("/drugs", getAllDrugs);
router.get("/drugs/statistics", getDrugStatistics);
router.get("/drugs/:drugId", getDrugDetails);

// ============ GIÁM SÁT HỆ THỐNG ============
router.get("/supply-chain/history", getSupplyChainHistory);
router.get("/distribution/history", getDistributionHistory);
router.get("/statistics", getSystemStatistics);

// ============ BATCH TRACKING ============
router.get("/batch-tracking/batches", getBatchList);
router.get("/batch-tracking/batches/:batchNumber/journey", getBatchJourney);
router.get("/batch-tracking/nft/:tokenId/journey", getNFTJourney);

export default router;

