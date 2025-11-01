import DrugInfo from "../models/DrugInfo.js";
import NFTInfo from "../models/NFTInfo.js";
import ProofOfProduction from "../models/ProofOfProduction.js";
import ManufacturerInvoice from "../models/ManufacturerInvoice.js";
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

    if (user.role !== "pharma_company") {
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

    if (!invoiceId || !transactionHash || !tokenIds) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, transactionHash và tokenIds là bắt buộc",
      });
    }

    // Tìm invoice
    const manufacturerInvoice = await ManufacturerInvoice.findById(invoiceId);

    if (!manufacturerInvoice) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy invoice",
      });
    }

    // Kiểm tra invoice thuộc về user này
    if (manufacturerInvoice.fromManufacturer.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật invoice này",
      });
    }

    // Cập nhật invoice
    manufacturerInvoice.status = "sent";
    manufacturerInvoice.chainTxHash = transactionHash;
    await manufacturerInvoice.save();

    // Cập nhật trạng thái NFT
    await NFTInfo.updateMany(
      { tokenId: { $in: tokenIds } },
      {
        $set: {
          status: "transferred",
          owner: manufacturerInvoice.toDistributor,
        },
      }
    );

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
    console.error("Lỗi khi lưu transaction transfer:", error);
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

        return {
          ...production.toObject(),
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
