import ManufacturerInvoice from "../models/ManufacturerInvoice.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";
import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import Distributor from "../models/Distributor.js";
import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import Pharmacy from "../models/Pharmacy.js";
import User from "../models/User.js";
import { getTrackingHistory } from "../services/blockchainService.js";
import { handleError } from "../utils/errorHandler.js";
import BusinessEntityFactory from "../services/factories/BusinessEntityFactory.js";
import QueryBuilderFactory from "../services/factories/QueryBuilderFactory.js";
import { DateHelper, DataAggregationService, StatisticsCalculationService, NFTService, ValidationService } from "../services/utils/index.js";
import { sendValidationError } from "../utils/validationResponse.js";
import ResponseFormatterFactory from "../services/factories/ResponseFormatterFactory.js";
import { validateRole } from "../utils/RoleValidationHelper.js";
import { checkEntityExistsWithMessage } from "../utils/EntityNotFoundHelper.js";
import { getUserPopulateFields, getDrugPopulateFields } from "../utils/PopulateHelper.js";
import { getDefaultSort } from "../utils/SortHelper.js";


export const getInvoicesFromManufacturer = async (req, res) => {
  try {
    const user = req.user;

    const filter = QueryBuilderFactory.createManufacturerInvoiceFilter(user, {
      status: req.query.status,
      search: req.query.search,
    });

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const invoices = await ManufacturerInvoice.find(filter)
      .populate("fromManufacturer", getUserPopulateFields())
      .populate("proofOfProduction")
      .sort(getDefaultSort())
      .skip(skip)
      .limit(limit);

    const total = await ManufacturerInvoice.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { invoices },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy danh sách đơn hàng:", res, "Lỗi server khi lấy danh sách đơn hàng");
  }
};

export const getInvoiceDetail = async (req, res) => {
  try {
    const user = req.user;
    const { invoiceId } = req.params;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    // Tìm invoice
    const invoice = await ManufacturerInvoice.findById(invoiceId)
      .populate("fromManufacturer", "username email fullName walletAddress")
      .populate("toDistributor", "username email fullName walletAddress")
      .populate("proofOfProduction");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    // Kiểm tra invoice thuộc về distributor này
    const toDistributorId = invoice.toDistributor._id || invoice.toDistributor;
    if (toDistributorId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem invoice này",
      });
    }

    // Lấy tokenIds từ NFTInfo sử dụng NFTService
    console.log("[getInvoiceDetail] Bắt đầu tìm tokenIds:", {
      invoiceId,
      invoiceStatus: invoice.status,
      chainTxHash: invoice.chainTxHash,
      hasProofOfProduction: !!invoice.proofOfProduction,
      distributorId: user._id,
    });

    const tokenIds = await NFTService.getTokenIdsFromInvoice(invoice, user);

    // Trả về invoice với tokenIds
    const invoiceObj = invoice.toObject();
    invoiceObj.tokenIds = tokenIds;

    console.log("[getInvoiceDetail]  Kết quả cuối cùng:", {
      invoiceId,
      tokenIdsFound: tokenIds.length,
      tokenIds: tokenIds.slice(0, 10),
    });

    return res.status(200).json({
      success: true,
      data: invoiceObj,
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy chi tiết invoice:", res, "Lỗi server khi lấy chi tiết invoice");
  }
};

export const confirmReceipt = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const {
      invoiceId,
      receivedBy,
      deliveryAddress,
      shippingInfo,
      notes,
      distributionDate,
      distributedQuantity,
    } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "invoiceId là bắt buộc",
      });
    }

    // Tìm invoice
    const invoice = await ManufacturerInvoice.findById(invoiceId)
      .populate("fromManufacturer", "username email fullName")
      .populate("toDistributor", "username email fullName");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    // Kiểm tra invoice thuộc về distributor này
    const toDistributorId = invoice.toDistributor._id || invoice.toDistributor;
    if (toDistributorId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xác nhận invoice này",
      });
    }

    // Kiểm tra invoice đã được sent chưa (manufacturer đã chuyển NFT)
    if (invoice.status !== "sent") {
      return res.status(400).json({
        success: false,
        message: `Invoice chưa được gửi. Trạng thái hiện tại: ${invoice.status}`,
      });
    }

    // Tìm hoặc tạo Proof of Distribution
    let proofOfDistribution = await ProofOfDistribution.findOne({
      manufacturerInvoice: invoiceId,
    });

    if (proofOfDistribution) {
      proofOfDistribution.status = "confirmed"; // Đang chờ Manufacture xác nhận
      if (receivedBy) proofOfDistribution.receivedBy = receivedBy;
      if (deliveryAddress) proofOfDistribution.deliveryAddress = deliveryAddress;
      if (shippingInfo) proofOfDistribution.shippingInfo = shippingInfo;
      if (notes) proofOfDistribution.notes = notes;
      if (distributionDate) proofOfDistribution.distributionDate = new Date(distributionDate);
      if (distributedQuantity) proofOfDistribution.distributedQuantity = distributedQuantity;
    } else {
      // Tạo mới proof of distribution
      proofOfDistribution = new ProofOfDistribution({
        fromManufacturer: invoice.fromManufacturer._id,
        toDistributor: user._id,
        manufacturerInvoice: invoiceId,
        status: "confirmed", // Đang chờ Manufacture xác nhận
        receivedBy,
        deliveryAddress,
        shippingInfo,
        notes,
        distributionDate: distributionDate ? new Date(distributionDate) : new Date(),
        distributedQuantity: distributedQuantity || invoice.quantity,
      });
    }

    await proofOfDistribution.save();

    return res.status(200).json({
      success: true,
      message: "Đã xác nhận nhận hàng thành công. Đang chờ Manufacturer xác nhận quyền NFT.",
      data: {
        proofOfDistribution,
        invoice,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi xác nhận nhận hàng:", res, "Lỗi server khi xác nhận nhận hàng");
  }
};

export const transferToPharmacy = async (req, res) => {
  try {
    const user = req.user;

    console.log("[transferToPharmacy] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      userWalletAddress: user.walletAddress,
      timestamp: new Date().toISOString(),
    });

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const userWalletValidation = ValidationService.validateWalletAddress(user.walletAddress);
    if (!userWalletValidation.valid) {
      return sendValidationError(res, "User chưa có wallet address");
    }

    const {
      pharmacyId,
      tokenIds,
      amounts,
      invoiceNumber,
      invoiceDate,
      quantity,
      unitPrice,
      totalAmount,
      vatRate,
      vatAmount,
      finalAmount,
      notes,
      deliveryAddress,
    } = req.body;

    console.log("[transferToPharmacy] Request body:", {
      pharmacyId,
      tokenIdsCount: Array.isArray(tokenIds) ? tokenIds.length : 0,
      tokenIds: Array.isArray(tokenIds) ? tokenIds.slice(0, 5) : tokenIds,
      amountsCount: Array.isArray(amounts) ? amounts.length : 0,
      amounts: Array.isArray(amounts) ? amounts.slice(0, 5) : amounts,
      quantity,
      invoiceNumber,
      notes,
    });

    const requiredValidation = ValidationService.validateRequiredFields({
      pharmacyId,
      tokenIds,
      amounts,
    });
    if (!requiredValidation.valid) {
      console.log("[transferToPharmacy]  Thiếu tham số:", {
        hasPharmacyId: !!pharmacyId,
        hasTokenIds: !!tokenIds,
        hasAmounts: !!amounts,
      });
      return sendValidationError(res, requiredValidation.message, requiredValidation.missingFields);
    }

    const arrayValidation = ValidationService.validateArray(tokenIds, "tokenIds");
    if (!arrayValidation.valid) {
      return sendValidationError(res, arrayValidation.message);
    }

    const amountsValidation = ValidationService.validateArray(amounts, "amounts");
    if (!amountsValidation.valid) {
      return sendValidationError(res, amountsValidation.message);
    }

    const lengthValidation = ValidationService.validateArrayLength(tokenIds, amounts, "tokenIds", "amounts");
    if (!lengthValidation.valid) {
      console.log("[transferToPharmacy]  Số lượng tokenIds và amounts không khớp:", {
        tokenIdsLength: tokenIds.length,
        amountsLength: amounts.length,
      });
      return sendValidationError(res, lengthValidation.message);
    }

    // Tìm pharmacy
    console.log("[transferToPharmacy] Đang tìm pharmacy...");
    const pharmacy = await Pharmacy.findById(pharmacyId).populate("user");
    if (!pharmacy || !pharmacy.user) {
      console.log("[transferToPharmacy]  Không tìm thấy pharmacy:", pharmacyId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy pharmacy",
      });
    }

    console.log("[transferToPharmacy]  Tìm thấy pharmacy:", {
      pharmacyId: pharmacy._id,
      pharmacyName: pharmacy.name,
      pharmacyWalletAddress: pharmacy.user?.walletAddress,
      hasUserWallet: !!pharmacy.user?.walletAddress,
    });

    const pharmacyWalletValidation = ValidationService.validateWalletAddress(pharmacy.user.walletAddress);
    if (!pharmacyWalletValidation.valid) {
      return sendValidationError(res, "Pharmacy chưa có wallet address");
    }

    // Kiểm tra quyền sở hữu NFT (NFT phải thuộc về distributor và đã được transferred)
    console.log("[transferToPharmacy] Kiểm tra quyền sở hữu NFT...");
    const nftValidation = await NFTService.validateNFTOwnership(tokenIds, user, "transferred");

    console.log("[transferToPharmacy] Kết quả kiểm tra NFT:", {
      requestedCount: nftValidation.requestedCount,
      foundCount: nftValidation.foundCount,
      valid: nftValidation.valid,
      sampleNFTs: NFTService.getNFTsWithSample(nftValidation.nfts, 3).sampleNFTs,
      missingTokenIds: nftValidation.missingTokenIds,
    });

    if (!nftValidation.valid) {
      console.log("[transferToPharmacy]  Một số NFT không thuộc về distributor hoặc không ở trạng thái transferred:", {
        requested: nftValidation.requestedCount,
        found: nftValidation.foundCount,
        missing: nftValidation.missingTokenIds.length,
        missingTokenIds: nftValidation.missingTokenIds,
      });
      return res.status(400).json({
        success: false,
        message: `Một số NFT không thuộc về bạn hoặc không ở trạng thái transferred. Missing: ${nftValidation.missingTokenIds.join(", ")}`,
      });
    }

    const nftInfos = nftValidation.nfts;

    // Lấy drug từ NFT đầu tiên
    const drugId = nftInfos[0].drug;
    console.log("[transferToPharmacy] Drug ID từ NFT:", drugId);

    // Tạo Commercial Invoice với trạng thái draft (chờ frontend gọi smart contract)
    const calculatedQuantity = quantity || amounts.reduce((sum, amt) => sum + amt, 0);
    console.log("[transferToPharmacy] Tạo Commercial Invoice...");
    const commercialInvoice = new CommercialInvoice({
      fromDistributor: user._id,
      toPharmacy: pharmacy.user._id,
      drug: drugId,
      invoiceNumber: invoiceNumber || `CI-${Date.now()}`,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      quantity: calculatedQuantity,
      unitPrice,
      totalAmount,
      vatRate,
      vatAmount,
      finalAmount,
      notes,
      deliveryAddress,
      status: "draft", // Chờ frontend gọi smart contract
    });

    await commercialInvoice.save();
    console.log("[transferToPharmacy]  Đã tạo Commercial Invoice:", {
      invoiceId: commercialInvoice._id,
      invoiceNumber: commercialInvoice.invoiceNumber,
      status: commercialInvoice.status,
      quantity: commercialInvoice.quantity,
      fromDistributor: commercialInvoice.fromDistributor,
      toPharmacy: commercialInvoice.toPharmacy,
    });

    // Tạo Proof of Pharmacy với trạng thái pending
    console.log("[transferToPharmacy] Tạo Proof of Pharmacy...");
    const proofOfPharmacy = new ProofOfPharmacy({
      fromDistributor: user._id,
      toPharmacy: pharmacy.user._id,
      drug: drugId,
      receiptDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      receivedQuantity: calculatedQuantity,
      status: "pending", // Đang chờ
      commercialInvoice: commercialInvoice._id,
    });

    await proofOfPharmacy.save();
    console.log("[transferToPharmacy]  Đã tạo Proof of Pharmacy:", {
      proofId: proofOfPharmacy._id,
      status: proofOfPharmacy.status,
      receivedQuantity: proofOfPharmacy.receivedQuantity,
      commercialInvoice: proofOfPharmacy.commercialInvoice,
    });

    console.log("[transferToPharmacy]  Hoàn thành:", {
      commercialInvoiceId: commercialInvoice._id,
      proofOfPharmacyId: proofOfPharmacy._id,
      pharmacyAddress: pharmacy.user.walletAddress,
      tokenIdsCount: tokenIds.length,
      tokenIds,
      amountsCount: amounts.length,
      amounts,
    });

    return res.status(200).json({
      success: true,
      message: "Đã lưu invoice vào database với trạng thái draft. Vui lòng gọi smart contract để chuyển NFT.",
      data: {
        commercialInvoice,
        proofOfPharmacy,
        pharmacyAddress: pharmacy.user.walletAddress,
        tokenIds,
        amounts,
      },
    });
  } catch (error) {
    console.error("[transferToPharmacy]  Lỗi:", {
      error: error.message,
      stack: error.stack,
      pharmacyId: req.body?.pharmacyId,
      tokenIds: req.body?.tokenIds,
      userId: req.user?._id,
      timestamp: new Date().toISOString(),
    });
    return handleError(error, "[transferToPharmacy] Lỗi:", res, "Lỗi server khi chuyển giao cho pharmacy");
  }
};

export const saveTransferToPharmacyTransaction = async (req, res) => {
  try {
    const user = req.user;

    console.log("[saveTransferToPharmacyTransaction] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
    });

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const {
      invoiceId,
      transactionHash,
      tokenIds,
    } = req.body;

    console.log("[saveTransferToPharmacyTransaction] Request body:", {
      invoiceId,
      transactionHash,
      tokenIdsCount: Array.isArray(tokenIds) ? tokenIds.length : 0,
      tokenIds: Array.isArray(tokenIds) ? tokenIds.slice(0, 5) : tokenIds,
    });

    if (!invoiceId || !transactionHash || !tokenIds) {
      console.log("[saveTransferToPharmacyTransaction]  Thiếu tham số:", {
        hasInvoiceId: !!invoiceId,
        hasTransactionHash: !!transactionHash,
        hasTokenIds: !!tokenIds,
      });
      return res.status(400).json({
        success: false,
        message: "invoiceId, transactionHash và tokenIds là bắt buộc",
      });
    }

    // Tìm invoice
    console.log("[saveTransferToPharmacyTransaction] Đang tìm invoice...");
    const commercialInvoice = await CommercialInvoice.findById(invoiceId);

    if (!commercialInvoice) {
      console.log("[saveTransferToPharmacyTransaction]  Không tìm thấy invoice:", invoiceId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    console.log("[saveTransferToPharmacyTransaction]  Tìm thấy invoice:", {
      invoiceId: commercialInvoice._id,
      invoiceNumber: commercialInvoice.invoiceNumber,
      status: commercialInvoice.status,
      fromDistributor: commercialInvoice.fromDistributor,
      toPharmacy: commercialInvoice.toPharmacy,
    });

    // Kiểm tra invoice thuộc về user này
    if (commercialInvoice.fromDistributor.toString() !== user._id.toString()) {
      console.log("[saveTransferToPharmacyTransaction]  Không có quyền:", {
        invoiceFromDistributor: commercialInvoice.fromDistributor.toString(),
        userId: user._id.toString(),
      });
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật invoice này",
      });
    }

    // Kiểm tra NFT trước khi cập nhật
    console.log("[saveTransferToPharmacyTransaction] Kiểm tra NFT trước khi cập nhật...");
    const existingNFTs = await NFTInfo.find({ tokenId: { $in: tokenIds } });
    console.log("[saveTransferToPharmacyTransaction] NFT hiện tại:", {
      requestedCount: tokenIds.length,
      foundCount: existingNFTs.length,
      sampleNFTs: existingNFTs.slice(0, 3).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        chainTxHash: nft.chainTxHash,
      })),
    });

    // Cập nhật invoice
    commercialInvoice.status = "sent";
    commercialInvoice.chainTxHash = transactionHash;
    await commercialInvoice.save();
    console.log("[saveTransferToPharmacyTransaction]  Đã cập nhật invoice:", {
      status: commercialInvoice.status,
      chainTxHash: commercialInvoice.chainTxHash,
    });

    // Cập nhật trạng thái NFT
    console.log("[saveTransferToPharmacyTransaction] Đang cập nhật NFT...");
    const updateResult = await NFTInfo.updateMany(
      { tokenId: { $in: tokenIds } },
      {
        $set: {
          status: "sold",
          owner: commercialInvoice.toPharmacy,
          chainTxHash: transactionHash, // Lưu chainTxHash để có thể tìm lại sau này
        },
      }
    );

    console.log("[saveTransferToPharmacyTransaction]  Kết quả cập nhật NFT:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      requestedCount: tokenIds.length,
    });

    // Verify: Kiểm tra NFT đã được cập nhật đúng chưa
    const updatedNFTs = await NFTInfo.find({ 
      tokenId: { $in: tokenIds },
      chainTxHash: transactionHash,
    });
    console.log("[saveTransferToPharmacyTransaction]  Verify NFT sau khi cập nhật:", {
      foundWithChainTxHash: updatedNFTs.length,
      sampleUpdatedNFTs: updatedNFTs.slice(0, 3).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        chainTxHash: nft.chainTxHash,
      })),
    });

    // Cập nhật Proof of Pharmacy
    console.log("[saveTransferToPharmacyTransaction] Đang cập nhật Proof of Pharmacy...");
    const proofOfPharmacy = await ProofOfPharmacy.findOne({
      commercialInvoice: invoiceId,
    });

    if (proofOfPharmacy) {
      proofOfPharmacy.receiptTxHash = transactionHash;
      proofOfPharmacy.status = "received";
      await proofOfPharmacy.save();
      console.log("[saveTransferToPharmacyTransaction]  Đã cập nhật Proof of Pharmacy:", {
        proofId: proofOfPharmacy._id,
        status: proofOfPharmacy.status,
        receiptTxHash: proofOfPharmacy.receiptTxHash,
      });
    } else {
      console.log("[saveTransferToPharmacyTransaction]  Không tìm thấy Proof of Pharmacy cho invoice:", invoiceId);
    }

    console.log("[saveTransferToPharmacyTransaction]  Hoàn thành:", {
      invoiceId: commercialInvoice._id,
      transactionHash,
      tokenIdsCount: tokenIds.length,
      updatedNFTs: updateResult.modifiedCount,
      proofOfPharmacyId: proofOfPharmacy?._id,
    });

    return res.status(200).json({
      success: true,
      message: "Lưu transaction transfer thành công",
      data: {
        commercialInvoice,
        proofOfPharmacy,
        transactionHash,
        tokenIds,
      },
    });
  } catch (error) {
    console.error("[saveTransferToPharmacyTransaction]  Lỗi:", {
      error: error.message,
      stack: error.stack,
      invoiceId: req.body?.invoiceId,
      transactionHash: req.body?.transactionHash,
      userId: req.user?._id,
      timestamp: new Date().toISOString(),
    });
    return handleError(error, "[saveTransferToPharmacyTransaction] Lỗi:", res, "Lỗi server khi lưu transaction transfer");
  }
};

export const getDistributionHistory = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const filter = QueryBuilderFactory.createProofOfDistributionFilter(user, {
      status: req.query.status,
      search: req.query.search,
    });

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const distributions = await ProofOfDistribution.find(filter)
      .populate("fromManufacturer", "username email fullName")
      .populate("manufacturerInvoice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ProofOfDistribution.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { distributions },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy lịch sử phân phối:", res, "Lỗi server khi lấy lịch sử phân phối");
  }
};

export const getTransferToPharmacyHistory = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const filter = QueryBuilderFactory.createCommercialInvoiceFilter(user, {
      status: req.query.status,
    });
    if (req.query.search) {
      const pharmacies = await Pharmacy.find({
        name: { $regex: req.query.search, $options: "i" },
      }).select("user");
      
      const pharmacyUserIds = pharmacies.map(p => p.user).filter(Boolean);
      
      if (pharmacyUserIds.length > 0) {
        filter.$or = [
          { toPharmacy: { $in: pharmacyUserIds } },
          { invoiceNumber: { $regex: req.query.search, $options: "i" } },
        ];
      } else {
        filter.$or = [
          { invoiceNumber: { $regex: req.query.search, $options: "i" } },
        ];
      }
    }

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const commercialInvoices = await CommercialInvoice.find(filter)
      .populate("toPharmacy", getUserPopulateFields())
      .populate("drug", getDrugPopulateFields())
      .sort(getDefaultSort())
      .skip(skip)
      .limit(limit);

    const total = await CommercialInvoice.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { invoices: commercialInvoices },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy lịch sử chuyển giao:", res, "Lỗi server khi lấy lịch sử chuyển giao");
  }
};

export const getStatistics = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    // Thống kê đơn hàng từ manufacturer
    const totalInvoices = await ManufacturerInvoice.countDocuments({
      toDistributor: user._id,
    });

    const invoiceStatusStats = {
      pending: await ManufacturerInvoice.countDocuments({
        toDistributor: user._id,
        status: "pending",
      }),
      sent: await ManufacturerInvoice.countDocuments({
        toDistributor: user._id,
        status: "sent",
      }),
      paid: await ManufacturerInvoice.countDocuments({
        toDistributor: user._id,
        status: "paid",
      }),
    };

    // Thống kê lịch sử phân phối
    const totalDistributions = await ProofOfDistribution.countDocuments({
      toDistributor: user._id,
    });

    const distributionStatusStats = {
      pending: await ProofOfDistribution.countDocuments({
        toDistributor: user._id,
        status: "pending",
      }),
      in_transit: await ProofOfDistribution.countDocuments({
        toDistributor: user._id,
        status: "in_transit",
      }),
      delivered: await ProofOfDistribution.countDocuments({
        toDistributor: user._id,
        status: "delivered",
      }),
      confirmed: await ProofOfDistribution.countDocuments({
        toDistributor: user._id,
        status: "confirmed",
      }),
      rejected: await ProofOfDistribution.countDocuments({
        toDistributor: user._id,
        status: "rejected",
      }),
    };

    // Thống kê lượt chuyển giao cho Pharmacy
    const totalTransfersToPharmacy = await CommercialInvoice.countDocuments({
      fromDistributor: user._id,
    });

    const transferStatusStats = {
      draft: await CommercialInvoice.countDocuments({
        fromDistributor: user._id,
        status: "draft",
      }),
      sent: await CommercialInvoice.countDocuments({
        fromDistributor: user._id,
        status: "sent",
      }),
      paid: await CommercialInvoice.countDocuments({
        fromDistributor: user._id,
        status: "paid",
      }),
    };

    // Thống kê NFT
    const nfts = await NFTInfo.find({
      owner: user._id,
    });

    const nftStatusStats = {
      transferred: nfts.filter((nft) => nft.status === "transferred").length,
      sold: nfts.filter((nft) => nft.status === "sold").length,
    };

    return res.status(200).json({
      success: true,
      data: {
        invoices: {
          total: totalInvoices,
          byStatus: invoiceStatusStats,
        },
        distributions: {
          total: totalDistributions,
          byStatus: distributionStatusStats,
        },
        transfersToPharmacy: {
          total: totalTransfersToPharmacy,
          byStatus: transferStatusStats,
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
      .populate("owner", "username email fullName")
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
    const manufacturerInvoice = await ManufacturerInvoice.findOne({
      toDistributor: user._id,
    }).populate("fromManufacturer", "username email fullName");

    const commercialInvoice = await CommercialInvoice.findOne({
      fromDistributor: user._id,
    }).populate("toPharmacy", "username email fullName");

    return res.status(200).json({
      success: true,
      data: {
        nft,
        blockchainHistory,
        manufacturerInvoice,
        commercialInvoice,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi theo dõi hành trình:", res, "Lỗi server khi theo dõi hành trình");
  }
};

export const getDrugs = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const { search, status } = req.query;

    const filter = QueryBuilderFactory.createDrugSearchFilter({ search, status });
    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const drugs = await DrugInfo.find(filter)
      .populate("manufacturer", "name")
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

export const searchDrugByATCCode = async (req, res) => {
  try {
    const user = req.user;
    const { atcCode } = req.query;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    if (!atcCode) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp ATC code",
      });
    }

    const drug = await DrugInfo.findOne({
      atcCode: { $regex: atcCode, $options: "i" },
    }).populate("manufacturer", "name");

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

export const getDistributorInfo = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const distributor = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "distributor"
    );

    const userInfo = await User.findById(user._id).select("-password");

    return res.status(200).json({
      success: true,
      data: {
        user: userInfo,
        distributor,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi lấy thông tin distributor:", res, "Lỗi server khi lấy thông tin distributor");
  }
};

export const getPharmacies = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const filter = QueryBuilderFactory.createPharmacySearchFilter({
      status: req.query.status,
      search: req.query.search,
    });

    const { page, limit, skip } = QueryBuilderFactory.createPaginationOptions(req.query);

    const pharmacies = await Pharmacy.find(filter)
      .populate("user", getUserPopulateFields(true))
      .sort(getDefaultSort())
      .skip(skip)
      .limit(limit);

    const total = await Pharmacy.countDocuments(filter);

    return res.status(200).json(
      ResponseFormatterFactory.formatPaginatedResponse(
        { pharmacies },
        total,
        page,
        limit
      )
    );
  } catch (error) {
    return handleError(error, "Lỗi khi lấy danh sách pharmacies:", res, "Lỗi server khi lấy danh sách pharmacies");
  }
};

export const distributorChartOneWeek = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const distributor = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "distributor"
    );

    const { start: sevenDaysAgo } = DateHelper.getWeekRange();
    const invoices = await ManufacturerInvoice.find({
      toDistributor: user._id,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("proofOfProduction")
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
    return handleError(error, "Lỗi khi lấy biểu đồ 1 tuần distributor:", res, "Lỗi server khi lấy dữ liệu biểu đồ 1 tuần");
  }
};

export const distributorChartTodayYesterday = async (req, res) => {
  try {
    const user = req.user;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const distributor = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "distributor"
    );

    const { start: startOfToday } = DateHelper.getTodayRange();
    const { start: startOfYesterday } = DateHelper.getYesterdayRange();

    // Đếm số invoice của hôm qua
    const yesterdayCount = await ManufacturerInvoice.countDocuments({
      toDistributor: user._id,
      createdAt: { $gte: startOfYesterday, $lt: startOfToday },
    });

    // Đếm số invoice của hôm nay
    const todayCount = await ManufacturerInvoice.countDocuments({
      toDistributor: user._id,
      createdAt: { $gte: startOfToday },
    });

    // Tính chênh lệch và phần trăm thay đổi
    const { diff, percentChange } = StatisticsCalculationService.calculateTodayYesterdayStats(
      todayCount,
      yesterdayCount
    );

    const todayInvoices = await ManufacturerInvoice.find({
      toDistributor: user._id,
      createdAt: { $gte: startOfToday },
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("proofOfProduction")
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
    return handleError(error, "Lỗi khi lấy biểu đồ so sánh distributor:", res, "Lỗi server khi lấy dữ liệu biểu đồ");
  }
};

export const getDistributorInvoicesByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const { start, end } = DateHelper.parseDateRange(startDate, endDate);

    const distributor = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "distributor"
    );

    // Query invoices từ manufacturer trong khoảng thời gian
    const invoices = await ManufacturerInvoice.find({
      toDistributor: user._id,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("proofOfProduction")
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
    return handleError(error, "Lỗi khi thống kê invoices theo khoảng thời gian:", res, "Lỗi server khi thống kê");
  }
};

export const getDistributorDistributionsByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

    const { start, end } = DateHelper.parseDateRange(startDate, endDate);

    const distributor = await BusinessEntityFactory.getBusinessEntityWithValidation(
      user,
      "distributor"
    );

    // Query distributions trong khoảng thời gian
    const distributions = await ProofOfDistribution.find({
      toDistributor: user._id,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("manufacturerInvoice")
      .sort({ createdAt: -1 });

    // Tính tổng số lượng
    const totalQuantity = DataAggregationService.calculateTotalQuantity(distributions, 'distributedQuantity');

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = DataAggregationService.groupDistributionsByDate(distributions);

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
          totalDistributions: distributions.length,
          totalQuantity,
          averagePerDay: StatisticsCalculationService.calculateAveragePerDay(distributions.length, days),
        },
        dailyStats,
        distributions,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi thống kê distributions theo khoảng thời gian:", res, "Lỗi server khi thống kê");
  }
};

export const getDistributorTransfersToPharmacyByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    const roleError = validateRole(user, "distributor", res);
    if (roleError) return roleError;

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

    const distributor = await Distributor.findOne({ user: user._id });
    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
      });
    }

    // Query commercial invoices (chuyển cho pharmacy) trong khoảng thời gian
    const commercialInvoices = await CommercialInvoice.find({
      fromDistributor: user._id,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    })
      .populate("toPharmacy", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 });

    // Tính tổng số lượng
    const totalQuantity = commercialInvoices.reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = {};
    commercialInvoices.forEach((inv) => {
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
          totalInvoices: commercialInvoices.length,
          totalQuantity,
          averagePerDay: commercialInvoices.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        },
        dailyStats,
        invoices: commercialInvoices,
      },
    });
  } catch (error) {
    return handleError(error, "Lỗi khi thống kê transfers to pharmacy theo khoảng thời gian:", res, "Lỗi server khi thống kê");
  }
};

