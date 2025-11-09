import User from "../models/User.js";
import PharmaCompany from "../models/PharmaCompany.js";
import Distributor from "../models/Distributor.js";
import Pharmacy from "../models/Pharmacy.js";
import NFTInfo from "../models/NFTInfo.js";
import DrugInfo from "../models/DrugInfo.js";
import ManufacturerInvoice from "../models/ManufacturerInvoice.js";
import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfProduction from "../models/ProofOfProduction.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import bcrypt from "bcryptjs";
import { getTrackingHistory } from "../services/blockchainService.js";
import { handleError, handleAuthError, handleValidationError } from "../utils/errorHandler.js";
import QueryBuilderFactory from "../services/factories/QueryBuilderFactory.js";
import ResponseFormatterFactory from "../services/factories/ResponseFormatterFactory.js";
import { getDefaultSort } from "../utils/SortHelper.js";

export const getAllUsers = async (req, res) => {
  try {
    const { role, status, search } = req.query;

    const filter = QueryBuilderFactory.createUserFilter({ role, status, search });
    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const users = await User.find(filter)
      .select("-password")
      .populate("pharmaCompany", "name licenseNo taxCode")
      .populate("distributor", "name licenseNo taxCode")
      .populate("pharmacy", "name licenseNo taxCode")
      .sort(getDefaultSort())
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { users },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy danh sách người dùng:", res, "Lỗi server khi lấy danh sách người dùng");
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-password")
      .populate("pharmaCompany", "name licenseNo taxCode status address country contactEmail contactPhone")
      .populate("distributor", "name licenseNo taxCode status address country contactEmail contactPhone")
      .populate("pharmacy", "name licenseNo taxCode status address country contactEmail contactPhone");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy thông tin người dùng:", res, "Lỗi server khi lấy thông tin người dùng");
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("-password")
      .populate("pharmaCompany")
      .populate("distributor")
      .populate("pharmacy");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy thông tin profile:", res, "Lỗi server khi lấy thông tin profile");
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fullName, phone, country, address, avatar } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (fullName !== undefined) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (country !== undefined) user.country = country;
    if (address !== undefined) user.address = address;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công",
      data: userResponse,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi cập nhật profile:", res, "Lỗi server khi cập nhật profile");
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, country, address, status, avatar } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (fullName !== undefined) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (country !== undefined) user.country = country;
    if (address !== undefined) user.address = address;
    if (status !== undefined) user.status = status;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin người dùng thành công",
      data: userResponse,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi cập nhật người dùng:", res, "Lỗi server khi cập nhật người dùng");
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp oldPassword và newPassword",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Mật khẩu cũ không đúng",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    return handleAuthError(error, "Lỗi khi đổi mật khẩu:", res);
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (currentUser._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể xóa chính tài khoản của mình",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (user.role === "system_admin" && currentUser.role !== "system_admin") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa tài khoản admin",
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Xóa người dùng thành công",
    });
  } catch (error) {
    return handleError(error, "Lỗi khi xóa người dùng:", res, "Lỗi server khi xóa người dùng");
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["active", "inactive", "banned", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status không hợp lệ. Chỉ chấp nhận: active, inactive, banned, pending",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    const currentUser = req.user;
    if (currentUser._id.toString() === id && status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể thay đổi trạng thái của chính mình",
      });
    }

    user.status = status;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(200).json({
      success: true,
      message: `Cập nhật trạng thái người dùng thành ${status} thành công`,
      data: userResponse,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi cập nhật trạng thái:", res, "Lỗi server khi cập nhật trạng thái");
  }
};

export const getUserStats = async (req, res) => {
  try {
    const stats = {
      total: await User.countDocuments(),
      byRole: {
        user: await User.countDocuments({ role: "user" }),
        system_admin: await User.countDocuments({ role: "system_admin" }),
        pharma_company: await User.countDocuments({ role: "pharma_company" }),
        distributor: await User.countDocuments({ role: "distributor" }),
        pharmacy: await User.countDocuments({ role: "pharmacy" }),
      },
      byStatus: {
        active: await User.countDocuments({ status: "active" }),
        inactive: await User.countDocuments({ status: "inactive" }),
        banned: await User.countDocuments({ status: "banned" }),
        pending: await User.countDocuments({ status: "pending" }),
      },
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy thống kê người dùng:", res, "Lỗi server khi lấy thống kê người dùng");
  }
};

export const trackDrugByNFTId = async (req, res) => {
  try {
    const { tokenId } = req.params;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "tokenId là bắt buộc",
      });
    }

    // Tìm NFT trong database
    const nft = await NFTInfo.findOne({ tokenId })
      .populate("drug", "tradeName atcCode genericName dosageForm strength packaging")
      .populate("owner", "username email fullName walletAddress")
      .populate("proofOfProduction");

    if (!nft) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy NFT với tokenId này",
      });
    }

    // Lấy lịch sử từ blockchain
    let blockchainHistory = [];
    try {
      blockchainHistory = await getTrackingHistory(tokenId);
    } catch (error) {
      console.error("Lỗi khi lấy lịch sử blockchain:", error);
    }

    // Tìm các invoice và proof liên quan trong supply chain
    const manufacturerInvoice = await ManufacturerInvoice.findOne({
      nftInfo: nft._id,
    })
      .populate("fromManufacturer", "username email fullName walletAddress")
      .populate("toDistributor", "username email fullName walletAddress");

    const proofOfDistribution = await ProofOfDistribution.findOne({
      manufacturerInvoice: manufacturerInvoice?._id,
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("toDistributor", "username email fullName");

    const commercialInvoice = await CommercialInvoice.findOne({
      nftInfo: nft._id,
    })
      .populate("fromDistributor", "username email fullName walletAddress")
      .populate("toPharmacy", "username email fullName walletAddress");

    const proofOfPharmacy = await ProofOfPharmacy.findOne({
      commercialInvoice: commercialInvoice?._id,
    })
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName");

    // Tạo chuỗi hành trình từ các thông tin đã tìm được
    const journey = [];
    
    if (nft.proofOfProduction) {
      const production = await ProofOfProduction.findById(nft.proofOfProduction)
        .populate("manufacturer", "name");
      if (production) {
        journey.push({
          stage: "manufacturing",
          description: "Sản xuất",
          manufacturer: production.manufacturer?.name || "N/A",
          date: production.mfgDate || production.createdAt,
          details: {
            quantity: production.quantity,
            mfgDate: production.mfgDate,
          },
        });
      }
    }

    if (manufacturerInvoice) {
      journey.push({
        stage: "transfer_to_distributor",
        description: "Chuyển giao cho Nhà phân phối",
        from: manufacturerInvoice.fromManufacturer?.fullName || manufacturerInvoice.fromManufacturer?.username || "N/A",
        to: manufacturerInvoice.toDistributor?.fullName || manufacturerInvoice.toDistributor?.username || "N/A",
        date: manufacturerInvoice.createdAt,
        invoiceNumber: manufacturerInvoice.invoiceNumber,
      });
    }

    if (proofOfDistribution) {
      journey.push({
        stage: "distributor_received",
        description: "Nhà phân phối đã nhận hàng",
        date: proofOfDistribution.distributionDate || proofOfDistribution.createdAt,
        status: proofOfDistribution.status,
      });
    }

    if (commercialInvoice) {
      journey.push({
        stage: "transfer_to_pharmacy",
        description: "Chuyển giao cho Nhà thuốc",
        from: commercialInvoice.fromDistributor?.fullName || commercialInvoice.fromDistributor?.username || "N/A",
        to: commercialInvoice.toPharmacy?.fullName || commercialInvoice.toPharmacy?.username || "N/A",
        date: commercialInvoice.createdAt,
        invoiceNumber: commercialInvoice.invoiceNumber,
      });
    }

    if (proofOfPharmacy) {
      journey.push({
        stage: "pharmacy_received",
        description: "Nhà thuốc đã nhận hàng",
        date: proofOfPharmacy.receiptDate || proofOfPharmacy.createdAt,
        status: proofOfPharmacy.status,
        supplyChainCompleted: proofOfPharmacy.supplyChainCompleted,
      });
    }

    // Thông tin NFT cơ bản (public info)
    const nftInfo = {
      tokenId: nft.tokenId,
      serialNumber: nft.serialNumber,
      batchNumber: nft.batchNumber,
      drug: {
        tradeName: nft.drug?.tradeName,
        atcCode: nft.drug?.atcCode,
        genericName: nft.drug?.genericName,
        dosageForm: nft.drug?.dosageForm,
        strength: nft.drug?.strength,
        packaging: nft.drug?.packaging,
      },
      mfgDate: nft.mfgDate,
      expDate: nft.expDate,
      status: nft.status,
      currentOwner: nft.owner ? {
        username: nft.owner.username,
        fullName: nft.owner.fullName,
      } : null,
    };

    return res.status(200).json({
      success: true,
      data: {
        nft: nftInfo,
        blockchainHistory,
        journey,
        supplyChain: {
          manufacturer: manufacturerInvoice?.fromManufacturer ? {
            name: manufacturerInvoice.fromManufacturer.fullName || manufacturerInvoice.fromManufacturer.username,
            email: manufacturerInvoice.fromManufacturer.email,
          } : null,
          distributor: commercialInvoice?.fromDistributor ? {
            name: commercialInvoice.fromDistributor.fullName || commercialInvoice.fromDistributor.username,
            email: commercialInvoice.fromDistributor.email,
          } : null,
          pharmacy: commercialInvoice?.toPharmacy ? {
            name: commercialInvoice.toPharmacy.fullName || commercialInvoice.toPharmacy.username,
            email: commercialInvoice.toPharmacy.email,
          } : null,
        },
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi theo dõi hành trình:", res, "Lỗi server khi theo dõi hành trình");
  }
};

export const getDrugInfo = async (req, res) => {
  try {
    const { drugId, atcCode } = req.query;
    const user = req.user; // Cần xác thực

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Cần đăng nhập để xem thông tin thuốc",
      });
    }

    let drug;

    if (drugId) {
      drug = await DrugInfo.findById(drugId)
        .populate("manufacturer", "name licenseNo country");
    } else if (atcCode) {
      drug = await DrugInfo.findOne({ atcCode })
        .populate("manufacturer", "name licenseNo country");
    } else {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp drugId hoặc atcCode",
      });
    }

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin thuốc",
      });
    }

    // Thông tin công khai cho user
    const publicInfo = {
      id: drug._id,
      tradeName: drug.tradeName,
      genericName: drug.genericName,
      atcCode: drug.atcCode,
      dosageForm: drug.dosageForm,
      strength: drug.strength,
      route: drug.route,
      packaging: drug.packaging,
      storage: drug.storage,
      warnings: drug.warnings,
      activeIngredients: drug.activeIngredients,
      manufacturer: drug.manufacturer ? {
        name: drug.manufacturer.name,
        country: drug.manufacturer.country,
      } : null,
      status: drug.status,
    };

    // Nếu user là admin, pharma_company, distributor hoặc pharmacy, có thể xem thêm thông tin
    let additionalInfo = null;
    if (["system_admin", "pharma_company", "distributor", "pharmacy"].includes(user.role)) {
      additionalInfo = {
        manufacturer: drug.manufacturer ? {
          name: drug.manufacturer.name,
          licenseNo: drug.manufacturer.licenseNo,
          country: drug.manufacturer.country,
        } : null,
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        ...publicInfo,
        ...(additionalInfo && { additionalInfo }),
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy thông tin thuốc:", res, "Lỗi server khi lấy thông tin thuốc");
  }
};

export const searchDrugs = async (req, res) => {
  try {
    const user = req.user; // Cần xác thực

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Cần đăng nhập để tìm kiếm thuốc",
      });
    }

    const { search, atcCode, status } = req.query;

    const filter = QueryBuilderFactory.createDrugSearchFilter({ search, atcCode, status });
    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const drugs = await DrugInfo.find(filter)
      .populate("manufacturer", "name country")
      .select("tradeName genericName atcCode dosageForm strength route packaging storage warnings activeIngredients status manufacturer")
      .sort(getDefaultSort())
      .skip(skip)
      .limit(limit);

    const total = await DrugInfo.countDocuments(filter);

    // Chỉ trả về thông tin công khai
    const publicDrugs = drugs.map((drug) => ({
      id: drug._id,
      tradeName: drug.tradeName,
      genericName: drug.genericName,
      atcCode: drug.atcCode,
      dosageForm: drug.dosageForm,
      strength: drug.strength,
      route: drug.route,
      packaging: drug.packaging,
      storage: drug.storage,
      warnings: drug.warnings,
      activeIngredients: drug.activeIngredients,
      manufacturer: drug.manufacturer ? {
        name: drug.manufacturer.name,
        country: drug.manufacturer.country,
      } : null,
      status: drug.status,
    }));

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { drugs: publicDrugs },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi tìm kiếm thuốc:", res, "Lỗi server khi tìm kiếm thuốc");
  }
};

