import express from "express";
import {
  login,
  getCurrentUser,
  logout,
  registerUser,
  registerAdmin,
  registerPharmaCompany,
  registerDistributor,
  registerPharmacy,
  approveRegistration,
  rejectRegistration,
  getRegistrationRequests,
  getRegistrationRequestById,
  forgotPassword,
  approvePasswordReset,
  rejectPasswordReset,
  resetPassword,
  getPasswordResetRequests,
} from "../controllers/authController.js";
import { authenticate, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", login);

router.get("/me", authenticate, getCurrentUser);

router.post("/logout", authenticate, logout);

router.post("/register/user", registerUser);

router.post("/register/admin", registerAdmin);

router.post("/register/pharma-company", registerPharmaCompany);

router.post("/register/distributor", registerDistributor);

router.post("/register/pharmacy", registerPharmacy);

router.get("/registration-requests", authenticate, isAdmin, getRegistrationRequests);

router.get("/registration-requests/:requestId", authenticate, isAdmin, getRegistrationRequestById);

router.post("/registration-requests/:requestId/approve", authenticate, isAdmin, approveRegistration);

router.post("/registration-requests/:requestId/reject", authenticate, isAdmin, rejectRegistration);

// Quên mật khẩu và reset mật khẩu
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/password-reset-requests", authenticate, isAdmin, getPasswordResetRequests);
router.post("/password-reset-requests/:resetRequestId/approve", authenticate, isAdmin, approvePasswordReset);
router.post("/password-reset-requests/:resetRequestId/reject", authenticate, isAdmin, rejectPasswordReset);

export default router;

