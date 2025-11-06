import RegistrationRequest from "../models/RegistrationRequest.js";
import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import ManufacturerInvoice from "../models/ManufacturerInvoice.js";
import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfProduction from "../models/ProofOfProduction.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import User from "../models/User.js";
import PharmaCompany from "../models/PharmaCompany.js";
import Distributor from "../models/Distributor.js";
import Pharmacy from "../models/Pharmacy.js";
import {
  addManufacturerToBlockchain,
  addDistributorToBlockchain,
  addPharmacyToBlockchain,
} from "../services/blockchainService.js";

// ============ QUẢN LÝ ĐƠN ĐĂNG KÝ ============

// Thống kê đơn đăng ký
export const getRegistrationStatistics = async (req, res) => {
  try {
    const totalRequests = await RegistrationRequest.countDocuments();

    const byStatus = {
      pending: await RegistrationRequest.countDocuments({ status: "pending" }),
      approved_pending_blockchain: await RegistrationRequest.countDocuments({ status: "approved_pending_blockchain" }),
      approved: await RegistrationRequest.countDocuments({ status: "approved" }),
      blockchain_failed: await RegistrationRequest.countDocuments({ status: "blockchain_failed" }),
      rejected: await RegistrationRequest.countDocuments({ status: "rejected" }),
    };

    const byRole = {
      pharma_company: await RegistrationRequest.countDocuments({ role: "pharma_company" }),
      distributor: await RegistrationRequest.countDocuments({ role: "distributor" }),
      pharmacy: await RegistrationRequest.countDocuments({ role: "pharmacy" }),
    };

    // Thống kê theo thời gian (7 ngày gần đây)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const recentRequests = await RegistrationRequest.countDocuments({
      createdAt: { $gte: last7Days },
    });

    return res.status(200).json({
      success: true,
      data: {
        total: totalRequests,
        byStatus,
        byRole,
        recentRequests,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thống kê đơn đăng ký:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê đơn đăng ký",
      error: error.message,
    });
  }
};

// Retry blockchain cho đơn đăng ký bị lỗi
export const retryBlockchainRegistration = async (req, res) => {
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

    if (registrationRequest.status !== "blockchain_failed") {
      return res.status(400).json({
        success: false,
        message: `Yêu cầu này không ở trạng thái blockchain_failed. Trạng thái hiện tại: ${registrationRequest.status}`,
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

    // Tăng số lần retry
    registrationRequest.blockchainRetryCount += 1;
    registrationRequest.blockchainLastAttempt = new Date();
    registrationRequest.status = "approved_pending_blockchain";
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
      await registrationRequest.save();

      // Nếu chưa có business profile, tạo mới
      let businessProfile;
      if (role === "pharma_company" && !user.pharmaCompany) {
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
        await businessProfile.save();
        user.pharmaCompany = businessProfile._id;
      } else if (role === "distributor" && !user.distributor) {
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
        await businessProfile.save();
        user.distributor = businessProfile._id;
      } else if (role === "pharmacy" && !user.pharmacy) {
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
        await businessProfile.save();
        user.pharmacy = businessProfile._id;
      }

      if (!user.status || user.status !== "active") {
        user.status = "active";
      }
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Retry blockchain thành công",
        data: {
          registrationRequest: {
            id: registrationRequest._id,
            status: registrationRequest.status,
            transactionHash: registrationRequest.transactionHash,
            blockchainRetryCount: registrationRequest.blockchainRetryCount,
          },
        },
      });
    } catch (blockchainError) {
      console.error("Lỗi khi retry blockchain:", blockchainError);

      registrationRequest.status = "blockchain_failed";
      await registrationRequest.save();

      return res.status(500).json({
        success: false,
        message: "Retry blockchain thất bại",
        error: blockchainError.message,
        registrationRequestId: registrationRequest._id,
        blockchainRetryCount: registrationRequest.blockchainRetryCount,
      });
    }
  } catch (error) {
    console.error("Lỗi khi retry blockchain:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi retry blockchain",
      error: error.message,
    });
  }
};

// ============ QUẢN LÝ THUỐC ============

// Xem tất cả thông tin thuốc (với phân trang và filter)
export const getAllDrugs = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, manufacturerId } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (manufacturerId) {
      filter.manufacturer = manufacturerId;
    }

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
      .populate("manufacturer", "name licenseNo taxCode country address")
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

// Thống kê thuốc
export const getDrugStatistics = async (req, res) => {
  try {
    const totalDrugs = await DrugInfo.countDocuments();

    const byStatus = {
      active: await DrugInfo.countDocuments({ status: "active" }),
      inactive: await DrugInfo.countDocuments({ status: "inactive" }),
      recalled: await DrugInfo.countDocuments({ status: "recalled" }),
    };

    // Thống kê theo manufacturer
    const drugsByManufacturer = await DrugInfo.aggregate([
      {
        $group: {
          _id: "$manufacturer",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "pharmacompanies",
          localField: "_id",
          foreignField: "_id",
          as: "manufacturerInfo",
        },
      },
      {
        $unwind: {
          path: "$manufacturerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          manufacturerId: "$_id",
          manufacturerName: "$manufacturerInfo.name",
          count: 1,
        },
      },
    ]);

    // Thống kê NFT theo drug
    const nftStats = await NFTInfo.aggregate([
      {
        $group: {
          _id: "$drug",
          totalNFTs: { $sum: 1 },
          byStatus: {
            $push: "$status",
          },
        },
      },
    ]);

    const totalNFTs = await NFTInfo.countDocuments();

    const nftByStatus = {
      minted: await NFTInfo.countDocuments({ status: "minted" }),
      transferred: await NFTInfo.countDocuments({ status: "transferred" }),
      sold: await NFTInfo.countDocuments({ status: "sold" }),
      expired: await NFTInfo.countDocuments({ status: "expired" }),
      recalled: await NFTInfo.countDocuments({ status: "recalled" }),
    };

    return res.status(200).json({
      success: true,
      data: {
        drugs: {
          total: totalDrugs,
          byStatus,
          byManufacturer: drugsByManufacturer,
        },
        nfts: {
          total: totalNFTs,
          byStatus: nftByStatus,
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thống kê thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê thuốc",
      error: error.message,
    });
  }
};

// ============ GIÁM SÁT HỆ THỐNG ============

// Xem lịch sử của toàn bộ luồng truy xuất từ sản xuất đến nhà thuốc
export const getSupplyChainHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, drugId, tokenId, status, startDate, endDate } = req.query;

    const filter = {};

    if (drugId) {
      filter.drug = drugId;
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Lấy lịch sử từ tất cả các stages
    const supplyChainHistory = [];

    // 1. Proof of Production (Manufacturing)
    const productions = await ProofOfProduction.find(drugId ? { drug: drugId } : {})
      .populate("manufacturer", "name licenseNo")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    for (const production of productions) {
      supplyChainHistory.push({
        stage: "manufacturing",
        stageName: "Sản xuất",
        id: production._id,
        drug: production.drug,
        manufacturer: production.manufacturer,
        quantity: production.quantity,
        mfgDate: production.mfgDate,
        expDate: production.expDate,
        chainTxHash: production.chainTxHash,
        createdAt: production.createdAt,
      });
    }

    // 2. Manufacturer Invoice (Manufacturer → Distributor)
    const manufacturerInvoices = await ManufacturerInvoice.find(filter)
      .populate("fromManufacturer", "username email fullName")
      .populate("toDistributor", "username email fullName")
      .populate("nftInfo")
      .populate({
        path: "proofOfProduction",
        populate: { path: "drug", select: "tradeName atcCode" }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    for (const invoice of manufacturerInvoices) {
      supplyChainHistory.push({
        stage: "transfer_to_distributor",
        stageName: "Chuyển giao cho Nhà phân phối",
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        drug: invoice.proofOfProduction?.drug || null,
        fromManufacturer: invoice.fromManufacturer,
        toDistributor: invoice.toDistributor,
        quantity: invoice.quantity,
        status: invoice.status,
        chainTxHash: invoice.chainTxHash,
        createdAt: invoice.createdAt,
      });
    }

    // 3. Proof of Distribution (Distributor received)
    const distributions = await ProofOfDistribution.find({})
      .populate("fromManufacturer", "username email fullName")
      .populate("toDistributor", "username email fullName")
      .populate("manufacturerInvoice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    for (const distribution of distributions) {
      supplyChainHistory.push({
        stage: "distributor_received",
        stageName: "Nhà phân phối đã nhận hàng",
        id: distribution._id,
        fromManufacturer: distribution.fromManufacturer,
        toDistributor: distribution.toDistributor,
        distributedQuantity: distribution.distributedQuantity,
        distributionDate: distribution.distributionDate,
        status: distribution.status,
        chainTxHash: distribution.chainTxHash,
        createdAt: distribution.createdAt,
      });
    }

    // 4. Commercial Invoice (Distributor → Pharmacy)
    const commercialInvoices = await CommercialInvoice.find(filter)
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .populate("nftInfo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    for (const invoice of commercialInvoices) {
      supplyChainHistory.push({
        stage: "transfer_to_pharmacy",
        stageName: "Chuyển giao cho Nhà thuốc",
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        drug: invoice.drug,
        fromDistributor: invoice.fromDistributor,
        toPharmacy: invoice.toPharmacy,
        quantity: invoice.quantity,
        status: invoice.status,
        chainTxHash: invoice.chainTxHash,
        createdAt: invoice.createdAt,
      });
    }

    // 5. Proof of Pharmacy (Pharmacy received)
    const pharmacyProofs = await ProofOfPharmacy.find({})
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName")
      .populate("commercialInvoice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    for (const proof of pharmacyProofs) {
      supplyChainHistory.push({
        stage: "pharmacy_received",
        stageName: "Nhà thuốc đã nhận hàng",
        id: proof._id,
        fromDistributor: proof.fromDistributor,
        toPharmacy: proof.toPharmacy,
        receivedQuantity: proof.receivedQuantity,
        receiptDate: proof.receiptDate,
        status: proof.status,
        receiptTxHash: proof.receiptTxHash,
        supplyChainCompleted: proof.supplyChainCompleted,
        createdAt: proof.createdAt,
      });
    }

    // Sắp xếp theo thời gian
    supplyChainHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Nếu có tokenId, filter theo tokenId
    let filteredHistory = supplyChainHistory;
    if (tokenId) {
      const nft = await NFTInfo.findOne({ tokenId });
      if (nft) {
        filteredHistory = supplyChainHistory.filter((item) => {
          if (item.drug && item.drug._id) {
            return item.drug._id.toString() === nft.drug.toString();
          }
          return false;
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        history: filteredHistory.slice(0, limitNum),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredHistory.length,
          pages: Math.ceil(filteredHistory.length / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử supply chain:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử supply chain",
      error: error.message,
    });
  }
};

// Xem lịch sử phân phối thuốc
export const getDistributionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, distributorId, pharmacyId, drugId, status, startDate, endDate } = req.query;

    const filter = {};

    if (distributorId) {
      filter.fromDistributor = distributorId;
    }

    if (pharmacyId) {
      filter.toPharmacy = pharmacyId;
    }

    if (drugId) {
      filter.drug = drugId;
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Lấy lịch sử phân phối từ CommercialInvoice và ProofOfPharmacy
    const commercialInvoices = await CommercialInvoice.find(filter)
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName")
      .populate("drug", "tradeName atcCode genericName")
      .populate("nftInfo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const proofs = await ProofOfPharmacy.find(filter)
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName")
      .populate("drug", "tradeName atcCode genericName")
      .populate("commercialInvoice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const distributionHistory = [];

    // Kết hợp CommercialInvoice và ProofOfPharmacy
    const invoiceMap = new Map();
    commercialInvoices.forEach((invoice) => {
      invoiceMap.set(invoice._id.toString(), {
        invoice,
        proof: null,
      });
    });

    proofs.forEach((proof) => {
      if (proof.commercialInvoice) {
        const invoiceId = proof.commercialInvoice._id || proof.commercialInvoice;
        if (invoiceMap.has(invoiceId.toString())) {
          invoiceMap.get(invoiceId.toString()).proof = proof;
        } else {
          invoiceMap.set(invoiceId.toString(), {
            invoice: null,
            proof,
          });
        }
      } else {
        distributionHistory.push({
          type: "proof_only",
          proof,
        });
      }
    });

    invoiceMap.forEach((value) => {
      distributionHistory.push({
        type: "full_record",
        invoice: value.invoice,
        proof: value.proof,
      });
    });

    // Sắp xếp theo thời gian
    distributionHistory.sort((a, b) => {
      const dateA = a.invoice?.createdAt || a.proof?.createdAt || new Date(0);
      const dateB = b.invoice?.createdAt || b.proof?.createdAt || new Date(0);
      return new Date(dateB) - new Date(dateA);
    });

    const total = await CommercialInvoice.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        distributionHistory: distributionHistory.slice(0, limitNum),
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

// Thống kê tổng quan hệ thống
export const getSystemStatistics = async (req, res) => {
  try {
    // Thống kê users
    const users = {
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

    // Thống kê business entities
    const businesses = {
      pharmaCompanies: await PharmaCompany.countDocuments(),
      distributors: await Distributor.countDocuments(),
      pharmacies: await Pharmacy.countDocuments(),
    };

    // Thống kê drugs và NFTs
    const drugs = {
      total: await DrugInfo.countDocuments(),
      active: await DrugInfo.countDocuments({ status: "active" }),
    };

    const nfts = {
      total: await NFTInfo.countDocuments(),
      byStatus: {
        minted: await NFTInfo.countDocuments({ status: "minted" }),
        transferred: await NFTInfo.countDocuments({ status: "transferred" }),
        sold: await NFTInfo.countDocuments({ status: "sold" }),
        expired: await NFTInfo.countDocuments({ status: "expired" }),
        recalled: await NFTInfo.countDocuments({ status: "recalled" }),
      },
    };

    // Thống kê invoices
    const invoices = {
      manufacturer: await ManufacturerInvoice.countDocuments(),
      commercial: await CommercialInvoice.countDocuments(),
    };

    // Thống kê proofs
    const proofs = {
      production: await ProofOfProduction.countDocuments(),
      distribution: await ProofOfDistribution.countDocuments(),
      pharmacy: await ProofOfPharmacy.countDocuments(),
    };

    return res.status(200).json({
      success: true,
      data: {
        users,
        businesses,
        drugs,
        nfts,
        invoices,
        proofs,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thống kê hệ thống:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thống kê hệ thống",
      error: error.message,
    });
  }
};

