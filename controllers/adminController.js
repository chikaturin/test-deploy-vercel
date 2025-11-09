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
import { handleError } from "../utils/errorHandler.js";

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
    return handleError(error, "Lỗi khi lấy thống kê đơn đăng ký:", res, "Lỗi server khi lấy thống kê đơn đăng ký");
  }
};

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
    return handleError(error, "Lỗi khi retry blockchain:", res, "Lỗi server khi retry blockchain");
  }
};


export const getAllDrugs = async (req, res) => {
  try {
    const { search, status, manufacturerId } = req.query;

    const filter = QueryBuilderFactory.createDrugSearchFilter({
      search,
      status,
      manufacturerId,
    });
    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const drugs = await DrugInfo.find(filter)
      .populate("manufacturer", "name licenseNo taxCode country address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await DrugInfo.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { drugs },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy danh sách thuốc:", res, "Lỗi server khi lấy danh sách thuốc");
  }
};

export const getDrugDetails = async (req, res) => {
  try {
    const { drugId } = req.params;

    const drug = await DrugInfo.findById(drugId)
      .populate("manufacturer", "name licenseNo taxCode country address contactEmail contactPhone walletAddress status");

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    // Lấy thông tin NFTs liên quan
    const nfts = await NFTInfo.find({ drug: drugId })
      .select("tokenId serialNumber batchNumber status owner createdAt chainTxHash mfgDate expDate quantity unit")
      .populate("owner", "username email fullName role");

    // Lấy lịch sử sản xuất
    const productionHistory = await ProofOfProduction.find({ drug: drugId })
      .populate("manufacturer", "name licenseNo")
      .sort({ createdAt: -1 });

    // Lấy lịch sử chuyển giao cho distributor
    const manufacturerInvoices = await ManufacturerInvoice.find({})
      .populate({
        path: "proofOfProduction",
        match: { drug: drugId },
        populate: { path: "drug" }
      })
      .populate("fromManufacturer", "username email fullName")
      .populate("toDistributor", "username email fullName")
      .sort({ createdAt: -1 });

    const filteredManufacturerInvoices = manufacturerInvoices.filter(
      (invoice) => invoice.proofOfProduction && invoice.proofOfProduction.drug
    );

    // Lấy lịch sử chuyển giao cho pharmacy
    const commercialInvoices = await CommercialInvoice.find({ drug: drugId })
      .populate("fromDistributor", "username email fullName")
      .populate("toPharmacy", "username email fullName")
      .populate("nftInfo")
      .sort({ createdAt: -1 });

    // Thống kê NFT theo status
    const nftStats = {
      total: nfts.length,
      byStatus: {
        minted: nfts.filter((nft) => nft.status === "minted").length,
        transferred: nfts.filter((nft) => nft.status === "transferred").length,
        sold: nfts.filter((nft) => nft.status === "sold").length,
        expired: nfts.filter((nft) => nft.status === "expired").length,
        recalled: nfts.filter((nft) => nft.status === "recalled").length,
      },
    };

    // Thống kê số lượng đã sản xuất
    const totalProduced = productionHistory.reduce((sum, prod) => sum + (prod.quantity || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        drug,
        nfts,
        nftStats,
        productionHistory,
        manufacturerInvoices: filteredManufacturerInvoices,
        commercialInvoices,
        statistics: {
          totalProduced,
          totalNFTs: nfts.length,
          totalManufacturerInvoices: filteredManufacturerInvoices.length,
          totalCommercialInvoices: commercialInvoices.length,
        },
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy chi tiết thuốc:", res, "Lỗi server khi lấy chi tiết thuốc");
  }
};

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
    return handleError(error, "Lỗi khi lấy thống kê thuốc:", res, "Lỗi server khi lấy thống kê thuốc");
  }
};

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
    return handleError(error, "Lỗi khi lấy lịch sử supply chain:", res, "Lỗi server khi lấy lịch sử supply chain");
  }
};


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
    return handleError(error, "Lỗi khi lấy lịch sử phân phối:", res, "Lỗi server khi lấy lịch sử phân phối");
  }
};

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
    return handleError(error, "Lỗi khi lấy thống kê hệ thống:", res, "Lỗi server khi lấy thống kê hệ thống");
  }
};

export const getBatchList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      batchNumber,
      manufacturer,
      status,
      drugName,
      fromDate,
      toDate,
    } = req.query;

    let query = {};
    if (batchNumber) {
      query.batchNumber = { $regex: batchNumber, $options: 'i' };
    }
    if (manufacturer) {
      query.manufacturer = manufacturer;
    }
    if (fromDate || toDate) {
      query.mfgDate = {};
      if (fromDate) query.mfgDate.$gte = new Date(fromDate);
      if (toDate) query.mfgDate.$lte = new Date(toDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const batches = await ProofOfProduction.find(query)
      .populate('manufacturer', 'name licenseNo address')
      .populate('drug', 'drugName registrationNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await ProofOfProduction.countDocuments(query);

    const enrichedBatches = await Promise.all(
      batches.map(async (batch) => {
        const batchNfts = await NFTInfo.find({ batchNumber: batch.batchNumber })
          .select('_id status')
          .lean();
        const nftIds = batchNfts.map((n) => n._id);

        const nftCount = batchNfts.length;
        const distributedCount = batchNfts.filter((n) => ['transferred', 'sold'].includes(n.status)).length;

        const completedInvoices = await CommercialInvoice.countDocuments({
          nftInfo: { $in: nftIds },
          supplyChainCompleted: true,
        });

        let batchStatus = 'produced';
        if (completedInvoices > 0) batchStatus = 'completed';
        else if (distributedCount > 0) batchStatus = 'in_transit';

        return {
          batchNumber: batch.batchNumber,
          drug: batch.drug,
          manufacturer: batch.manufacturer,
          mfgDate: batch.mfgDate,
          expDate: batch.expDate,
          totalQuantity: batch.quantity,
          nftCount,
          distributedCount,
          completedCount: completedInvoices,
          status: batchStatus,
          chainTxHash: batch.chainTxHash,
          createdAt: batch.createdAt,
        };
      })
    );

    let filteredBatches = enrichedBatches;
    if (status) {
      filteredBatches = enrichedBatches.filter((b) => b.status === status);
    }
    if (drugName && filteredBatches.length > 0) {
      filteredBatches = filteredBatches.filter(
        (b) => b.drug && b.drug.drugName && b.drug.drugName.toLowerCase().includes(drugName.toLowerCase())
      );
    }

    return res.json({
      success: true,
      data: filteredBatches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    return handleError(error, "Error getting batch list:", res, "Failed to get batch list");
  }
};

export const getBatchJourney = async (req, res) => {
  try {
    const { batchNumber } = req.params;
    if (!batchNumber) {
      return res.status(400).json({ success: false, message: 'Batch number is required' });
    }

    const production = await ProofOfProduction.findOne({ batchNumber })
      .populate('manufacturer', 'name licenseNo taxCode address country walletAddress')
      .populate('drug', 'drugName registrationNo activeIngredient dosageForm strength')
      .lean();

    if (!production) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const nfts = await NFTInfo.find({ batchNumber }).populate('owner', 'username email role').lean();
    const nftIds = nfts.map((n) => n._id);

    const manufacturerInvoices = await ManufacturerInvoice.find({
      $or: [{ proofOfProduction: production._id }, { nftInfo: { $in: nftIds } }],
    })
      .populate('fromManufacturer', 'username email')
      .populate('toDistributor', 'username email')
      .populate('nftInfo', 'tokenId serialNumber status')
      .lean();

    const distributionProofs = await ProofOfDistribution.find({
      $or: [
        { proofOfProduction: production._id },
        { manufacturerInvoice: { $in: manufacturerInvoices.map((i) => i._id) } },
        { nftInfo: { $in: nftIds } },
      ],
    })
      .populate('fromManufacturer', 'username email')
      .populate('toDistributor', 'username email')
      .populate('nftInfo', 'tokenId serialNumber status')
      .populate('manufacturerInvoice', 'invoiceNumber status')
      .lean();

    const commercialInvoices = await CommercialInvoice.find({ nftInfo: { $in: nftIds } })
      .populate('fromDistributor', 'username email')
      .populate('toPharmacy', 'username email')
      .populate('nftInfo', 'tokenId serialNumber status')
      .populate('proofOfPharmacy')
      .lean();

    const pharmacyProofs = await ProofOfPharmacy.find({
      $or: [
        { proofOfDistribution: { $in: distributionProofs.map((d) => d._id) } },
        { commercialInvoice: { $in: commercialInvoices.map((c) => c._id) } },
        { nftInfo: { $in: nftIds } },
      ],
    })
      .populate('fromDistributor', 'username email')
      .populate('toPharmacy', 'username email')
      .populate('nftInfo', 'tokenId serialNumber status')
      .populate('commercialInvoice', 'invoiceNumber status')
      .lean();

    const manufacturerDetails = await PharmaCompany.findOne({ user: production.manufacturer._id }).lean();

    const distributorUserIds = [
      ...new Set([
        ...manufacturerInvoices.map((inv) => inv.toDistributor?._id?.toString()),
        ...distributionProofs.map((dp) => dp.toDistributor?._id?.toString()),
      ].filter(Boolean)),
    ];
    const distributorDetails = await Distributor.find({ user: { $in: distributorUserIds } })
      .populate('user', 'username email')
      .lean();

    const pharmacyUserIds = [
      ...new Set([
        ...commercialInvoices.map((inv) => inv.toPharmacy?._id?.toString()),
        ...pharmacyProofs.map((pp) => pp.toPharmacy?._id?.toString()),
      ].filter(Boolean)),
    ];
    const pharmacyDetails = await Pharmacy.find({ user: { $in: pharmacyUserIds } })
      .populate('user', 'username email')
      .lean();

    const timeline = [];
    timeline.push({
      step: 1,
      stage: 'production',
      timestamp: production.createdAt,
      entity: {
        type: 'pharma_company',
        name: production.manufacturer.name,
        licenseNo: manufacturerDetails?.licenseNo,
        address: manufacturerDetails?.address,
        walletAddress: production.manufacturer.walletAddress,
      },
      details: {
        batchNumber: production.batchNumber,
        drug: production.drug,
        quantity: production.quantity,
        mfgDate: production.mfgDate,
        expDate: production.expDate,
        qaInspector: production.qaInspector,
        qaReportUri: production.qaReportUri,
        chainTxHash: production.chainTxHash,
      },
      nftsMinted: nfts.length,
      status: 'completed',
    });

    manufacturerInvoices.forEach((invoice, index) => {
      const distributorDetail = distributorDetails.find(
        (d) => d.user._id.toString() === invoice.toDistributor?._id?.toString()
      );
      const proof = distributionProofs.find(
        (dp) => dp.manufacturerInvoice?._id?.toString() === invoice._id.toString()
      );

      timeline.push({
        step: 2 + index * 2,
        stage: 'transfer_to_distributor',
        timestamp: invoice.createdAt,
        entity: {
          type: 'distributor',
          name: distributorDetail?.name,
          licenseNo: distributorDetail?.licenseNo,
          address: distributorDetail?.address,
          walletAddress: invoice.toDistributor?.walletAddress,
        },
        details: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          quantity: invoice.quantity,
          nfts: invoice.nftInfo,
          deliveryAddress: invoice.deliveryInfo?.address,
          shippingMethod: invoice.deliveryInfo?.shippingMethod,
          estimatedDelivery: invoice.deliveryInfo?.estimatedDelivery,
          chainTxHash: invoice.chainTxHash,
          status: invoice.status,
        },
        proof: proof
          ? {
              receivedAt: proof.verifiedAt,
              receivedBy: proof.receivedBy,
              verificationCode: proof.verificationCode,
              deliveryAddress: proof.deliveryAddress,
              status: proof.status,
              transferTxHash: proof.transferTxHash,
            }
          : null,
      });
    });

    commercialInvoices.forEach((invoice, index) => {
      const pharmacyDetail = pharmacyDetails.find(
        (p) => p.user._id.toString() === invoice.toPharmacy?._id?.toString()
      );
      const proof = pharmacyProofs.find(
        (pp) => pp.commercialInvoice?._id?.toString() === invoice._id.toString()
      );

      timeline.push({
        step: 2 + manufacturerInvoices.length * 2 + index * 2,
        stage: 'transfer_to_pharmacy',
        timestamp: invoice.createdAt,
        entity: {
          type: 'pharmacy',
          name: pharmacyDetail?.name,
          licenseNo: pharmacyDetail?.licenseNo,
          address: pharmacyDetail?.address,
          walletAddress: invoice.toPharmacy?.walletAddress,
        },
        details: {
          invoiceNumber: invoice.invoiceNumber,
          quantity: invoice.quantity,
          nfts: invoice.nftInfo,
          deliveryAddress: invoice.deliveryInfo?.address,
          shippingMethod: invoice.deliveryInfo?.shippingMethod,
          estimatedDelivery: invoice.deliveryInfo?.estimatedDelivery,
          chainTxHash: invoice.chainTxHash,
          supplyChainCompleted: invoice.supplyChainCompleted,
          status: invoice.status,
        },
        proof: proof
          ? {
              receivedAt: proof.completedAt,
              receivedBy: proof.receivedBy,
              receiptAddress: proof.receiptAddress,
              qualityCheck: proof.qualityCheck,
              status: proof.status,
              receiptTxHash: proof.receiptTxHash,
              supplyChainCompleted: proof.supplyChainCompleted,
            }
          : null,
      });
    });

    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const statistics = {
      totalNFTs: nfts.length,
      nftsByStatus: {
        minted: nfts.filter((n) => n.status === 'minted').length,
        transferred: nfts.filter((n) => n.status === 'transferred').length,
        sold: nfts.filter((n) => n.status === 'sold').length,
        expired: nfts.filter((n) => n.status === 'expired').length,
        recalled: nfts.filter((n) => n.status === 'recalled').length,
      },
      distributorsInvolved: distributorDetails.length,
      pharmaciesInvolved: pharmacyDetails.length,
      transfersToDistributors: manufacturerInvoices.length,
      transfersToPharmacies: commercialInvoices.length,
      completedSupplyChains: commercialInvoices.filter((inv) => inv.supplyChainCompleted).length,
    };

    const journey = {
      batchInfo: {
        batchNumber: production.batchNumber,
        drug: production.drug,
        manufacturer: { ...production.manufacturer, ...manufacturerDetails },
        mfgDate: production.mfgDate,
        expDate: production.expDate,
        quantity: production.quantity,
        chainTxHash: production.chainTxHash,
        createdAt: production.createdAt,
      },
      timeline,
      nfts: nfts.map((nft) => ({
        tokenId: nft.tokenId,
        serialNumber: nft.serialNumber,
        status: nft.status,
        currentOwner: nft.owner,
      })),
      statistics,
      entities: {
        manufacturer: manufacturerDetails,
        distributors: distributorDetails,
        pharmacies: pharmacyDetails,
      },
    };

    return res.json({ success: true, data: journey });
  } catch (error) {
    return handleError(error, "Error getting batch journey:", res, "Failed to get batch journey");
  }
};

export const getNFTJourney = async (req, res) => {
  try {
    const { tokenId } = req.params;
    if (!tokenId) {
      return res.status(400).json({ success: false, message: 'Token ID is required' });
    }

    const nft = await NFTInfo.findOne({ tokenId }).populate('owner', 'username email role').populate('proofOfProduction').lean();
    if (!nft) {
      return res.status(404).json({ success: false, message: 'NFT not found' });
    }

    const production = await ProofOfProduction.findById(nft.proofOfProduction)
      .populate('manufacturer', 'name licenseNo taxCode address country walletAddress')
      .populate('drug', 'drugName registrationNo activeIngredient dosageForm strength')
      .lean();

    const timeline = [];
    timeline.push({
      step: 1,
      stage: 'production',
      timestamp: production.createdAt,
      entity: { type: 'pharma_company', name: production.manufacturer.name, address: production.manufacturer.address },
      details: { batchNumber: production.batchNumber, tokenId: nft.tokenId, serialNumber: nft.serialNumber, mfgDate: production.mfgDate, expDate: production.expDate },
    });

    const manufacturerInvoices = await ManufacturerInvoice.find({ nftInfo: nft._id }).populate('toDistributor', 'username email').lean();
    for (const invoice of manufacturerInvoices) {
      const distributorDetail = await Distributor.findOne({ user: invoice.toDistributor?._id }).lean();
      const proof = await ProofOfDistribution.findOne({ manufacturerInvoice: invoice._id, nftInfo: nft._id }).lean();
      timeline.push({
        step: timeline.length + 1,
        stage: 'transfer_to_distributor',
        timestamp: invoice.createdAt,
        entity: { type: 'distributor', name: distributorDetail?.name, address: distributorDetail?.address },
        details: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, deliveryAddress: invoice.deliveryInfo?.address },
        proof: proof ? { receivedAt: proof.verifiedAt, receivedBy: proof.receivedBy, status: proof.status } : null,
      });
    }

    const commercialInvoices = await CommercialInvoice.find({ nftInfo: nft._id }).populate('toPharmacy', 'username email').lean();
    for (const invoice of commercialInvoices) {
      const pharmacyDetail = await Pharmacy.findOne({ user: invoice.toPharmacy?._id }).lean();
      const proof = await ProofOfPharmacy.findOne({ commercialInvoice: invoice._id, nftInfo: nft._id }).lean();
      timeline.push({
        step: timeline.length + 1,
        stage: 'transfer_to_pharmacy',
        timestamp: invoice.createdAt,
        entity: { type: 'pharmacy', name: pharmacyDetail?.name, address: pharmacyDetail?.address },
        details: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, supplyChainCompleted: invoice.supplyChainCompleted },
        proof: proof ? { receivedAt: proof.completedAt, receivedBy: proof.receivedBy, status: proof.status, supplyChainCompleted: proof.supplyChainCompleted } : null,
      });
    }

    return res.json({ success: true, data: { nftInfo: nft, batchInfo: { batchNumber: production.batchNumber, drug: production.drug, manufacturer: production.manufacturer, mfgDate: production.mfgDate, expDate: production.expDate }, timeline } });
  } catch (error) {
    return handleError(error, "Error getting NFT journey:", res, "Failed to get NFT journey");
  }
};

