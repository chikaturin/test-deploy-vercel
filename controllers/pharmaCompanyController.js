import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import ProofOfProduction from "../models/ProofOfProduction.js";
import ManufacturerInvoice from "../models/ManufacturerInvoice.js";
import ProofOfDistribution from "../models/ProofOfDistribution.js";
import PharmaCompany from "../models/PharmaCompany.js";
import User from "../models/User.js";
import Distributor from "../models/Distributor.js";
import { uploadFolderToIPFS } from "../services/ipfsService.js";

// ============ QUẢN LÝ THUỐC ============

// Thêm thông tin thuốc
export const addDrug = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể thêm thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const {
      tradeName,
      genericName,
      atcCode,
      dosageForm,
      strength,
      route,
      packaging,
      storage,
      warnings,
      activeIngredients,
    } = req.body;

    if (!tradeName || !atcCode) {
      return res.status(400).json({
        success: false,
        message: "Trade name và ATC code là bắt buộc",
      });
    }

    // Kiểm tra ATC code đã tồn tại chưa
    const existingDrug = await DrugInfo.findOne({ atcCode });
    if (existingDrug) {
      return res.status(400).json({
        success: false,
        message: "ATC code đã tồn tại",
      });
    }

    const drug = new DrugInfo({
      manufacturer: pharmaCompany._id,
      tradeName,
      genericName,
      atcCode,
      dosageForm,
      strength,
      route,
      packaging,
      storage,
      warnings,
      activeIngredients: activeIngredients || [],
      status: "active",
    });

    await drug.save();

    return res.status(201).json({
      success: true,
      message: "Thêm thông tin thuốc thành công",
      data: drug,
    });
  } catch (error) {
    console.error("Lỗi khi thêm thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi thêm thuốc",
      error: error.message,
    });
  }
};

// Cập nhật thông tin thuốc
export const updateDrug = async (req, res) => {
  try {
    const user = req.user;
    const { drugId } = req.params;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể cập nhật thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const drug = await DrugInfo.findById(drugId);
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    // Kiểm tra thuốc thuộc về pharma company này
    if (drug.manufacturer.toString() !== pharmaCompany._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật thuốc này",
      });
    }

    const {
      tradeName,
      genericName,
      dosageForm,
      strength,
      route,
      packaging,
      storage,
      warnings,
      activeIngredients,
      status,
    } = req.body;

    if (tradeName !== undefined) drug.tradeName = tradeName;
    if (genericName !== undefined) drug.genericName = genericName;
    if (dosageForm !== undefined) drug.dosageForm = dosageForm;
    if (strength !== undefined) drug.strength = strength;
    if (route !== undefined) drug.route = route;
    if (packaging !== undefined) drug.packaging = packaging;
    if (storage !== undefined) drug.storage = storage;
    if (warnings !== undefined) drug.warnings = warnings;
    if (activeIngredients !== undefined) drug.activeIngredients = activeIngredients;
    if (status !== undefined && ["active", "inactive", "recalled"].includes(status)) {
      drug.status = status;
    }

    await drug.save();

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin thuốc thành công",
      data: drug,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật thuốc",
      error: error.message,
    });
  }
};

// Xóa thuốc khỏi hệ thống
export const deleteDrug = async (req, res) => {
  try {
    const user = req.user;
    const { drugId } = req.params;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xóa thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const drug = await DrugInfo.findById(drugId);
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    // Kiểm tra thuốc thuộc về pharma company này
    if (drug.manufacturer.toString() !== pharmaCompany._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa thuốc này",
      });
    }

    // Kiểm tra xem có NFT nào đang sử dụng thuốc này không
    const nftCount = await NFTInfo.countDocuments({ drug: drugId });
    if (nftCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa thuốc vì đang có ${nftCount} NFT đang sử dụng thuốc này. Vui lòng đổi trạng thái thành 'inactive' thay vì xóa.`,
      });
    }

    await DrugInfo.findByIdAndDelete(drugId);

    return res.status(200).json({
      success: true,
      message: "Xóa thuốc thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa thuốc",
      error: error.message,
    });
  }
};

// Xem danh sách thuốc
export const getDrugs = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 10, atcCode, status, search } = req.query;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem danh sách thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const filter = { manufacturer: pharmaCompany._id };
    
    if (atcCode) {
      filter.atcCode = { $regex: atcCode, $options: "i" };
    }
    
    if (status) {
      filter.status = status;
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

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể tìm kiếm thuốc",
      });
    }

    if (!atcCode) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp ATC code",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const drug = await DrugInfo.findOne({
      manufacturer: pharmaCompany._id,
      atcCode: { $regex: atcCode, $options: "i" },
    });

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

// Xem thông tin chi tiết một thuốc
export const getDrugById = async (req, res) => {
  try {
    const user = req.user;
    const { drugId } = req.params;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem thông tin thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const drug = await DrugInfo.findById(drugId);
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    // Kiểm tra thuốc thuộc về pharma company này
    if (drug.manufacturer.toString() !== pharmaCompany._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem thuốc này",
      });
    }

    return res.status(200).json({
      success: true,
      data: drug,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin thuốc",
      error: error.message,
    });
  }
};

// ============ QUẢN LÝ SẢN XUẤT VÀ PHÂN PHỐI ============

// Bước 1: Upload folder lên IPFS (Pinata)
// Frontend gọi API này trước khi mint NFT
export const uploadDrugPackageToIPFS = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể upload IPFS",
      });
    }

    const { quantity, metadata } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity phải lớn hơn 0",
      });
    }

    // Gọi Pinata IPFS để upload folder
    const ipfsResult = await uploadFolderToIPFS(quantity, metadata);

    return res.status(200).json({
      success: true,
      message: "Upload IPFS thành công",
      data: {
        ipfsHash: ipfsResult.ipfsHash,
        ipfsUrl: ipfsResult.ipfsUrl,
        amount: ipfsResult.amount,
        range: ipfsResult.range,
      },
    });
  } catch (error) {
    console.error("Lỗi khi upload IPFS:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi upload IPFS",
      error: error.message,
    });
  }
};

// Bước 2: Lưu NFT vào DB sau khi mint thành công trên smart contract
// Frontend sẽ gọi smart contract trực tiếp để mint NFT, sau đó gọi API này để lưu vào DB
// Backend cũng có thể lắng nghe event mintNFTEvent từ blockchain và tự động lưu
export const saveMintedNFTs = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể lưu NFT",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const {
      drugId,
      tokenIds, // Array các tokenId đã mint
      transactionHash, // Transaction hash từ smart contract
      quantity,
      mfgDate,
      expDate,
      batchNumber,
      ipfsUrl,
      metadata,
    } = req.body;

    if (!drugId || !tokenIds || !transactionHash || !quantity || !ipfsUrl) {
      return res.status(400).json({
        success: false,
        message: "drugId, tokenIds, transactionHash, quantity và ipfsUrl là bắt buộc",
      });
    }

    if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "tokenIds phải là một array không rỗng",
      });
    }

    if (tokenIds.length !== quantity) {
      return res.status(400).json({
        success: false,
        message: "Số lượng tokenIds phải bằng quantity",
      });
    }

    const drug = await DrugInfo.findById(drugId);
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    // Kiểm tra thuốc thuộc về pharma company này
    if (drug.manufacturer.toString() !== pharmaCompany._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền lưu NFT cho thuốc này",
      });
    }

    // Kiểm tra xem tokenIds đã được lưu chưa
    const existingNFTs = await NFTInfo.find({
      tokenId: { $in: tokenIds },
    });

    if (existingNFTs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Một số tokenId đã tồn tại trong hệ thống: ${existingNFTs.map(nft => nft.tokenId).join(", ")}`,
      });
    }

    // Tạo Proof of Production
    const proofOfProduction = new ProofOfProduction({
      manufacturer: pharmaCompany._id,
      drug: drugId,
      batchNumber: batchNumber || "",
      mfgDate: mfgDate ? new Date(mfgDate) : new Date(),
      expDate: expDate ? new Date(expDate) : null,
      quantity,
      chainTxHash: transactionHash,
    });

    await proofOfProduction.save();

    // Lưu từng NFT vào database
    const nftInfos = [];
    for (let i = 0; i < tokenIds.length; i++) {
      const serialNumber = `${batchNumber || "BATCH"}-${tokenIds[i]}`;
      
      const nftInfo = new NFTInfo({
        tokenId: tokenIds[i],
        contractAddress: process.env.NFT_CONTRACT_ADDRESS || "0x73f4600D02274e31a094DdF71e5bCD992Fd367E7",
        drug: drugId,
        serialNumber,
        batchNumber: batchNumber || "",
        mfgDate: mfgDate ? new Date(mfgDate) : new Date(),
        expDate: expDate ? new Date(expDate) : null,
        quantity: 1,
        unit: "hộp",
        owner: user._id,
        status: "minted",
        chainTxHash: transactionHash,
        ipfsUrl,
        metadata: metadata || {},
        proofOfProduction: proofOfProduction._id,
      });

      await nftInfo.save();
      nftInfos.push(nftInfo);
    }

    // Lưu mã QR vào trong console
    for(let i = 0; i < tokenIds.length;i++)
    {
        const qrTargetUrl = `http://localhost:9000/api/publicRoute/scanQR/${tokenIds[i].toString()}`;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrTargetUrl)}`;

        console.log("Target URL for tokenId :" + tokenIds[i] + " " + " : " + qrTargetUrl)
        console.log(`QR Image URL for token Id ${tokenIds[i]}` + qrImageUrl);
    }
    
    return res.status(201).json({
      success: true,
      message: "Lưu NFT vào database thành công",
      data: {
        proofOfProduction,
        nftInfos,
        transactionHash,
        tokenIds,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lưu NFT:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lưu NFT",
      error: error.message,
    });
  }
};

// Chuyển giao đơn thuốc cho Distributor
export const transferToDistributor = async (req, res) => {
  try {
    const user = req.user;
    console.log("[transferToDistributor] request by=", user?._id?.toString());

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể chuyển giao đơn thuốc",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    if (!user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "User chưa có wallet address",
      });
    }

    const {
      distributorId,
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
    } = req.body;

    console.log("[transferToDistributor] payload summary:", {
      distributorId,
      tokenIdsCount: Array.isArray(tokenIds) ? tokenIds.length : 0,
      amountsCount: Array.isArray(amounts) ? amounts.length : 0,
      invoiceNumber,
      quantity,
    });

    if (!distributorId || !tokenIds || !amounts) {
      return res.status(400).json({
        success: false,
        message: "distributorId, tokenIds và amounts là bắt buộc",
      });
    }

    if (tokenIds.length !== amounts.length) {
      return res.status(400).json({
        success: false,
        message: "Số lượng tokenIds phải bằng số lượng amounts",
      });
    }

    // Tìm distributor
    const distributor = await Distributor.findById(distributorId).populate("user");
    if (!distributor || !distributor.user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distributor",
      });
    }

    if (!distributor.user.walletAddress) {
      return res.status(400).json({
        success: false,
        message: "Distributor chưa có wallet address",
      });
    }

    // Kiểm tra quyền sở hữu NFT
    const nftInfos = await NFTInfo.find({
      tokenId: { $in: tokenIds },
      owner: user._id,
      status: "minted",
    });

    console.log("[transferToDistributor] nft ownership check:", {
      requestedTokenIds: tokenIds.length,
      ownedMintedCount: nftInfos.length,
    });

    if (nftInfos.length !== tokenIds.length) {
      return res.status(400).json({
        success: false,
        message: "Một số NFT không thuộc về bạn hoặc không ở trạng thái minted",
      });
    }

    // Lưu vào database với trạng thái pending (chờ frontend gọi smart contract)
    // Frontend sẽ gọi smart contract trực tiếp, sau đó backend lắng nghe event để cập nhật
    const manufacturerInvoice = new ManufacturerInvoice({
      fromManufacturer: user._id,
      toDistributor: distributor.user._id,
      invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      quantity: quantity || amounts.reduce((sum, amt) => sum + amt, 0),
      unitPrice,
      totalAmount,
      vatRate,
      vatAmount,
      finalAmount,
      notes,
      status: "pending", // Chờ frontend gọi smart contract
    });

    await manufacturerInvoice.save();

    console.log("[transferToDistributor] invoice saved:", {
      invoiceId: manufacturerInvoice._id?.toString(),
      status: manufacturerInvoice.status,
      distributorAddress: distributor.user.walletAddress,
    });

    // Trả về thông tin để frontend có thể gọi smart contract
    // Frontend sẽ gọi: manufacturerTransferToDistributor(tokenIds, amounts, distributorAddress)
    // Sau đó frontend có thể gọi API saveTransfer để lưu transactionHash (hoặc backend lắng nghe event)
    
    return res.status(200).json({
      success: true,
      message: "Đã lưu invoice vào database với trạng thái pending. Vui lòng gọi smart contract để chuyển NFT.",
      data: {
        invoice: manufacturerInvoice,
        distributorAddress: distributor.user.walletAddress,
        tokenIds,
        amounts,
        // Frontend sẽ gọi smart contract: manufacturerTransferToDistributor(tokenIds, amounts, distributorAddress)
        // Sau khi thành công, frontend sẽ gọi API saveTransfer để lưu transactionHash
      },
    });
  } catch (error) {
    console.error("Lỗi khi chuyển giao đơn thuốc:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi chuyển giao đơn thuốc",
      error: error.message,
    });
  }
};

// Lưu transaction hash sau khi transfer NFT thành công trên smart contract
// Frontend sẽ gọi smart contract trực tiếp, sau đó gọi API này để lưu transactionHash
export const saveTransferTransaction = async (req, res) => {
  try {
    const user = req.user;

    console.log("[saveTransferTransaction] Bắt đầu:", {
      userId: user._id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
    });

    if (user.role !== "pharma_company") {
      console.log("[saveTransferTransaction]  Role không hợp lệ:", user.role);
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể lưu transaction transfer",
      });
    }

    const {
      invoiceId,
      transactionHash,
      tokenIds,
    } = req.body;

    console.log("[saveTransferTransaction] Request body:", {
      invoiceId,
      transactionHash,
      tokenIdsCount: Array.isArray(tokenIds) ? tokenIds.length : 0,
      tokenIds: Array.isArray(tokenIds) ? tokenIds.slice(0, 5) : tokenIds,
    });

    if (!invoiceId || !transactionHash || !tokenIds) {
      console.log("[saveTransferTransaction]  Thiếu tham số:", {
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
    console.log("[saveTransferTransaction] Đang tìm invoice...");
    const manufacturerInvoice = await ManufacturerInvoice.findById(invoiceId);

    if (!manufacturerInvoice) {
      console.log("[saveTransferTransaction]  Không tìm thấy invoice:", invoiceId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    console.log("[saveTransferTransaction]  Tìm thấy invoice:", {
      invoiceId: manufacturerInvoice._id,
      invoiceNumber: manufacturerInvoice.invoiceNumber,
      status: manufacturerInvoice.status,
      fromManufacturer: manufacturerInvoice.fromManufacturer,
      toDistributor: manufacturerInvoice.toDistributor,
    });

    // Kiểm tra invoice thuộc về user này
    if (manufacturerInvoice.fromManufacturer.toString() !== user._id.toString()) {
      console.log("[saveTransferTransaction]  Không có quyền:", {
        invoiceFromManufacturer: manufacturerInvoice.fromManufacturer.toString(),
        userId: user._id.toString(),
      });
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật invoice này",
      });
    }

    // Kiểm tra NFT tồn tại trước khi cập nhật
    console.log("[saveTransferTransaction] Kiểm tra NFT trước khi cập nhật...");
    const existingNFTs = await NFTInfo.find({ tokenId: { $in: tokenIds } });
    console.log("[saveTransferTransaction] NFT hiện tại:", {
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
    manufacturerInvoice.status = "sent";
    manufacturerInvoice.chainTxHash = transactionHash;
    await manufacturerInvoice.save();
    console.log("[saveTransferTransaction]  Đã cập nhật invoice:", {
      status: manufacturerInvoice.status,
      chainTxHash: manufacturerInvoice.chainTxHash,
    });

    // Cập nhật trạng thái NFT (bao gồm chainTxHash để có thể tìm lại sau này)
    console.log("[saveTransferTransaction] Đang cập nhật NFT...");
    const updateResult = await NFTInfo.updateMany(
      { tokenId: { $in: tokenIds } },
      {
        $set: {
          status: "transferred",
          owner: manufacturerInvoice.toDistributor,
          chainTxHash: transactionHash, // Lưu chainTxHash để có thể tìm lại
        },
      }
    );

    console.log("[saveTransferTransaction]  Kết quả cập nhật NFT:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      requestedCount: tokenIds.length,
    });

    // Verify: Kiểm tra NFT đã được cập nhật đúng chưa
    const updatedNFTs = await NFTInfo.find({ 
      tokenId: { $in: tokenIds },
      chainTxHash: transactionHash,
    });
    console.log("[saveTransferTransaction]  Verify NFT sau khi cập nhật:", {
      foundWithChainTxHash: updatedNFTs.length,
      sampleUpdatedNFTs: updatedNFTs.slice(0, 3).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        chainTxHash: nft.chainTxHash,
      })),
    });

    return res.status(200).json({
      success: true,
      message: "Lưu transaction transfer thành công",
      data: {
        invoice: manufacturerInvoice,
        transactionHash,
        tokenIds,
      },
    });
  } catch (error) {
    console.error("[saveTransferTransaction]  Lỗi:", {
      error: error.message,
      stack: error.stack,
      invoiceId: req.body?.invoiceId,
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

// Xem lịch sử tạo đơn thuốc
export const getProductionHistory = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 10, search, status } = req.query;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem lịch sử sản xuất",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const filter = { manufacturer: pharmaCompany._id };

    // Lấy danh sách drugId của công ty này để filter NFT
    const companyDrugIds = await DrugInfo.find({ manufacturer: pharmaCompany._id }).distinct("_id");

    if (status) {
      // Tìm NFT theo status và lấy proofOfProduction
      // QUAN TRỌNG: Chỉ lấy NFT của thuốc thuộc về công ty này
      const nftFilter = {
        proofOfProduction: { $exists: true },
        status,
        drug: { $in: companyDrugIds }, // CHỈ lấy NFT của thuốc thuộc công ty mình
      };
      
      if (search) {
        nftFilter.$or = [
          { serialNumber: { $regex: search, $options: "i" } },
          { batchNumber: { $regex: search, $options: "i" } },
        ];
      }
      
      const nfts = await NFTInfo.find(nftFilter).select("proofOfProduction");
      const proofIds = [...new Set(nfts.map(nft => nft.proofOfProduction?.toString()).filter(Boolean))];
      
      if (proofIds.length > 0) {
        filter._id = { $in: proofIds };
      } else {
        // Không có kết quả
        return res.status(200).json({
          success: true,
          data: {
            productions: [],
            pagination: {
              page: 1,
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }
    }

    if (search && !status) {
      // Nếu có search nhưng không có status, tìm NFT theo search và lấy proofOfProduction
      const nftFilter = {
        proofOfProduction: { $exists: true },
        drug: { $in: companyDrugIds }, // CHỈ lấy NFT của thuốc thuộc công ty mình
        $or: [
          { serialNumber: { $regex: search, $options: "i" } },
          { batchNumber: { $regex: search, $options: "i" } },
        ],
      };
      
      const nfts = await NFTInfo.find(nftFilter).select("proofOfProduction");
      const proofIds = [...new Set(nfts.map(nft => nft.proofOfProduction?.toString()).filter(Boolean))];
      
      if (proofIds.length > 0) {
        filter._id = { $in: proofIds };
      } else {
        // Không có kết quả
        return res.status(200).json({
          success: true,
          data: {
            productions: [],
            pagination: {
              page: 1,
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
          },
        });
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productions = await ProofOfProduction.find(filter)
      .populate("drug", "tradeName atcCode")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Thêm thông tin trạng thái chuyển giao cho mỗi production
    // Đảm bảo chỉ lấy NFT của thuốc thuộc về công ty này (companyDrugIds đã được query ở trên)
    const productionsWithStatus = await Promise.all(
      productions.map(async (production) => {
        // CHỈ lấy NFT của thuốc thuộc công ty mình
        const nfts = await NFTInfo.find({
          proofOfProduction: production._id,
          drug: { $in: companyDrugIds },
        });
        const hasTransferred = nfts.some((nft) => nft.status === "transferred");
        const hasMinted = nfts.some((nft) => nft.status === "minted");
        // Batch fallback: nếu production chưa có batchNumber, lấy từ 1 NFT bất kỳ
        const inferredBatch = production.batchNumber || (nfts.find((n) => !!n.batchNumber)?.batchNumber || "");

        return {
          ...production.toObject(),
          batchNumber: inferredBatch,
          transferStatus: hasTransferred ? "transferred" : hasMinted ? "pending" : "none",
          nftCount: nfts.length,
        };
      })
    );

    const total = await ProofOfProduction.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        productions: productionsWithStatus,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử sản xuất:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử sản xuất",
      error: error.message,
    });
  }
};

// Xem lịch sử chuyển giao đơn thuốc
export const getTransferHistory = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 10, search, status } = req.query;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem lịch sử chuyển giao",
      });
    }

    const filter = { fromManufacturer: user._id };

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
      .populate("toDistributor", "username email fullName")
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
    console.error("Lỗi khi lấy lịch sử chuyển giao:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử chuyển giao",
      error: error.message,
    });
  }
};

// Thống kê
export const getStatistics = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem thống kê",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    // Thống kê thuốc
    const totalDrugs = await DrugInfo.countDocuments({ manufacturer: pharmaCompany._id });
    const activeDrugs = await DrugInfo.countDocuments({
      manufacturer: pharmaCompany._id,
      status: "active",
    });
    const inactiveDrugs = await DrugInfo.countDocuments({
      manufacturer: pharmaCompany._id,
      status: "inactive",
    });

    // Thống kê đơn thuốc đã tạo
    const totalProductions = await ProofOfProduction.countDocuments({
      manufacturer: pharmaCompany._id,
    });

    // Thống kê NFT - CHỈ lấy NFT của thuốc thuộc về công ty này
    const companyDrugIds = await DrugInfo.find({ manufacturer: pharmaCompany._id }).distinct("_id");
    const nfts = await NFTInfo.find({
      drug: { $in: companyDrugIds },
    });

    const nftStatusStats = {
      minted: nfts.filter((nft) => nft.status === "minted").length,
      transferred: nfts.filter((nft) => nft.status === "transferred").length,
      sold: nfts.filter((nft) => nft.status === "sold").length,
      expired: nfts.filter((nft) => nft.status === "expired").length,
      recalled: nfts.filter((nft) => nft.status === "recalled").length,
    };

    // Thống kê lượt chuyển giao
    const totalTransfers = await ManufacturerInvoice.countDocuments({
      fromManufacturer: user._id,
    });

    const transferStatusStats = {
      pending: await ManufacturerInvoice.countDocuments({
        fromManufacturer: user._id,
        status: "pending",
      }),
      sent: await ManufacturerInvoice.countDocuments({
        fromManufacturer: user._id,
        status: "sent",
      }),
      paid: await ManufacturerInvoice.countDocuments({
        fromManufacturer: user._id,
        status: "paid",
      }),
      cancelled: await ManufacturerInvoice.countDocuments({
        fromManufacturer: user._id,
        status: "cancelled",
      }),
    };

    return res.status(200).json({
      success: true,
      data: {
        drugs: {
          total: totalDrugs,
          active: activeDrugs,
          inactive: inactiveDrugs,
        },
        productions: {
          total: totalProductions,
        },
        nfts: {
          total: nfts.length,
          byStatus: nftStatusStats,
        },
        transfers: {
          total: totalTransfers,
          byStatus: transferStatusStats,
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

// Lấy danh sách tokenId còn khả dụng (status=minted) theo một proofOfProduction
export const getAvailableTokensForProduction = async (req, res) => {
  try {
    const user = req.user;
    const { productionId } = req.params;
    console.log("[availableTokens] request by=", user?._id?.toString(), "productionId=", productionId);

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem token khả dụng",
      });
    }

    // Xác thực production tồn tại
    const production = await ProofOfProduction.findById(productionId);
    if (!production) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy lô sản xuất",
      });
    }

    // Lấy các NFT thuộc production này, đang ở trạng thái minted và thuộc sở hữu manufacturer hiện tại
    const nfts = await NFTInfo.find({
      proofOfProduction: productionId,
      owner: user._id,
      status: "minted",
    }).select("tokenId");

    const availableTokenIds = nfts.map((n) => n.tokenId);
    console.log("[availableTokens] minted tokens found=", availableTokenIds.length);

    return res.status(200).json({
      success: true,
      data: { availableTokenIds },
    });
  } catch (error) {
    console.error("Lỗi khi lấy token khả dụng:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy token khả dụng",
      error: error.message,
    });
  }
};

// Xem thông tin pharma company (chỉ xem, không chỉnh sửa)
export const getPharmaCompanyInfo = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem thông tin",
      });
    }

    const pharmaCompany = await PharmaCompany.findOne({ user: user._id });

    if (!pharmaCompany) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin pharma company",
      });
    }

    const userInfo = await User.findById(user._id).select("-password");

    return res.status(200).json({
      success: true,
      data: {
        user: userInfo,
        pharmaCompany,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin pharma company:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin pharma company",
      error: error.message,
    });
  }
};

// Lấy danh sách distributors để chọn khi chuyển giao
export const getDistributors = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem danh sách distributors",
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

    const distributors = await Distributor.find(filter)
      .populate("user", "username email fullName walletAddress")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Distributor.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: {
        distributors,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách distributors:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách distributors",
      error: error.message,
    });
  }
};

// ============ QUẢN LÝ DISTRIBUTION (XÁC NHẬN QUYỀN NFT) ============

// Lấy danh sách distributions chờ xác nhận quyền NFT
export const getDistributions = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem danh sách distributions",
      });
    }

    const { page = 1, limit = 10, status = "confirmed" } = req.query;

    const filter = {
      fromManufacturer: user._id,
    };

    // Nếu có status, chỉ lấy distributions với status đó
    if (status) {
      filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const distributions = await ProofOfDistribution.find(filter)
      .populate("toDistributor", "username email fullName walletAddress")
      .populate("manufacturerInvoice", "invoiceNumber invoiceDate quantity status chainTxHash")
      .populate("proofOfProduction", "batchNumber productionDate")
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
    console.error("Lỗi khi lấy danh sách distributions:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách distributions",
      error: error.message,
    });
  }
};

// Lấy chi tiết distribution
export const getDistributionDetail = async (req, res) => {
  try {
    const user = req.user;
    const { distributionId } = req.params;

    if (user.role !== "pharma_company") {
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xem chi tiết distribution",
      });
    }

    const distribution = await ProofOfDistribution.findById(distributionId)
      .populate("fromManufacturer", "username email fullName walletAddress")
      .populate("toDistributor", "username email fullName walletAddress")
      .populate("manufacturerInvoice", "invoiceNumber invoiceDate quantity status chainTxHash")
      .populate("proofOfProduction", "batchNumber productionDate drug");

    if (!distribution) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distribution",
      });
    }

    // Kiểm tra distribution thuộc về manufacturer này
    const fromManufacturerId = distribution.fromManufacturer._id || distribution.fromManufacturer;
    if (fromManufacturerId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem distribution này",
      });
    }

    // Lấy tokenIds từ ManufacturerInvoice nếu có
    let tokenIds = [];
    if (distribution.manufacturerInvoice) {
      const invoice = distribution.manufacturerInvoice;
      
      // Lấy tokenIds từ NFTInfo dựa trên chainTxHash hoặc proofOfProduction
      let nftQuery = {};
      
      if (invoice.chainTxHash) {
        nftQuery.chainTxHash = invoice.chainTxHash;
      } else if (distribution.proofOfProduction) {
        nftQuery.proofOfProduction = distribution.proofOfProduction._id || distribution.proofOfProduction;
      }
      
      if (Object.keys(nftQuery).length > 0) {
        const nfts = await NFTInfo.find(nftQuery).select("tokenId");
        tokenIds = nfts.map(nft => nft.tokenId);
      }
    }

    const distributionObj = distribution.toObject();
    distributionObj.tokenIds = tokenIds;

    return res.status(200).json({
      success: true,
      data: distributionObj,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết distribution:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết distribution",
      error: error.message,
    });
  }
};

// Xác nhận quyền NFT cho distributor
export const approveDistribution = async (req, res) => {
  try {
    const user = req.user;
    const { distributionId } = req.params;

    console.log("[approveDistribution] Bắt đầu:", {
      distributionId,
      userId: user._id,
      userRole: user.role,
      timestamp: new Date().toISOString(),
    });

    if (user.role !== "pharma_company") {
      console.log("[approveDistribution]  Role không hợp lệ:", user.role);
      return res.status(403).json({
        success: false,
        message: "Chỉ có pharma company mới có thể xác nhận quyền NFT",
      });
    }

    // Tìm distribution
    console.log("[approveDistribution] Đang tìm distribution...");
    const distribution = await ProofOfDistribution.findById(distributionId)
      .populate("manufacturerInvoice")
      .populate("toDistributor", "walletAddress");

    if (!distribution) {
      console.log("[approveDistribution]  Không tìm thấy distribution:", distributionId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy distribution",
      });
    }

    console.log("[approveDistribution]  Tìm thấy distribution:", {
      distributionId: distribution._id,
      status: distribution.status,
      fromManufacturer: distribution.fromManufacturer?._id || distribution.fromManufacturer,
      toDistributor: distribution.toDistributor?._id || distribution.toDistributor,
      distributedQuantity: distribution.distributedQuantity,
      hasInvoice: !!distribution.manufacturerInvoice,
      hasProofOfProduction: !!distribution.proofOfProduction,
    });

    // Kiểm tra distribution thuộc về manufacturer này
    const fromManufacturerId = distribution.fromManufacturer._id || distribution.fromManufacturer;
    if (fromManufacturerId.toString() !== user._id.toString()) {
      console.log("[approveDistribution]  Không có quyền:", {
        fromManufacturerId: fromManufacturerId.toString(),
        userId: user._id.toString(),
      });
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xác nhận distribution này",
      });
    }

    // Kiểm tra distribution đã được confirmed chưa
    if (distribution.status !== "confirmed") {
      console.log("[approveDistribution]  Status không hợp lệ:", distribution.status);
      return res.status(400).json({
        success: false,
        message: `Distribution chưa được distributor xác nhận. Trạng thái hiện tại: ${distribution.status}`,
      });
    }

    // Lấy tokenIds từ ManufacturerInvoice
    const invoice = distribution.manufacturerInvoice;
    if (!invoice) {
      console.log("[approveDistribution]  Distribution không có invoice");
      return res.status(400).json({
        success: false,
        message: "Distribution không có invoice liên kết",
      });
    }

    console.log("[approveDistribution]  Invoice info:", {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      chainTxHash: invoice.chainTxHash,
      hasTokenIds: !!invoice.tokenIds,
      tokenIdsCount: Array.isArray(invoice.tokenIds) ? invoice.tokenIds.length : 0,
    });

    // Kiểm tra invoice đã được sent (đã chuyển NFT trên blockchain)
    if (invoice.status !== "sent" || !invoice.chainTxHash) {
      console.log("[approveDistribution]  Invoice chưa được sent hoặc chưa có chainTxHash:", {
        status: invoice.status,
        hasChainTxHash: !!invoice.chainTxHash,
      });
      return res.status(400).json({
        success: false,
        message: "Invoice chưa được gửi hoặc chưa có transaction hash. Vui lòng đảm bảo đã chuyển NFT trên blockchain trước.",
      });
    }

    // Lấy tokenIds từ NFTInfo
    // Có thể tìm theo nhiều cách:
    // 1. Theo chainTxHash (nếu đã được lưu trong saveTransferTransaction)
    // 2. Theo proofOfProduction (nếu có)
    // 3. Theo owner và status (nếu đã được transferred)
    
    console.log("[approveDistribution] Bắt đầu tìm NFT...");
    let nftInfos = [];
    
    // Thử 1: Tìm theo chainTxHash (nếu đã được lưu)
    if (invoice.chainTxHash) {
      console.log("[approveDistribution]  Thử 1: Tìm theo chainTxHash:", invoice.chainTxHash);
      nftInfos = await NFTInfo.find({
        chainTxHash: invoice.chainTxHash,
      });
      console.log("[approveDistribution] Thử 1 - Kết quả:", {
        found: nftInfos.length,
        tokenIds: nftInfos.map(nft => nft.tokenId),
      });
    }
    
    // Thử 2: Nếu không tìm thấy, thử tìm theo proofOfProduction
    if (nftInfos.length === 0 && distribution.proofOfProduction) {
      const proofOfProductionId = distribution.proofOfProduction._id || distribution.proofOfProduction;
      console.log("[approveDistribution]  Thử 2: Tìm theo proofOfProduction:", proofOfProductionId);
      nftInfos = await NFTInfo.find({
        proofOfProduction: proofOfProductionId,
        status: { $in: ["transferred", "minted"] },
      });
      console.log("[approveDistribution] Thử 2 - Kết quả:", {
        found: nftInfos.length,
        tokenIds: nftInfos.map(nft => nft.tokenId),
      });
    }
    
    // Thử 3: Nếu vẫn không tìm thấy, tìm theo owner (distributor) và status transferred
    // (NFT đã được transferred cho distributor này)
    if (nftInfos.length === 0) {
      const distributorId = distribution.toDistributor._id || distribution.toDistributor;
      console.log("[approveDistribution]  Thử 3: Tìm theo owner (distributor) và status transferred:", {
        distributorId,
        limit: distribution.distributedQuantity || 100,
      });
      nftInfos = await NFTInfo.find({
        owner: distributorId,
        status: "transferred",
      }).limit(distribution.distributedQuantity || 100);
      console.log("[approveDistribution] Thử 3 - Kết quả:", {
        found: nftInfos.length,
        tokenIds: nftInfos.map(nft => nft.tokenId),
        sampleNFTs: nftInfos.slice(0, 3).map(nft => ({
          tokenId: nft.tokenId,
          owner: nft.owner,
          status: nft.status,
          chainTxHash: nft.chainTxHash,
        })),
      });
    }
    
    // Nếu vẫn không tìm thấy, thử tìm theo invoice (nếu có lưu tokenIds trong invoice)
    if (nftInfos.length === 0 && invoice.tokenIds && Array.isArray(invoice.tokenIds) && invoice.tokenIds.length > 0) {
      console.log("[approveDistribution]  Thử 4: Tìm theo tokenIds từ invoice:", {
        tokenIdsCount: invoice.tokenIds.length,
        tokenIds: invoice.tokenIds.slice(0, 5),
      });
      nftInfos = await NFTInfo.find({
        tokenId: { $in: invoice.tokenIds },
      });
      console.log("[approveDistribution] Thử 4 - Kết quả:", {
        found: nftInfos.length,
        tokenIds: nftInfos.map(nft => nft.tokenId),
      });
    }
    
    if (nftInfos.length === 0) {
      // Debug: Kiểm tra tất cả NFT có owner là distributor
      const distributorId = distribution.toDistributor._id || distribution.toDistributor;
      const allDistributorNFTs = await NFTInfo.find({ owner: distributorId }).limit(10);
      const allTransferredNFTs = await NFTInfo.find({ status: "transferred" }).limit(10);
      
      console.error("[approveDistribution]  Không tìm thấy NFT:", {
        distributionId,
        invoiceId: invoice._id,
        chainTxHash: invoice.chainTxHash,
        proofOfProduction: distribution.proofOfProduction?._id || distribution.proofOfProduction,
        distributedQuantity: distribution.distributedQuantity,
        distributorId,
        // Debug info
        allDistributorNFTsCount: await NFTInfo.countDocuments({ owner: distributorId }),
        allTransferredNFTsCount: await NFTInfo.countDocuments({ status: "transferred" }),
        sampleDistributorNFTs: allDistributorNFTs.map(nft => ({
          tokenId: nft.tokenId,
          status: nft.status,
          chainTxHash: nft.chainTxHash,
        })),
        sampleTransferredNFTs: allTransferredNFTs.map(nft => ({
          tokenId: nft.tokenId,
          owner: nft.owner,
          chainTxHash: nft.chainTxHash,
        })),
      });
      
      return res.status(400).json({
        success: false,
        message: "Không tìm thấy NFT nào liên quan đến distribution này. Vui lòng kiểm tra lại:\n" +
                 "- Invoice đã có chainTxHash chưa?\n" +
                 "- NFT đã được transferred chưa?\n" +
                 "- Distribution đã liên kết với proofOfProduction chưa?",
      });
    }
    
    console.log("[approveDistribution]  Đã tìm thấy NFT:", {
      count: nftInfos.length,
      tokenIds: nftInfos.map(nft => nft.tokenId),
      sampleNFTs: nftInfos.slice(0, 3).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        chainTxHash: nft.chainTxHash,
      })),
    });

    const tokenIds = nftInfos.map(nft => nft.tokenId);
    const distributorId = distribution.toDistributor._id || distribution.toDistributor;

    console.log("[approveDistribution] Cập nhật NFT:", {
      tokenIdsCount: tokenIds.length,
      distributorId,
      tokenIds: tokenIds.slice(0, 5),
    });

    // Cập nhật NFT owner và đảm bảo status = "transferred"
    // (NFT đã được transferred trên blockchain, giờ chỉ cần cập nhật owner trong DB)
    const updateResult = await NFTInfo.updateMany(
      { tokenId: { $in: tokenIds } },
      {
        $set: {
          owner: distributorId,
          status: "transferred",
        },
      }
    );

    console.log("[approveDistribution] Kết quả cập nhật NFT:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
    });

    // Cập nhật distribution status
    // Có thể thêm status "completed" hoặc "approved", nhưng để đơn giản, ta sẽ thêm field approved
    distribution.status = "confirmed"; // Giữ nguyên hoặc có thể thêm status mới
    distribution.verifiedBy = user._id;
    distribution.verifiedAt = new Date();
    await distribution.save();

    console.log("[approveDistribution]  Hoàn thành xác nhận:", {
      distributionId: distribution._id,
      verifiedBy: user._id,
      verifiedAt: distribution.verifiedAt,
      updatedNFTs: nftInfos.length,
    });

    return res.status(200).json({
      success: true,
      message: "Đã xác nhận quyền NFT thành công. Distributor đã có quyền sở hữu NFT.",
      data: {
        distribution,
        tokenIds,
        updatedNFTs: nftInfos.length,
      },
    });
  } catch (error) {
    console.error("[approveDistribution]  Lỗi:", {
      error: error.message,
      stack: error.stack,
      distributionId: req.params.distributionId,
      userId: req.user?._id,
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xác nhận quyền NFT",
      error: error.message,
    });
  }
};
