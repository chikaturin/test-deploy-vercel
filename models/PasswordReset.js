import mongoose from "mongoose";

const PasswordResetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    ipAddress: {
      type: String,
      required: false,
    },
    userAgent: {
      type: String,
      required: false,
    },
    // Thông tin xác thực cho pharma_company, distributor, pharmacy
    verificationInfo: {
      licenseNo: {
        type: String,
        required: false,
      },
      taxCode: {
        type: String,
        required: false,
      },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    reviewedAt: {
      type: Date,
      required: false,
    },
    newPassword: {
      type: String,
      required: false,
    }, // Mật khẩu mới được tạo khi admin duyệt
  },
  { timestamps: true }
);

export default mongoose.model("PasswordReset", PasswordResetSchema);

