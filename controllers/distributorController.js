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

// ============ QUẢN LÝ ĐƠN HÀNG TỪ PHARMA COMPANY ============

// Xem danh sách đơn hàng từ pharma company
export const getInvoicesFromManufacturer = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem đơn hàng",
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { toDistributor: user._id };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const invoices = await ManufacturerInvoice.find(filter)
      .populate("fromManufacturer", "username email fullName")
      .populate("proofOfProduction")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ManufacturerInvoice.countDocuments(filter);

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


// Lấy chi tiết invoice với tokenIds
export const getInvoiceDetail = async (req, res) => {
  try {
    const user = req.user;
    const { invoiceId } = req.params;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem chi tiết invoice",
      });
    }

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

    // Lấy tokenIds từ NFTInfo
    // Có thể tìm theo nhiều cách tương tự approveDistribution
    console.log("[getInvoiceDetail] Bắt đầu tìm tokenIds:", {
      invoiceId,
      invoiceStatus: invoice.status,
      chainTxHash: invoice.chainTxHash,
      hasProofOfProduction: !!invoice.proofOfProduction,
      distributorId: user._id,
    });

    let tokenIds = [];
    
    // Thử 1: Tìm theo chainTxHash (không cần owner, vì NFT có thể đã được transferred)
    if (invoice.chainTxHash) {
      console.log("[getInvoiceDetail]  Thử 1: Tìm theo chainTxHash:", invoice.chainTxHash);
      let nfts = await NFTInfo.find({
        chainTxHash: invoice.chainTxHash,
      }).select("tokenId owner status");
      
      console.log("[getInvoiceDetail] Thử 1 - Kết quả (không filter owner):", {
        found: nfts.length,
        tokenIds: nfts.map(nft => nft.tokenId),
        sampleNFTs: nfts.slice(0, 3).map(nft => ({
          tokenId: nft.tokenId,
          owner: nft.owner,
          status: nft.status,
        })),
      });
      
      // Filter theo owner nếu có (NFT có thể thuộc về distributor sau khi approve)
      const ownerNFTs = nfts.filter(nft => {
        const ownerId = nft.owner?._id || nft.owner;
        return ownerId && ownerId.toString() === user._id.toString();
      });
      
      if (ownerNFTs.length > 0) {
        tokenIds = ownerNFTs.map(nft => nft.tokenId);
        console.log("[getInvoiceDetail] Thử 1 - Filter theo owner:", {
          found: tokenIds.length,
          tokenIds,
        });
      } else {
        // Nếu không có owner match, vẫn lấy tất cả (có thể NFT chưa được approve)
        tokenIds = nfts.map(nft => nft.tokenId);
        console.log("[getInvoiceDetail] Thử 1 - Không filter owner, lấy tất cả:", {
          found: tokenIds.length,
          tokenIds,
        });
      }
    }
    
    // Thử 2: Nếu chưa có tokenIds và có proofOfProduction, lấy từ proofOfProduction
    if (tokenIds.length === 0 && invoice.proofOfProduction) {
      const proofOfProductionId = invoice.proofOfProduction._id || invoice.proofOfProduction;
      console.log("[getInvoiceDetail]  Thử 2: Tìm theo proofOfProduction:", proofOfProductionId);
      const nfts = await NFTInfo.find({
        proofOfProduction: proofOfProductionId,
        owner: user._id,
        status: { $in: ["transferred", "minted"] },
      }).select("tokenId");
      tokenIds = nfts.map(nft => nft.tokenId);
      console.log("[getInvoiceDetail] Thử 2 - Kết quả:", {
        found: tokenIds.length,
        tokenIds,
      });
    }
    
    // Thử 3: Tìm theo owner (distributor) và status transferred (nếu đã được approve)
    if (tokenIds.length === 0) {
      console.log("[getInvoiceDetail]  Thử 3: Tìm theo owner (distributor) và status transferred");
      const nfts = await NFTInfo.find({
        owner: user._id,
        status: "transferred",
      }).select("tokenId").limit(100); // Limit để tránh lấy quá nhiều
      tokenIds = nfts.map(nft => nft.tokenId);
      console.log("[getInvoiceDetail] Thử 3 - Kết quả:", {
        found: tokenIds.length,
        tokenIds: tokenIds.slice(0, 10),
      });
    }

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
    console.error("Lỗi khi lấy chi tiết invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết invoice",
      error: error.message,
    });
  }
};

// Xác nhận nhận hàng từ pharma company (Bước 1 và 2)
// Bước 1: Distributor xác nhận đã nhận hàng
// Bước 2: Lưu vào database với trạng thái "Đang chờ Manufacture xác nhận"
export const confirmReceipt = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xác nhận nhận hàng",
      });
    }

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
    console.error("Lỗi khi xác nhận nhận hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xác nhận nhận hàng",
      error: error.message,
    });
  }
};

// ============ CHUYỂN TIẾP CHO PHARMACY ============

// Bước 1 & 2: Distributor chọn NFT và Pharmacy để chuyển, lưu vào database
export const transferToPharmacy = async (req, res) => {
  try {
    const user = req.user;

    console.log("[transferToPharmacy] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      userWalletAddress: user.walletAddress,
      timestamp: new Date().toISOString(),
    });

    if (user.role !== "distributor") {
      console.log("[transferToPharmacy]  Role không hợp lệ:", user.role);
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể chuyển giao cho pharmacy",
      });
    }

    if (!user.walletAddress) {
      console.log("[transferToPharmacy]  User chưa có wallet address");
      return res.status(400).json({
        success: false,
        message: "User chưa có wallet address",
      });
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

    if (!pharmacyId || !tokenIds || !amounts) {
      console.log("[transferToPharmacy]  Thiếu tham số:", {
        hasPharmacyId: !!pharmacyId,
        hasTokenIds: !!tokenIds,
        hasAmounts: !!amounts,
      });
      return res.status(400).json({
        success: false,
        message: "pharmacyId, tokenIds và amounts là bắt buộc",
      });
    }

    if (tokenIds.length !== amounts.length) {
      console.log("[transferToPharmacy]  Số lượng tokenIds và amounts không khớp:", {
        tokenIdsLength: tokenIds.length,
        amountsLength: amounts.length,
      });
      return res.status(400).json({
        success: false,
        message: "Số lượng tokenIds phải bằng số lượng amounts",
      });
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

    if (!pharmacy.user.walletAddress) {
      console.log("[transferToPharmacy]  Pharmacy chưa có wallet address");
      return res.status(400).json({
        success: false,
        message: "Pharmacy chưa có wallet address",
      });
    }

    // Kiểm tra quyền sở hữu NFT (NFT phải thuộc về distributor và đã được transferred)
    console.log("[transferToPharmacy] Kiểm tra quyền sở hữu NFT...");
    const nftInfos = await NFTInfo.find({
      tokenId: { $in: tokenIds },
      owner: user._id,
      status: "transferred",
    });

    console.log("[transferToPharmacy] Kết quả kiểm tra NFT:", {
      requestedCount: tokenIds.length,
      foundCount: nftInfos.length,
      sampleNFTs: nftInfos.slice(0, 3).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        drug: nft.drug,
      })),
      missingTokenIds: tokenIds.filter(id => !nftInfos.find(nft => nft.tokenId === id)),
    });

    if (nftInfos.length !== tokenIds.length) {
      console.log("[transferToPharmacy]  Một số NFT không thuộc về distributor hoặc không ở trạng thái transferred:", {
        requested: tokenIds.length,
        found: nftInfos.length,
        missing: tokenIds.length - nftInfos.length,
        missingTokenIds: tokenIds.filter(id => !nftInfos.find(nft => nft.tokenId === id)),
      });
      return res.status(400).json({
        success: false,
        message: "Một số NFT không thuộc về bạn hoặc không ở trạng thái transferred",
      });
    }

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
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi chuyển giao cho pharmacy",
      error: error.message,
    });
  }
};

// Lưu transaction hash sau khi transfer NFT thành công trên smart contract
export const saveTransferToPharmacyTransaction = async (req, res) => {
  try {
    const user = req.user;

    console.log("[saveTransferToPharmacyTransaction] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
    });

    if (user.role !== "distributor") {
      console.log("[saveTransferToPharmacyTransaction]  Role không hợp lệ:", user.role);
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể lưu transaction transfer",
      });
    }

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
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lưu transaction transfer",
      error: error.message,
    });
  }
};

// ============ LỊCH SỬ PHÂN PHỐI ============

// Xem lịch sử phân phối thuốc
export const getDistributionHistory = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem lịch sử phân phối",
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { toDistributor: user._id };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const distributions = await ProofOfDistribution.find(filter)
      .populate("fromManufacturer", "username email fullName")
      .populate("manufacturerInvoice")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await ProofOfDistribution.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        distributions,
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

// Xem lịch sử chuyển giao cho Pharmacy
export const getTransferToPharmacyHistory = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem lịch sử chuyển giao",
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;

    const filter = { fromDistributor: user._id };

    if (status) {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const commercialInvoices = await CommercialInvoice.find(filter)
      .populate("toPharmacy", "username email fullName")
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await CommercialInvoice.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        invoices: commercialInvoices,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử chuyển giao:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử chuyển giao",
      error: error.message,
    });
  }
};

// ============ THỐNG KÊ ============

// Thống kê các trạng thái, đơn thuốc, lượt chuyển giao
export const getStatistics = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
      });
    }

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

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem danh sách thuốc",
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
    const { atcCode } = req.query;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể tìm kiếm thuốc",
      });
    }

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
    console.error("Lỗi khi tìm kiếm thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tìm kiếm thuốc",
      error: error.message,
    });
  }
};

// Xem thông tin distributor (chỉ xem, không chỉnh sửa)
export const getDistributorInfo = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thông tin",
      });
    }

    const distributor = await Distributor.findOne({ user: user._id });

    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin distributor",
      });
    }

    const userInfo = await User.findById(user._id).select("-password");

    return res.status(200).json({
      success: true,
      data: {
        user: userInfo,
        distributor,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin distributor:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin distributor",
      error: error.message,
    });
  }
};

// Lấy danh sách pharmacies để chọn khi chuyển giao
export const getPharmacies = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem danh sách pharmacies",
      });
    }

    const { page = 1, limit = 10, search, status = "active" } = req.query;

    const filter = { status };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { licenseNo: { $regex: search, $options: "i" } },
        { taxCode: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const pharmacies = await Pharmacy.find(filter)
      .populate("user", "username email fullName walletAddress")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Pharmacy.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        pharmacies,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách pharmacies:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách pharmacies",
      error: error.message,
    });
  }
};

// ============ THỐNG KÊ CHART CHO DISTRIBUTOR ============

// Chart 1 tuần - Thống kê đơn hàng nhận từ manufacturer trong 7 ngày gần nhất
export const distributorChartOneWeek = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
      });
    }

    const distributor = await Distributor.findOne({ user: user._id });
    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
        error: "Distributor not found",
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const invoices = await ManufacturerInvoice.find({
      toDistributor: user._id,
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("fromManufacturer", "username email fullName")
      .populate("proofOfProduction")
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
    console.error("Lỗi khi lấy biểu đồ 1 tuần distributor:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy dữ liệu biểu đồ 1 tuần",
      error: error.message,
    });
  }
};

// So sánh hôm nay và hôm qua - Thống kê đơn hàng nhận từ manufacturer
export const distributorChartTodayYesterday = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
      });
    }

    const distributor = await Distributor.findOne({ user: user._id });
    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
        error: "Distributor not found",
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

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
    const diff = todayCount - yesterdayCount;
    let percentChange = null;
    if (yesterdayCount === 0) {
      percentChange = todayCount === 0 ? 0 : 100;
    } else {
      percentChange = (diff / yesterdayCount) * 100;
    }

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
    console.error("Lỗi khi lấy biểu đồ so sánh distributor:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy dữ liệu biểu đồ",
      error: error.message,
    });
  }
};

// Thống kê đơn hàng nhận từ manufacturer theo khoảng thời gian
export const getDistributorInvoicesByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
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

    const distributor = await Distributor.findOne({ user: user._id });
    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
      });
    }

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
    console.error("Lỗi khi thống kê invoices theo khoảng thời gian:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thống kê",
      error: error.message,
    });
  }
};

// Thống kê ProofOfDistribution theo khoảng thời gian
export const getDistributorDistributionsByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
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

    const distributor = await Distributor.findOne({ user: user._id });
    if (!distributor) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
      });
    }

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
    const totalQuantity = distributions.reduce((sum, dist) => sum + (dist.distributedQuantity || 0), 0);

    // Group theo ngày để dễ vẽ biểu đồ
    const dailyStats = {};
    distributions.forEach((dist) => {
      const date = dist.createdAt.toISOString().split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          count: 0,
          quantity: 0,
          distributions: [],
        };
      }
      dailyStats[date].count++;
      dailyStats[date].quantity += dist.distributedQuantity || 0;
      dailyStats[date].distributions.push({
        id: dist._id,
        quantity: dist.distributedQuantity,
        status: dist.status,
        createdAt: dist.createdAt,
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
          totalDistributions: distributions.length,
          totalQuantity,
          averagePerDay: distributions.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        },
        dailyStats,
        distributions,
      },
    });
  } catch (error) {
    console.error("Lỗi khi thống kê distributions theo khoảng thời gian:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thống kê",
      error: error.message,
    });
  }
};

// Thống kê đơn hàng chuyển cho pharmacy theo khoảng thời gian
export const getDistributorTransfersToPharmacyByDateRange = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    if (user.role !== "distributor") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có distributor mới có thể xem thống kê",
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
    console.error("Lỗi khi thống kê transfers to pharmacy theo khoảng thời gian:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thống kê",
      error: error.message,
    });
  }
};

