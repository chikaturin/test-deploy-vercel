import User from "../models/User.js";
import RegistrationRequest from "../models/RegistrationRequest.js";
import PasswordReset from "../models/PasswordReset.js";
import PharmaCompany from "../models/PharmaCompany.js";
import Distributor from "../models/Distributor.js";
import Pharmacy from "../models/Pharmacy.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateToken } from "../utils/jwt.js";
import {
  addManufacturerToBlockchain,
  addDistributorToBlockchain,
  addPharmacyToBlockchain,
} from "../services/blockchainService.js";
import {
  sendPasswordResetEmail,
  sendPasswordResetApprovedEmail,
  sendNewPasswordEmail,
} from "../services/emailService.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp email và password",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản của bạn đang chờ phê duyệt. Vui lòng đợi admin phê duyệt",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: `Tài khoản của bạn đang ở trạng thái: ${user.status}`,
      });
    }

    let businessProfile = null;

    if (user.role === "pharma_company" && user.pharmaCompany) {
      businessProfile = await PharmaCompany.findById(user.pharmaCompany);
    } else if (user.role === "distributor" && user.distributor) {
      businessProfile = await Distributor.findById(user.distributor);
    } else if (user.role === "pharmacy" && user.pharmacy) {
      businessProfile = await Pharmacy.findById(user.pharmacy);
    }

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: userResponse,
        businessProfile: businessProfile ? {
          id: businessProfile._id,
          name: businessProfile.name,
          licenseNo: businessProfile.licenseNo,
          taxCode: businessProfile.taxCode,
          status: businessProfile.status,
        } : null,
        token,
      },
    });
  } catch (error) {
    console.error("Lỗi khi đăng nhập:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng nhập",
      error: error.message,
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;

    let businessProfile = null;

    if (user.role === "pharma_company" && user.pharmaCompany) {
      businessProfile = await PharmaCompany.findById(user.pharmaCompany);
    } else if (user.role === "distributor" && user.distributor) {
      businessProfile = await Distributor.findById(user.distributor);
    } else if (user.role === "pharmacy" && user.pharmacy) {
      businessProfile = await Pharmacy.findById(user.pharmacy);
    }

    const userResponse = user.toObject();

    return res.status(200).json({
      success: true,
      data: {
        user: userResponse,
        businessProfile: businessProfile ? {
          id: businessProfile._id,
          name: businessProfile.name,
          licenseNo: businessProfile.licenseNo,
          taxCode: businessProfile.taxCode,
          status: businessProfile.status,
        } : null,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin người dùng",
      error: error.message,
    });
  }
};

export const logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Đăng xuất thành công",
    });
  } catch (error) {
    console.error("Lỗi khi đăng xuất:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng xuất",
      error: error.message,
    });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { username, email, password, fullName, phone, country, address } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: username, email, password",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc username đã tồn tại",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      phone: phone || "",
      country: country || "",
      address: address || "",
      role: "user",
      status: "active",
    });

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản người dùng thành công",
      data: userResponse,
    });
  } catch (error) {
    console.error("Lỗi khi đăng ký người dùng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký người dùng",
      error: error.message,
    });
  }
};

export const registerAdmin = async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: username, email, password",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc username đã tồn tại",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      role: "system_admin",
      isAdmin: true,
      status: "active",
    });

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản admin thành công",
      data: userResponse,
    });
  } catch (error) {
    console.error("Lỗi khi đăng ký admin:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký admin",
      error: error.message,
    });
  }
};

export const registerPharmaCompany = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      walletAddress,
      taxCode,
      licenseNo,
      name,
      gmpCertNo,
      country,
      address,
      contactEmail,
      contactPhone,
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: username, email, password",
      });
    }

    if (!walletAddress || !taxCode || !licenseNo) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: walletAddress, taxCode, licenseNo",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc username đã tồn tại",
      });
    }

    const existingBusiness = await PharmaCompany.findOne({
      $or: [{ licenseNo }, { taxCode }],
    });

    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: "LicenseNo hoặc TaxCode đã được sử dụng",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      role: "pharma_company",
      walletAddress,
      status: "pending",
    });

    await user.save();

    const registrationRequest = new RegistrationRequest({
      user: user._id,
      role: "pharma_company",
      status: "pending",
      companyInfo: {
        name: name || fullName || "",
        licenseNo,
        taxCode,
        gmpCertNo: gmpCertNo || "",
        country: country || "",
        address: address || "",
        contactEmail: contactEmail || email,
        contactPhone: contactPhone || "",
      },
    });

    await registrationRequest.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Đăng ký nhà sản xuất thành công. Yêu cầu của bạn đang chờ phê duyệt",
      data: {
        user: userResponse,
        registrationRequest: {
          id: registrationRequest._id,
          status: registrationRequest.status,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi đăng ký nhà sản xuất:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký nhà sản xuất",
      error: error.message,
    });
  }
};

export const registerDistributor = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      walletAddress,
      taxCode,
      licenseNo,
      name,
      country,
      address,
      contactEmail,
      contactPhone,
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: username, email, password",
      });
    }

    if (!walletAddress || !taxCode || !licenseNo) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: walletAddress, taxCode, licenseNo",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc username đã tồn tại",
      });
    }

    const existingBusiness = await Distributor.findOne({
      $or: [{ licenseNo }, { taxCode }],
    });

    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: "LicenseNo hoặc TaxCode đã được sử dụng",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      role: "distributor",
      walletAddress,
      status: "pending",
    });

    await user.save();

    const registrationRequest = new RegistrationRequest({
      user: user._id,
      role: "distributor",
      status: "pending",
      companyInfo: {
        name: name || fullName || "",
        licenseNo,
        taxCode,
        country: country || "",
        address: address || "",
        contactEmail: contactEmail || email,
        contactPhone: contactPhone || "",
      },
    });

    await registrationRequest.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Đăng ký nhà phân phối thành công. Yêu cầu của bạn đang chờ phê duyệt",
      data: {
        user: userResponse,
        registrationRequest: {
          id: registrationRequest._id,
          status: registrationRequest.status,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi đăng ký nhà phân phối:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký nhà phân phối",
      error: error.message,
    });
  }
};

export const registerPharmacy = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      walletAddress,
      taxCode,
      licenseNo,
      name,
      country,
      address,
      contactEmail,
      contactPhone,
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: username, email, password",
      });
    }

    if (!walletAddress || !taxCode || !licenseNo) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin: walletAddress, taxCode, licenseNo",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email hoặc username đã tồn tại",
      });
    }

    const existingBusiness = await Pharmacy.findOne({
      $or: [{ licenseNo }, { taxCode }],
    });

    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: "LicenseNo hoặc TaxCode đã được sử dụng",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName: fullName || "",
      role: "pharmacy",
      walletAddress,
      status: "pending",
    });

    await user.save();

    const registrationRequest = new RegistrationRequest({
      user: user._id,
      role: "pharmacy",
      status: "pending",
      companyInfo: {
        name: name || fullName || "",
        licenseNo,
        taxCode,
        country: country || "",
        address: address || "",
        contactEmail: contactEmail || email,
        contactPhone: contactPhone || "",
      },
    });

    await registrationRequest.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Đăng ký nhà thuốc thành công. Yêu cầu của bạn đang chờ phê duyệt",
      data: {
        user: userResponse,
        registrationRequest: {
          id: registrationRequest._id,
          status: registrationRequest.status,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi đăng ký nhà thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng ký nhà thuốc",
      error: error.message,
    });
  }
};

export const approveRegistration = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user?.id;

    const registrationRequest = await RegistrationRequest.findById(requestId).populate("user");

    if (!registrationRequest) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    if (registrationRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Yêu cầu này đã được xử lý với trạng thái: ${registrationRequest.status}`,
      });
    }

    const user = registrationRequest.user;
    const { role, companyInfo } = registrationRequest;

    if (!user.walletAddress || !companyInfo?.taxCode || !companyInfo?.licenseNo) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết: walletAddress, taxCode, licenseNo",
      });
    }

    registrationRequest.status = "approved_pending_blockchain";
    registrationRequest.reviewedBy = adminId;
    registrationRequest.reviewedAt = new Date();
    await registrationRequest.save();

    let blockchainResult;
    try {
      if (role === "pharma_company") {
        blockchainResult = await addManufacturerToBlockchain(
          user.walletAddress,
          companyInfo.taxCode,
          companyInfo.licenseNo
        );
      } else if (role === "distributor") {
        blockchainResult = await addDistributorToBlockchain(
          user.walletAddress,
          companyInfo.taxCode,
          companyInfo.licenseNo
        );
      } else if (role === "pharmacy") {
        blockchainResult = await addPharmacyToBlockchain(
          user.walletAddress,
          companyInfo.taxCode,
          companyInfo.licenseNo
        );
      }

      registrationRequest.status = "approved";
      registrationRequest.contractAddress = blockchainResult.receipt.to;
      registrationRequest.transactionHash = blockchainResult.transactionHash;

      let businessProfile;
      if (role === "pharma_company") {
        businessProfile = new PharmaCompany({
          user: user._id,
          name: companyInfo.name || user.fullName || "",
          licenseNo: companyInfo.licenseNo,
          taxCode: companyInfo.taxCode,
          gmpCertNo: companyInfo.gmpCertNo || "",
          country: companyInfo.country || user.country || "",
          address: companyInfo.address || user.address || "",
          contactEmail: companyInfo.contactEmail || user.email || "",
          contactPhone: companyInfo.contactPhone || user.phone || "",
          walletAddress: user.walletAddress,
          status: "active",
        });
      } else if (role === "distributor") {
        businessProfile = new Distributor({
          user: user._id,
          name: companyInfo.name || user.fullName || "",
          licenseNo: companyInfo.licenseNo,
          taxCode: companyInfo.taxCode,
          address: companyInfo.address || user.address || "",
          country: companyInfo.country || user.country || "",
          contactEmail: companyInfo.contactEmail || user.email || "",
          contactPhone: companyInfo.contactPhone || user.phone || "",
          walletAddress: user.walletAddress,
          status: "active",
        });
      } else if (role === "pharmacy") {
        businessProfile = new Pharmacy({
          user: user._id,
          name: companyInfo.name || user.fullName || "",
          licenseNo: companyInfo.licenseNo,
          taxCode: companyInfo.taxCode,
          address: companyInfo.address || user.address || "",
          country: companyInfo.country || user.country || "",
          contactEmail: companyInfo.contactEmail || user.email || "",
          contactPhone: companyInfo.contactPhone || user.phone || "",
          walletAddress: user.walletAddress,
          status: "active",
        });
      }

      await businessProfile.save();

      user.status = "active";
      if (role === "pharma_company") {
        user.pharmaCompany = businessProfile._id;
      } else if (role === "distributor") {
        user.distributor = businessProfile._id;
      } else if (role === "pharmacy") {
        user.pharmacy = businessProfile._id;
      }
      await user.save();

      await registrationRequest.save();

      return res.status(200).json({
        success: true,
        message: "Phê duyệt và đăng ký trên blockchain thành công",
        data: {
          registrationRequest: {
            id: registrationRequest._id,
            status: registrationRequest.status,
            transactionHash: registrationRequest.transactionHash,
          },
          businessProfile: {
            id: businessProfile._id,
            name: businessProfile.name,
          },
        },
      });
    } catch (blockchainError) {
      console.error("Lỗi khi gửi lên blockchain:", blockchainError);

      registrationRequest.status = "blockchain_failed";
      registrationRequest.blockchainRetryCount += 1;
      registrationRequest.blockchainLastAttempt = new Date();
      await registrationRequest.save();

      return res.status(500).json({
        success: false,
        message: "Phê duyệt thành công nhưng gặp lỗi khi gửi lên blockchain",
        error: blockchainError.message,
        registrationRequestId: registrationRequest._id,
      });
    }
  } catch (error) {
    console.error("Lỗi khi phê duyệt đăng ký:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi phê duyệt đăng ký",
      error: error.message,
    });
  }
};

export const rejectRegistration = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user?.id;

    const registrationRequest = await RegistrationRequest.findById(requestId);

    if (!registrationRequest) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    if (registrationRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Yêu cầu này đã được xử lý với trạng thái: ${registrationRequest.status}`,
      });
    }

    registrationRequest.status = "rejected";
    registrationRequest.reviewedBy = adminId;
    registrationRequest.reviewedAt = new Date();
    registrationRequest.rejectionReason = rejectionReason || "";

    await registrationRequest.save();

    const user = await User.findById(registrationRequest.user);
    if (user) {
      user.status = "inactive";
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "Yêu cầu đăng ký đã bị từ chối",
      data: {
        id: registrationRequest._id,
        status: registrationRequest.status,
        rejectionReason: registrationRequest.rejectionReason,
      },
    });
  } catch (error) {
    console.error("Lỗi khi từ chối đăng ký:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi từ chối đăng ký",
      error: error.message,
    });
  }
};

export const getRegistrationRequests = async (req, res) => {
  try {
    const { status, role } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (role) {
      filter.role = role;
    }

    const requests = await RegistrationRequest.find(filter)
      .populate("user", "username email fullName walletAddress")
      .populate("reviewedBy", "username email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách yêu cầu",
      error: error.message,
    });
  }
};

export const getRegistrationRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await RegistrationRequest.findById(requestId)
      .populate("user", "username email fullName walletAddress phone country address")
      .populate("reviewedBy", "username email");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu đăng ký",
      });
    }

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin yêu cầu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin yêu cầu",
      error: error.message,
    });
  }
};

// Quên mật khẩu - tạo yêu cầu reset (cần admin xác nhận cho pharma_company, distributor, pharmacy)
export const forgotPassword = async (req, res) => {
  try {
    const { email, licenseNo, taxCode } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp email",
      });
    }

    const user = await User.findOne({ email }).populate("pharmaCompany").populate("distributor").populate("pharmacy");
    if (!user) {
      // Không tiết lộ email có tồn tại hay không vì lý do bảo mật
      return res.status(200).json({
        success: true,
        message: "Nếu email tồn tại, yêu cầu reset mật khẩu đã được gửi. Vui lòng chờ admin xác nhận.",
      });
    }

    // pharma_company, distributor, pharmacy cần admin xác nhận và yêu cầu thông tin công ty
    if (["pharma_company", "distributor", "pharmacy"].includes(user.role)) {
      if (!licenseNo || !taxCode) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng cung cấp licenseNo và taxCode để xác thực",
        });
      }

      // Xác thực thông tin công ty
      let businessProfile = null;
      if (user.role === "pharma_company" && user.pharmaCompany) {
        businessProfile = user.pharmaCompany;
      } else if (user.role === "distributor" && user.distributor) {
        businessProfile = user.distributor;
      } else if (user.role === "pharmacy" && user.pharmacy) {
        businessProfile = user.pharmacy;
      }

      if (!businessProfile) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy thông tin công ty của người dùng",
        });
      }

      // Kiểm tra licenseNo và taxCode có khớp không
      if (businessProfile.licenseNo !== licenseNo || businessProfile.taxCode !== taxCode) {
        return res.status(400).json({
          success: false,
          message: "Thông tin licenseNo hoặc taxCode không đúng",
        });
      }

      // Tạo token reset
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Token hết hạn sau 24 giờ

      // Xóa các token cũ chưa sử dụng
      await PasswordReset.deleteMany({
        user: user._id,
        status: "pending",
        used: false,
      });

      // Tạo password reset request với thông tin xác thực
      const passwordReset = new PasswordReset({
        user: user._id,
        token: resetToken,
        expiresAt,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        verificationInfo: {
          licenseNo,
          taxCode,
        },
        status: "pending",
      });

      await passwordReset.save();

      return res.status(200).json({
        success: true,
        message: "Yêu cầu reset mật khẩu đã được tạo. Vui lòng chờ admin xác nhận.",
        data: {
          resetRequestId: passwordReset._id,
          expiresAt: passwordReset.expiresAt,
        },
      });
    } else {
      // User thông thường không cần admin xác nhận
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token hết hạn sau 1 giờ

      await PasswordReset.deleteMany({
        user: user._id,
        used: false,
        expiresAt: { $gt: new Date() },
      });

      const passwordReset = new PasswordReset({
        user: user._id,
        token: resetToken,
        expiresAt,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
      });

      await passwordReset.save();

      // Gửi email với reset token
      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;
      try {
        await sendPasswordResetEmail(user.email, resetToken, resetUrl);
      } catch (emailError) {
        console.error("Lỗi khi gửi email reset mật khẩu:", emailError);
        // Vẫn trả về success để không tiết lộ thông tin về email
      }

      return res.status(200).json({
        success: true,
        message: "Yêu cầu reset mật khẩu đã được tạo. Vui lòng kiểm tra email.",
      });
    }
  } catch (error) {
    console.error("Lỗi khi tạo yêu cầu reset mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo yêu cầu reset mật khẩu",
      error: error.message,
    });
  }
};

// Admin xác nhận yêu cầu reset mật khẩu của pharma_company, distributor, pharmacy
export const approvePasswordReset = async (req, res) => {
  try {
    const adminUser = req.user;
    
    if (adminUser.role !== "system_admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có admin mới có thể xác nhận yêu cầu reset mật khẩu",
      });
    }

    const { resetRequestId } = req.params;

    const passwordReset = await PasswordReset.findById(resetRequestId)
      .populate("user")
      .populate({
        path: "user",
        populate: [
          { path: "pharmaCompany" },
          { path: "distributor" },
          { path: "pharmacy" },
        ],
      });

    if (!passwordReset) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu reset mật khẩu",
      });
    }

    if (passwordReset.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu reset mật khẩu này đã được duyệt",
      });
    }

    if (passwordReset.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu reset mật khẩu này đã bị từ chối",
      });
    }

    if (new Date() > passwordReset.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "Token reset mật khẩu đã hết hạn",
      });
    }

    const user = passwordReset.user;
    if (!["pharma_company", "distributor", "pharmacy"].includes(user.role)) {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu reset mật khẩu này không thuộc về pharma_company, distributor hoặc pharmacy",
      });
    }

    // Kiểm tra lại thông tin xác thực
    if (passwordReset.verificationInfo && passwordReset.verificationInfo.licenseNo && passwordReset.verificationInfo.taxCode) {
      let businessProfile = null;
      if (user.role === "pharma_company" && user.pharmaCompany) {
        businessProfile = user.pharmaCompany;
      } else if (user.role === "distributor" && user.distributor) {
        businessProfile = user.distributor;
      } else if (user.role === "pharmacy" && user.pharmacy) {
        businessProfile = user.pharmacy;
      }

      if (businessProfile) {
        if (
          businessProfile.licenseNo !== passwordReset.verificationInfo.licenseNo ||
          businessProfile.taxCode !== passwordReset.verificationInfo.taxCode
        ) {
          return res.status(400).json({
            success: false,
            message: "Thông tin xác thực không khớp với thông tin trong hệ thống",
          });
        }
      }
    }

    // Tạo mật khẩu mới ngẫu nhiên (8-12 ký tự: chữ hoa, chữ thường, số)
    const generateRandomPassword = () => {
      const length = Math.floor(Math.random() * 5) + 8; // 8-12 ký tự
      const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const lowercase = "abcdefghijklmnopqrstuvwxyz";
      const numbers = "0123456789";
      const all = uppercase + lowercase + numbers;
      
      let password = "";
      // Đảm bảo có ít nhất 1 chữ hoa, 1 chữ thường, 1 số
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      password += numbers[Math.floor(Math.random() * numbers.length)];
      
      // Thêm các ký tự ngẫu nhiên còn lại
      for (let i = password.length; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
      }
      
      // Xáo trộn password
      return password.split("").sort(() => Math.random() - 0.5).join("");
    };

    const newPassword = generateRandomPassword();

    // Hash và cập nhật mật khẩu mới cho user
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Cập nhật password reset request
    passwordReset.status = "approved";
    passwordReset.reviewedBy = adminUser._id;
    passwordReset.reviewedAt = new Date();
    passwordReset.used = true; // Đánh dấu đã được sử dụng (không cần dùng token nữa)
    passwordReset.newPassword = newPassword; // Lưu mật khẩu mới (plaintext) để gửi email, sau đó có thể xóa
    await passwordReset.save();

    // Gửi email với mật khẩu mới
    try {
      await sendNewPasswordEmail(user.email, newPassword, user.username);
      
      // Xóa mật khẩu plaintext sau khi đã gửi email (bảo mật)
      passwordReset.newPassword = undefined;
      await passwordReset.save();
    } catch (emailError) {
      console.error("Lỗi khi gửi email mật khẩu mới:", emailError);
      // Vẫn tiếp tục, nhưng log lỗi
    }

    return res.status(200).json({
      success: true,
      message: "Yêu cầu reset mật khẩu đã được admin duyệt. Mật khẩu mới đã được gửi đến email của người dùng.",
    });
  } catch (error) {
    console.error("Lỗi khi xác nhận yêu cầu reset mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xác nhận yêu cầu reset mật khẩu",
      error: error.message,
    });
  }
};

// Reset mật khẩu
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp token và mật khẩu mới",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }

    const passwordReset = await PasswordReset.findOne({
      token,
      used: false,
    }).populate("user");

    if (!passwordReset) {
      return res.status(400).json({
        success: false,
        message: "Token reset mật khẩu không hợp lệ hoặc đã được sử dụng",
      });
    }

    if (new Date() > passwordReset.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "Token reset mật khẩu đã hết hạn",
      });
    }

    const user = passwordReset.user;
    
    // Với pharma_company, cần kiểm tra xem admin đã xác nhận chưa
    // Ở đây chúng ta giả định rằng nếu token tồn tại và chưa hết hạn thì đã được admin xác nhận
    // Trong thực tế, nên có trường "approved" trong PasswordReset model

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Đánh dấu token đã được sử dụng
    passwordReset.used = true;
    await passwordReset.save();

    return res.status(200).json({
      success: true,
      message: "Reset mật khẩu thành công",
    });
  } catch (error) {
    console.error("Lỗi khi reset mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi reset mật khẩu",
      error: error.message,
    });
  }
};

// Từ chối yêu cầu reset mật khẩu
export const rejectPasswordReset = async (req, res) => {
  try {
    const adminUser = req.user;
    
    if (adminUser.role !== "system_admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có admin mới có thể từ chối yêu cầu reset mật khẩu",
      });
    }

    const { resetRequestId } = req.params;
    const { rejectionReason } = req.body;

    const passwordReset = await PasswordReset.findById(resetRequestId).populate("user");

    if (!passwordReset) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy yêu cầu reset mật khẩu",
      });
    }

    if (passwordReset.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu reset mật khẩu này đã được duyệt, không thể từ chối",
      });
    }

    if (passwordReset.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu reset mật khẩu này đã bị từ chối",
      });
    }

    passwordReset.status = "rejected";
    passwordReset.reviewedBy = adminUser._id;
    passwordReset.reviewedAt = new Date();
    await passwordReset.save();

    return res.status(200).json({
      success: true,
      message: "Yêu cầu reset mật khẩu đã bị từ chối",
      data: {
        id: passwordReset._id,
        status: passwordReset.status,
        rejectionReason: rejectionReason || "",
      },
    });
  } catch (error) {
    console.error("Lỗi khi từ chối yêu cầu reset mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi từ chối yêu cầu reset mật khẩu",
      error: error.message,
    });
  }
};

// Lấy danh sách yêu cầu reset mật khẩu (cho admin)
export const getPasswordResetRequests = async (req, res) => {
  try {
    const adminUser = req.user;

    if (adminUser.role !== "system_admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có admin mới có thể xem danh sách yêu cầu reset mật khẩu",
      });
    }

    const { used, expired, status, role } = req.query;
    const filter = {};

    if (used !== undefined) {
      filter.used = used === "true";
    }

    if (status) {
      filter.status = status;
    }

    if (expired === "true") {
      filter.expiresAt = { $lt: new Date() };
    } else if (expired === "false") {
      filter.expiresAt = { $gte: new Date() };
    }

    const requests = await PasswordReset.find(filter)
      .populate("user", "username email fullName role")
      .populate("reviewedBy", "username email")
      .populate({
        path: "user",
        populate: [
          { path: "pharmaCompany", select: "name licenseNo taxCode" },
          { path: "distributor", select: "name licenseNo taxCode" },
          { path: "pharmacy", select: "name licenseNo taxCode" },
        ],
      })
      .sort({ createdAt: -1 });

    // Filter theo role nếu có
    let filteredRequests = requests;
    if (role) {
      filteredRequests = requests.filter(req => req.user && req.user.role === role);
    }

    return res.status(200).json({
      success: true,
      data: filteredRequests,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu reset mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách yêu cầu reset mật khẩu",
      error: error.message,
    });
  }
};

