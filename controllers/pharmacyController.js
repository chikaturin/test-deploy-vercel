import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import User from "../models/User.js";
import { getTrackingHistory } from "../services/blockchainService.js";
import Pharmacy from "../models/Pharmacy.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";

// ============ QUẢN LÝ ĐƠN HÀNG TỪ DISTRIBUTOR ============

// Xem danh sách đơn hàng từ distributor
export const getInvoicesFromDistributor = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem đơn hàng",
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { toPharmacy: user._id };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const invoices = await CommercialInvoice.find(filter)
      .populate("fromDistributor", "username email fullName")
      .populate("drug", "tradeName atcCode genericName")
      .populate("nftInfo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await CommercialInvoice.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách đơn hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách đơn hàng",
      error: error.message,
    });
  }
};

// Xác nhận nhận hàng từ distributor (confirm-receipt)
// Bước 1: Pharmacy xác nhận đã nhận hàng
// Bước 2: Lưu vào database và set trạng thái "Đang chờ Distributor xác nhận"
export const confirmReceipt = async (req, res) => {
  try {
    const user = req.user;
    console.log("[confirmReceipt] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
    });

    if (user.role !== "pharmacy") {
      console.log("[confirmReceipt] Lỗi: User không phải pharmacy:", {
        userId: user._id,
        userRole: user.role,
      });
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xác nhận nhận hàng",
      });
    }

    const {
      invoiceId,
      receivedBy,
      receiptAddress,
      qualityCheck,
      receiptDate,
      receivedQuantity,
      notes,
    } = req.body;

    console.log("[confirmReceipt] Request body:", {
      invoiceId,
      receivedBy: receivedBy ? (typeof receivedBy === 'object' ? receivedBy : { raw: receivedBy }) : null,
      receiptAddress: receiptAddress ? (typeof receiptAddress === 'object' ? receiptAddress : { raw: receiptAddress }) : null,
      qualityCheck: qualityCheck ? (typeof qualityCheck === 'object' ? qualityCheck : { raw: qualityCheck }) : null,
      receiptDate,
      receivedQuantity,
      notes,
      receivedByType: typeof receivedBy,
      receiptAddressType: typeof receiptAddress,
    });

    if (!invoiceId) {
      console.log("[confirmReceipt] Lỗi: Thiếu invoiceId");
      return res.status(400).json({
        success: false,
        message: "invoiceId là bắt buộc",
      });
    }

    // Tìm invoice
    console.log("[confirmReceipt] Đang tìm invoice:", invoiceId);
    const invoice = await CommercialInvoice.findById(invoiceId)
      .populate("fromDistributor", "username email fullName walletAddress")
      .populate("toPharmacy", "username email fullName walletAddress");

    if (!invoice) {
      console.log("[confirmReceipt] Lỗi: Không tìm thấy invoice:", invoiceId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    console.log("[confirmReceipt] Tìm thấy invoice:", {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      fromDistributorId: invoice.fromDistributor._id || invoice.fromDistributor,
      toPharmacyId: invoice.toPharmacy._id || invoice.toPharmacy,
    });

    // Kiểm tra invoice thuộc về pharmacy này
    const toPharmacyId = invoice.toPharmacy._id || invoice.toPharmacy;
    console.log("[confirmReceipt] Kiểm tra quyền:", {
      toPharmacyId: toPharmacyId.toString(),
      userId: user._id.toString(),
      match: toPharmacyId.toString() === user._id.toString(),
    });

    if (toPharmacyId.toString() !== user._id.toString()) {
      console.log("[confirmReceipt] Lỗi: Không có quyền xác nhận invoice này");
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xác nhận invoice này",
      });
    }

    // Kiểm tra invoice đã được sent chưa (distributor đã chuyển NFT)
    console.log("[confirmReceipt] Kiểm tra trạng thái invoice:", {
      currentStatus: invoice.status,
      requiredStatus: "sent",
      isValid: invoice.status === "sent",
    });

    if (invoice.status !== "sent") {
      console.log("[confirmReceipt] Lỗi: Invoice chưa được gửi:", invoice.status);
      return res.status(400).json({
        success: false,
        message: `Invoice chưa được gửi. Trạng thái hiện tại: ${invoice.status}`,
      });
    }

    // Tìm hoặc tạo Proof of Pharmacy
    console.log("[confirmReceipt] Đang tìm Proof of Pharmacy:", invoiceId);
    let proofOfPharmacy = await ProofOfPharmacy.findOne({
      commercialInvoice: invoiceId,
    });

    if (proofOfPharmacy) {
      console.log("[confirmReceipt] Tìm thấy Proof of Pharmacy đã tồn tại:", {
        proofId: proofOfPharmacy._id,
        currentStatus: proofOfPharmacy.status,
      });

      console.log("[confirmReceipt] Dữ liệu trước khi cập nhật:", {
        receivedBy: proofOfPharmacy.receivedBy,
        receiptAddress: proofOfPharmacy.receiptAddress,
        qualityCheck: proofOfPharmacy.qualityCheck,
        receiptDate: proofOfPharmacy.receiptDate,
        receivedQuantity: proofOfPharmacy.receivedQuantity,
      });

      proofOfPharmacy.status = "pending"; // Đang chờ Distributor xác nhận
      if (receivedBy) {
        console.log("[confirmReceipt] Cập nhật receivedBy:", {
          old: proofOfPharmacy.receivedBy,
          new: receivedBy,
          newType: typeof receivedBy,
        });
        proofOfPharmacy.receivedBy = receivedBy;
      }
      if (receiptAddress) {
        console.log("[confirmReceipt] Cập nhật receiptAddress:", {
          old: proofOfPharmacy.receiptAddress,
          new: receiptAddress,
          newType: typeof receiptAddress,
        });
        proofOfPharmacy.receiptAddress = receiptAddress;
      }
      if (qualityCheck) {
        console.log("[confirmReceipt] Cập nhật qualityCheck:", qualityCheck);
        proofOfPharmacy.qualityCheck = qualityCheck;
      }
      if (receiptDate) {
        console.log("[confirmReceipt] Cập nhật receiptDate:", receiptDate);
        proofOfPharmacy.receiptDate = new Date(receiptDate);
      }
      if (receivedQuantity) {
        console.log("[confirmReceipt] Cập nhật receivedQuantity:", receivedQuantity);
        proofOfPharmacy.receivedQuantity = receivedQuantity;
      }
    } else {
      console.log("[confirmReceipt] Tạo mới Proof of Pharmacy");
      
      const proofData = {
        fromDistributor: invoice.fromDistributor._id,
        toPharmacy: user._id,
        commercialInvoice: invoiceId,
        status: "pending", // Đang chờ Distributor xác nhận
        receivedBy,
        receiptAddress,
        qualityCheck,
        receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
        receivedQuantity: receivedQuantity || invoice.quantity,
        drug: invoice.drug,
        nftInfo: invoice.nftInfo,
      };

      console.log("[confirmReceipt] Dữ liệu Proof of Pharmacy mới:", {
        fromDistributor: proofData.fromDistributor,
        toPharmacy: proofData.toPharmacy,
        commercialInvoice: proofData.commercialInvoice,
        status: proofData.status,
        receivedBy: proofData.receivedBy,
        receivedByType: typeof proofData.receivedBy,
        receiptAddress: proofData.receiptAddress,
        receiptAddressType: typeof proofData.receiptAddress,
        qualityCheck: proofData.qualityCheck,
        receiptDate: proofData.receiptDate,
        receivedQuantity: proofData.receivedQuantity,
        drug: proofData.drug,
        nftInfo: proofData.nftInfo,
      });

      // Tạo mới proof of pharmacy
      proofOfPharmacy = new ProofOfPharmacy(proofData);
    }

    console.log("[confirmReceipt] Đang lưu Proof of Pharmacy...");
    await proofOfPharmacy.save();

    console.log("[confirmReceipt] Đã lưu Proof of Pharmacy:", {
      proofId: proofOfPharmacy._id,
      status: proofOfPharmacy.status,
      receivedBy: proofOfPharmacy.receivedBy,
      receiptAddress: proofOfPharmacy.receiptAddress,
      receivedQuantity: proofOfPharmacy.receivedQuantity,
    });

    // Cập nhật CommercialInvoice để tham chiếu đến ProofOfPharmacy
    console.log("[confirmReceipt] Cập nhật CommercialInvoice...");
    invoice.proofOfPharmacy = proofOfPharmacy._id;
    await invoice.save();

    console.log("[confirmReceipt] Hoàn thành:", {
      invoiceId: invoice._id,
      proofOfPharmacyId: proofOfPharmacy._id,
      status: proofOfPharmacy.status,
    });

    return res.status(200).json({
      success: true,
      message: "Đã xác nhận nhận hàng thành công. Đang chờ Distributor xác nhận quyền NFT.",
      data: {
        proofOfPharmacy,
        invoice,
      },
    });
  } catch (error) {
    console.error("[confirmReceipt] Lỗi:", {
      error: error.message,
      stack: error.stack,
      invoiceId: req.body?.invoiceId,
      userId: req.user?._id,
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xác nhận nhận hàng",
      error: error.message,
    });
  }
};

// ============ LỊCH SỬ PHÂN PHỐI ============

// Xem lịch sử phân phối thuốc
export const getDistributionHistory = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem lịch sử phân phối",
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { toPharmacy: user._id };

    if (status) {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const proofs = await ProofOfPharmacy.find(filter)
      .populate("fromDistributor", "username email fullName")
      .populate("commercialInvoice")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ProofOfPharmacy.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        distributions: proofs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử phân phối:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử phân phối",
      error: error.message,
    });
  }
};

// ============ THỐNG KÊ ============

// Thống kê các trạng thái, đơn thuốc được gửi đến, lượt chuyển giao
export const getStatistics = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    // Thống kê đơn hàng từ distributor
    const totalInvoices = await CommercialInvoice.countDocuments({
      toPharmacy: user._id,
    });

    const invoiceStatusStats = {
      draft: await CommercialInvoice.countDocuments({
        toPharmacy: user._id,
        status: "draft",
      }),
      issued: await CommercialInvoice.countDocuments({
        toPharmacy: user._id,
        status: "issued",
      }),
      sent: await CommercialInvoice.countDocuments({
        toPharmacy: user._id,
        status: "sent",
      }),
      paid: await CommercialInvoice.countDocuments({
        toPharmacy: user._id,
        status: "paid",
      }),
      cancelled: await CommercialInvoice.countDocuments({
        toPharmacy: user._id,
        status: "cancelled",
      }),
    };

    // Thống kê lịch sử nhận hàng
    const totalReceipts = await ProofOfPharmacy.countDocuments({
      toPharmacy: user._id,
    });

    const receiptStatusStats = {
      pending: await ProofOfPharmacy.countDocuments({
        toPharmacy: user._id,
        status: "pending",
      }),
      received: await ProofOfPharmacy.countDocuments({
        toPharmacy: user._id,
        status: "received",
      }),
      verified: await ProofOfPharmacy.countDocuments({
        toPharmacy: user._id,
        status: "verified",
      }),
      completed: await ProofOfPharmacy.countDocuments({
        toPharmacy: user._id,
        status: "completed",
      }),
      rejected: await ProofOfPharmacy.countDocuments({
        toPharmacy: user._id,
        status: "rejected",
      }),
    };

    // Thống kê NFT đã nhận
    const nfts = await NFTInfo.find({
      owner: user._id,
    });

    const nftStatusStats = {
      minted: nfts.filter((nft) => nft.status === "minted").length,
      transferred: nfts.filter((nft) => nft.status === "transferred").length,
      sold: nfts.filter((nft) => nft.status === "sold").length,
      expired: nfts.filter((nft) => nft.status === "expired").length,
      recalled: nfts.filter((nft) => nft.status === "recalled").length,
    };

    // Thống kê lượt chuyển giao (số lượng đơn hàng đã nhận)
    const totalTransfers = totalReceipts;

    return res.status(200).json({
      success: true,
      data: {
        invoices: {
          total: totalInvoices,
          byStatus: invoiceStatusStats,
        },
        receipts: {
          total: totalReceipts,
          byStatus: receiptStatusStats,
        },
        transfers: {
          total: totalTransfers,
        },
        nfts: {
          total: nfts.length,
          byStatus: nftStatusStats,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thống kê:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê",
      error: error.message,
    });
  }
};

// ============ THEO DÕI HÀNH TRÌNH ============

// Theo dõi hành trình thuốc qua NFT ID
export const trackDrugByNFTId = async (req, res) => {
  try {
    const user = req.user;
    const { tokenId } = req.params;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "tokenId là bắt buộc",
      });
    }

    // Tìm NFT
    const nft = await NFTInfo.findOne({ tokenId })
      .populate("drug", "tradeName atcCode genericName")
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

    // Tìm các invoice liên quan
    const commercialInvoice = await CommercialInvoice.findOne({
      toPharmacy: user._id,
      nftInfo: nft._id,
    })
      .populate("fromDistributor", "username email fullName walletAddress")
      .populate("toPharmacy", "username email fullName walletAddress");

    const proofOfPharmacy = await ProofOfPharmacy.findOne({
      toPharmacy: user._id,
      nftInfo: nft._id,
    })
      .populate("fromDistributor", "username email fullName");

    return res.status(200).json({
      success: true,
      data: {
        nft,
        blockchainHistory,
        commercialInvoice,
        proofOfPharmacy,
      },
    });
  } catch (error) {
    console.error("Lỗi khi theo dõi hành trình:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi theo dõi hành trình",
      error: error.message,
    });
  }
};

// ============ QUẢN LÝ THUỐC ============

// Xem danh sách thuốc
export const getDrugs = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem danh sách thuốc",
      });
    }

    const { page = 1, limit = 10, search, status } = req.query;

    const filter = { status: status || "active" };

    if (search) {
      filter.$or = [
        { tradeName: { $regex: search, $options: "i" } },
        { genericName: { $regex: search, $options: "i" } },
        { atcCode: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const drugs = await DrugInfo.find(filter)
      .populate("manufacturer", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await DrugInfo.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        drugs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách thuốc",
      error: error.message,
    });
  }
};

// Tìm kiếm thuốc theo ATC code
export const searchDrugByATCCode = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể tìm kiếm thuốc",
      });
    }

    const { atcCode } = req.query;

    if (!atcCode) {
      return res.status(400).json({
        success: false,
        message: "atcCode là bắt buộc",
      });
    }

    const drug = await DrugInfo.findOne({ atcCode })
      .populate("manufacturer", "name licenseNo taxCode");

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc với ATC code này",
      });
    }

    return res.status(200).json({
      success: true,
      data: drug,
    });
  } catch (error) {
    console.error("Lỗi khi tìm kiếm thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tìm kiếm thuốc",
      error: error.message,
    });
  }
};

// ============ QUẢN LÝ THÔNG TIN CÁ NHÂN ============

// Xem thông tin cá nhân (không được chỉnh sửa)
export const getPharmacyProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("-password")
      .populate("pharmacy", "name licenseNo taxCode status address country contactEmail contactPhone walletAddress");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng",
      });
    }

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem profile này",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin profile",
      error: error.message,
    });
  }
};



// ============ THỐNG KÊ CHART CHO PHARMACY ============

// Chart 1 tuần - Thống kê đơn hàng nhận từ distributor trong 7 ngày gần nhất
export const pharmacyChartOneWeek = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    const pharmacy = await Pharmacy.findOne({ user: user._id });
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy pharmacy",
        error: "Pharmacy not found",
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const invoices = await CommercialInvoice.find({
      toPharmacy: user._id,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("fromDistributor", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    // Group theo ngày
    const dailyStats = {};
    invoices.forEach((invoice) => {
      const date = invoice.createdAt.toISOString().split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          count: 0,
          quantity: 0,
          invoices: [],
        };
      }
      dailyStats[date].count++;
      dailyStats[date].quantity += invoice.quantity || 0;
      dailyStats[date].invoices.push({
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        quantity: invoice.quantity,
        status: invoice.status,
        createdAt: invoice.createdAt,
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        invoices,
        count: invoices.length,
        from: sevenDaysAgo,
        to: new Date(),
        dailyStats,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy biểu đồ 1 tuần pharmacy:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy dữ liệu biểu đồ 1 tuần",
      error: error.message,
    });
  }
};

// So sánh hôm nay và hôm qua - Thống kê đơn hàng nhận từ distributor
export const pharmacyChartTodayYesterday = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    const pharmacy = await Pharmacy.findOne({ user: user._id });
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy pharmacy",
        error: "Pharmacy not found",
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    // Đếm số invoice của hôm qua
    const yesterdayCount = await CommercialInvoice.countDocuments({
      toPharmacy: user._id,
      createdAt: { $gte: startOfYesterday, $lt: startOfToday },
    });

    // Đếm số invoice của hôm nay
    const todayCount = await CommercialInvoice.countDocuments({
      toPharmacy: user._id,
      createdAt: { $gte: startOfToday },
    });

    // Tính chênh lệch và phần trăm thay đổi
    const diff = todayCount - yesterdayCount;
    let percentChange = null;
    if (yesterdayCount === 0) {
      percentChange = todayCount === 0 ? 0 : 100;
    } else {
      percentChange = (diff / yesterdayCount) * 100;
    }

    const todayInvoices = await CommercialInvoice.find({
      toPharmacy: user._id,
      createdAt: { $gte: startOfToday },
    })
      .populate("fromDistributor", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        todayCount,
        yesterdayCount,
        diff,
        percentChange,
        todayInvoicesCount: todayInvoices.length,
        todayInvoices: todayInvoices,
        period: {
          yesterdayFrom: startOfYesterday,
          yesterdayTo: new Date(startOfToday.getTime() - 1),
          todayFrom: startOfToday,
          now: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy biểu đồ so sánh pharmacy:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy dữ liệu biểu đồ",
      error: error.message,
    });
  }
};

// Thống kê theo khoảng thời gian - CommercialInvoice
export const getPharmacyInvoicesByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp startDate và endDate",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "startDate phải nhỏ hơn hoặc bằng endDate",
      });
    }

    const pharmacy = await Pharmacy.findOne({ user: user._id });
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy pharmacy",
      });
    }

    // Query invoices trong khoảng thời gian
    const invoices = await CommercialInvoice.find({
      toPharmacy: user._id,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("fromDistributor", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    // Tính tổng số lượng
    const totalQuantity = invoices.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = {};
    invoices.forEach((inv) => {
      const date = inv.createdAt.toISOString().split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          count: 0,
          quantity: 0,
          invoices: [],
        };
      }
      dailyStats[date].count++;
      dailyStats[date].quantity += inv.quantity || 0;
      dailyStats[date].invoices.push({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        drug: inv.drug,
        quantity: inv.quantity,
        status: inv.status,
        createdAt: inv.createdAt,
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          from: start,
          to: end,
          days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
        },
        summary: {
          totalInvoices: invoices.length,
          totalQuantity,
          averagePerDay: invoices.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        },
        dailyStats,
        invoices,
      },
    });
  } catch (error) {
    console.error("Lỗi khi thống kê theo khoảng thời gian:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thống kê",
      error: error.message,
    });
  }
};

// Thống kê ProofOfPharmacy theo khoảng thời gian
export const getPharmacyReceiptsByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp startDate và endDate",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Validate date range
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "startDate phải nhỏ hơn hoặc bằng endDate",
      });
    }

    const pharmacy = await Pharmacy.findOne({ user: user._id });
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy pharmacy",
      });
    }

    // Query receipts trong khoảng thời gian
    const receipts = await ProofOfPharmacy.find({
      toPharmacy: user._id,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("fromDistributor", "username email fullName")
      .populate("commercialInvoice")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    // Tính tổng số lượng
    const totalQuantity = receipts.reduce((sum, rec) => sum + (rec.receivedQuantity || 0), 0);

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = {};
    receipts.forEach((rec) => {
      const date = rec.createdAt.toISOString().split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          count: 0,
          quantity: 0,
          receipts: [],
        };
      }
      dailyStats[date].count++;
      dailyStats[date].quantity += rec.receivedQuantity || 0;
      dailyStats[date].receipts.push({
        id: rec._id,
        drug: rec.drug,
        quantity: rec.receivedQuantity,
        status: rec.status,
        createdAt: rec.createdAt,
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          from: start,
          to: end,
          days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
        },
        summary: {
          totalReceipts: receipts.length,
          totalQuantity,
          averagePerDay: receipts.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        },
        dailyStats,
        receipts,
      },
    });
  } catch (error) {
    console.error("Lỗi khi thống kê receipts theo khoảng thời gian:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thống kê",
      error: error.message,
    });
  }
};
