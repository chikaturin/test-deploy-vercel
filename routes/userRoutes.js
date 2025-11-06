import express from "express";
import {
  getAllUsers,
  getUserById,
  getUserProfile,
  updateUserProfile,
  updateUser,
  changePassword,
  deleteUser,
  updateUserStatus,
  getUserStats,
  trackDrugByNFTId,
  getDrugInfo,
  searchDrugs,
} from "../controllers/userController.js";
import { authenticate, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/stats", authenticate, isAdmin, getUserStats);

router.get("/", authenticate, isAdmin, getAllUsers);

router.get("/profile", authenticate, getUserProfile);

router.put("/profile", authenticate, updateUserProfile);

router.put("/profile/change-password", authenticate, changePassword);

router.put("/:id", authenticate, isAdmin, updateUser);

router.put("/:id/status", authenticate, isAdmin, updateUserStatus);

router.delete("/:id", authenticate, isAdmin, deleteUser);

// ============ TRA CỨU THÔNG TIN (Cho user thông thường) ============
// Theo dõi hành trình thuốc qua NFT ID
router.get("/drugs/track/:tokenId", trackDrugByNFTId);

// Xem thông tin thuốc (có giới hạn)
router.get("/drugs/search", authenticate, searchDrugs);
router.get("/drugs/info", authenticate, getDrugInfo);

// Route getUserById phải đặt sau các routes cụ thể khác
router.get("/:id", authenticate, getUserById);

export default router;

