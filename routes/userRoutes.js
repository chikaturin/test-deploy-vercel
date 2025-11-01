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
} from "../controllers/userController.js";
import { authenticate, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/stats", authenticate, isAdmin, getUserStats);

router.get("/", authenticate, isAdmin, getAllUsers);

router.get("/profile", authenticate, getUserProfile);

router.get("/:id", authenticate, getUserById);

router.put("/profile", authenticate, updateUserProfile);

router.put("/profile/change-password", authenticate, changePassword);

router.put("/:id", authenticate, isAdmin, updateUser);

router.put("/:id/status", authenticate, isAdmin, updateUserStatus);

router.delete("/:id", authenticate, isAdmin, deleteUser);

export default router;

