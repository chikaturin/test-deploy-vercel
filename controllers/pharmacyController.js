import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import User from "../models/User.js";
import { getTrackingHistory } from "../services/blockchainService.js";
import Pharmacy from "../models/Pharmacy.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";
import { handleError } from "../utils/errorHandler.js";
import BusinessEntityFactory from "../services/factories/BusinessEntityFactory.js";
import QueryBuilderFactory from "../services/factories/QueryBuilderFactory.js";
import { DateHelper, DataAggregationService, StatisticsCalculationService } from "../services/utils/index.js";


export const getInvoicesFromDistributor = async (req, res) => {
  try {
    const user = req.user;

    const filter = QueryBuilderFactory.createCommercialInvoiceFilter(user, {
      status: req.query.status,
      search: req.query.search,
    });

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);
    const limitNum = limit;
    const pageNum = page;

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
    return handleError(error, "Lỗi khi lấy danh sách đơn hàng:", res, "Lỗi server khi lấy danh sách đơn hàng");
  }
};

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
    return handleError(error, "[confirmReceipt] Lỗi:", res, "Lỗi server khi xác nhận nhận hàng");
  }
};

export const getDistributionHistory = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem lịch sử phân phối",
      });
    }

    const filter = QueryBuilderFactory.createProofOfPharmacyFilter(user, {
      status: req.query.status,
    });

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);
    const limitNum = limit;
    const pageNum = page;

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
    return handleError(error, "Lỗi khi lấy lịch sử phân phối:", res, "Lỗi server khi lấy lịch sử phân phối");
  }
};

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
    return handleError(error, "Lỗi khi lấy thống kê:", res, "Lỗi server khi lấy thống kê");
  }
};

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
    return handleError(error, "Lỗi khi theo dõi hành trình:", res, "Lỗi server khi theo dõi hành trình");
  }
};

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
    return handleError(error, "Lỗi khi lấy danh sách thuốc:", res, "Lỗi server khi lấy danh sách thuốc");
  }
};

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
    return handleError(error, "Lỗi khi tìm kiếm thuốc:", res, "Lỗi server khi tìm kiếm thuốc");
  }
};

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
    return handleError(error, "Lỗi khi lấy thông tin profile:", res, "Lỗi server khi lấy thông tin profile");
  }
};

export const pharmacyChartOneWeek = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    const pharmacy = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "pharmacy"
    );

    const { start: sevenDaysAgo } = DateHelper.getWeekRange();
    const invoices = await CommercialInvoice.find({
      toPharmacy: user._id,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("fromDistributor", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    // Group theo ngày
    const dailyStats = DataAggregationService.groupInvoicesByDate(invoices);

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
    return handleError(error, "Lỗi khi lấy biểu đồ 1 tuần pharmacy:", res, "Lỗi server khi lấy dữ liệu biểu đồ 1 tuần");
  }
};

export const pharmacyChartTodayYesterday = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharmacy") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharmacy mới có thể xem thống kê",
      });
    }

    const pharmacy = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "pharmacy"
    );

    const { start: startOfToday } = DateHelper.getTodayRange();
    const { start: startOfYesterday } = DateHelper.getYesterdayRange();

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
    const { diff, percentChange } = StatisticsCalculationService.calculateTodayYesterdayStats(
      todayCount,
      yesterdayCount
    );

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
    return handleError(error, "Lỗi khi lấy biểu đồ so sánh pharmacy:", res, "Lỗi server khi lấy dữ liệu biểu đồ");
  }
};

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

    const { start, end } = DateHelper.parseDateRange(startDate, endDate);

    const pharmacy = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "pharmacy"
    );

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
    const totalQuantity = DataAggregationService.calculateTotalQuantity(invoices, 'quantity');

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = DataAggregationService.groupInvoicesByDate(invoices);

    const days = DateHelper.getDaysDifference(start, end);

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          from: start,
          to: end,
          days,
        },
        summary: {
          totalInvoices: invoices.length,
          totalQuantity,
          averagePerDay: StatisticsCalculationService.calculateAveragePerDay(invoices.length, days),
        },
        dailyStats,
        invoices,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi thống kê theo khoảng thời gian:", res, "Lỗi server khi thống kê");
  }
};

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

    const { start, end } = DateHelper.parseDateRange(startDate, endDate);

    const pharmacy = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "pharmacy"
    );

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
    const totalQuantity = DataAggregationService.calculateTotalQuantity(receipts, 'receivedQuantity');

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = DataAggregationService.groupReceiptsByDate(receipts);

    const days = DateHelper.getDaysDifference(start, end);

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          from: start,
          to: end,
          days,
        },
        summary: {
          totalReceipts: receipts.length,
          totalQuantity,
          averagePerDay: StatisticsCalculationService.calculateAveragePerDay(receipts.length, days),
        },
        dailyStats,
        receipts,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi thống kê receipts theo khoảng thời gian:", res, "Lỗi server khi thống kê");
  }
};
