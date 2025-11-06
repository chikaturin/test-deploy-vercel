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

    if (proofOfPharmacy.chainTxHash != null) {
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

    const blockchainData  = {
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
          } : null
        } 
    }

    const base64urlString = Buffer.from(JSON.stringify(blockchainData)).toString('base64url');

    const url = `http://localhost:5173/verify?data=${base64urlString}`;

    return res.redirect(302, url);

  } catch (error) {
    console.error("Lỗi khi theo dõi hành trình:", error);

    const errorMessage = {
      success: false,
      message: "Lỗi server khi theo dõi hành trình",
      error: error.message,
    }

    const base64Urlstring = Buffer.from(JSON.stringify(errorMessage)).toString('base64url');

    const url = `http://localhost:5173/verify?data=${base64Urlstring}`;

    return res.redirect(302, url);
  }
};

// Hàm này là để tracking thông tin thuốc bằng mã NFT , Mã lô , Số Serial

export const trackingDrugsInfo = async (req, res) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Id là bắt buộc",
      });
    }

    // Tìm NFT
    const nft = await NFTInfo.findOne({
      $or: [
        { tokenId: identifier },
        { serialNumber: identifier },
        { batchNumber: identifier }  
      ]
    })
      .populate("drug", "tradeName atcCode genericName")
      .populate("owner", "username email fullName walletAddress")
      .populate("proofOfProduction")
      
      
    if (!nft) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy NFT với tokenId này",
      });
    }

    // Lấy lịch sử từ blockchain
    let blockchainHistory = [];
    try {
      blockchainHistory = await getTrackingHistory(nft.tokenId);
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

    if (proofOfPharmacy.chainTxHash != null) {
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
    console.error("Lỗi khi theo dõi hành trình:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi theo dõi hành trình",
      error: error.message,
    });
  }
};


// Tìm kiếm thuốc theo ATC code
export const searchDrugByATCCode = async (req, res) => {
  try {
    const { atcCode } = req.query;

    if (!atcCode) {
      return res.status(400).json({
        success: false,
        message: "atcCode là bắt buộc",
      });
    }

    const drug = await DrugInfo.findOne(
      {
        $or: [
          { atcCode: atcCode },
          { tradeName: atcCode }
        ]
      }
    )
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
