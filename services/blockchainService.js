import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deployedAddressesPath = path.join(__dirname, "..", "deployed_addresses.json");
const accessControlABIPath = path.join(__dirname, "..", "DeployModule#accessControlService.json");
const myNFTABIPath = path.join(__dirname, "..", "DeployModule#MyNFT.json");

const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf8"));
const accessControlABI = JSON.parse(fs.readFileSync(accessControlABIPath, "utf8")).abi;
const myNFTABI = JSON.parse(fs.readFileSync(myNFTABIPath, "utf8")).abi;

const accessControlAddress = deployedAddresses["DeployModule#accessControlService"];
const myNFTAddress = deployedAddresses["DeployModule#MyNFT"];
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.warn("PRIVATE_KEY không được thiết lập trong environment variables");
}

let provider;
let signer;
let accessControlContract;
let myNFTContract;

export const initializeBlockchain = () => {
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    
    if (PRIVATE_KEY) {
      signer = new ethers.Wallet(PRIVATE_KEY, provider);
      accessControlContract = new ethers.Contract(
        accessControlAddress,
        accessControlABI,
        signer
      );
      myNFTContract = new ethers.Contract(
        myNFTAddress,
        myNFTABI,
        signer
      );
      console.log("Blockchain service đã được khởi tạo thành công");
    } else {
      console.warn("Không có private key, chỉ có thể đọc từ contract");
      accessControlContract = new ethers.Contract(
        accessControlAddress,
        accessControlABI,
        provider
      );
      myNFTContract = new ethers.Contract(
        myNFTAddress,
        myNFTABI,
        provider
      );
    }
  } catch (error) {
    console.error("Lỗi khi khởi tạo blockchain service:", error);
    throw error;
  }
};

// Hàm để tạo signer từ private key của manufacturer
export const getManufacturerSigner = (manufacturerPrivateKey) => {
  if (!manufacturerPrivateKey) {
    throw new Error("Manufacturer private key không được cung cấp");
  }
  if (!provider) {
    initializeBlockchain();
  }
  return new ethers.Wallet(manufacturerPrivateKey, provider);
};

export const addManufacturerToBlockchain = async (walletAddress, taxCode, licenseNo) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    if (!signer) {
      throw new Error("Không có signer để thực hiện giao dịch");
    }

    if (!ethers.isAddress(walletAddress)) {
      throw new Error("Địa chỉ ví không hợp lệ");
    }

    const tx = await accessControlContract.addManufacturer(
      walletAddress,
      taxCode,
      licenseNo
    );

    console.log("Transaction đã được gửi:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction đã được confirm:", receipt.blockNumber);

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      receipt,
    };
  } catch (error) {
    console.error("Lỗi khi thêm manufacturer vào blockchain:", error);
    throw error;
  }
};

export const addDistributorToBlockchain = async (walletAddress, taxCode, licenseNo) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    if (!signer) {
      throw new Error("Không có signer để thực hiện giao dịch");
    }

    if (!ethers.isAddress(walletAddress)) {
      throw new Error("Địa chỉ ví không hợp lệ");
    }

    const tx = await accessControlContract.addDistributor(
      walletAddress,
      taxCode,
      licenseNo
    );

    console.log("Transaction đã được gửi:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction đã được confirm:", receipt.blockNumber);

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      receipt,
    };
  } catch (error) {
    console.error("Lỗi khi thêm distributor vào blockchain:", error);
    throw error;
  }
};

export const addPharmacyToBlockchain = async (walletAddress, taxCode, licenseNo) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    if (!signer) {
      throw new Error("Không có signer để thực hiện giao dịch");
    }

    if (!ethers.isAddress(walletAddress)) {
      throw new Error("Địa chỉ ví không hợp lệ");
    }

    const tx = await accessControlContract.addPharmacy(
      walletAddress,
      taxCode,
      licenseNo
    );

    console.log("Transaction đã được gửi:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("Transaction đã được confirm:", receipt.blockNumber);

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      receipt,
    };
  } catch (error) {
    console.error("Lỗi khi thêm pharmacy vào blockchain:", error);
    throw error;
  }
};

export const checkIsManufacturer = async (walletAddress) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    const result = await accessControlContract.checkIsManufacturer(walletAddress);
    return result;
  } catch (error) {
    console.error("Lỗi khi kiểm tra manufacturer:", error);
    throw error;
  }
};

export const checkIsDistributor = async (walletAddress) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    const result = await accessControlContract.checkIsDistributor(walletAddress);
    return result;
  } catch (error) {
    console.error("Lỗi khi kiểm tra distributor:", error);
    throw error;
  }
};

export const checkIsPharmacy = async (walletAddress) => {
  try {
    if (!accessControlContract) {
      initializeBlockchain();
    }

    const result = await accessControlContract.checkIsPharmacy(walletAddress);
    return result;
  } catch (error) {
    console.error("Lỗi khi kiểm tra pharmacy:", error);
    throw error;
  }
};

// Mint NFT - chỉ manufacturer mới có thể mint
export const mintNFT = async (manufacturerPrivateKey, amounts) => {
  try {
    if (!myNFTContract) {
      initializeBlockchain();
    }

    if (!manufacturerPrivateKey || !amounts || amounts.length === 0) {
      throw new Error("Manufacturer private key và amounts là bắt buộc");
    }

    const manufacturerSigner = getManufacturerSigner(manufacturerPrivateKey);
    const contractWithSigner = new ethers.Contract(
      myNFTAddress,
      myNFTABI,
      manufacturerSigner
    );

    const tx = await contractWithSigner.mintNFT(amounts);
    console.log("Transaction mint NFT đã được gửi:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction mint NFT đã được confirm:", receipt.blockNumber);

    // Parse event để lấy tokenIds
    const event = receipt.logs.find(
      (log) => {
        try {
          const parsed = contractWithSigner.interface.parseLog(log);
          return parsed && parsed.name === "mintNFTEvent";
        } catch {
          return false;
        }
      }
    );

    let tokenIds = [];
    if (event) {
      const parsed = contractWithSigner.interface.parseLog(event);
      tokenIds = parsed.args.tokenIds.map(id => id.toString());
    }

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      tokenIds,
      receipt,
    };
  } catch (error) {
    console.error("Lỗi khi mint NFT:", error);
    throw error;
  }
};

// Transfer NFT từ Manufacturer đến Distributor
export const manufacturerTransferToDistributor = async (
  manufacturerPrivateKey,
  tokenIds,
  amounts,
  distributorAddress
) => {
  try {
    if (!myNFTContract) {
      initializeBlockchain();
    }

    if (!manufacturerPrivateKey || !tokenIds || !amounts || !distributorAddress) {
      throw new Error("Tất cả các tham số là bắt buộc");
    }

    if (!ethers.isAddress(distributorAddress)) {
      throw new Error("Địa chỉ distributor không hợp lệ");
    }

    if (tokenIds.length !== amounts.length) {
      throw new Error("Số lượng tokenIds phải bằng số lượng amounts");
    }

    const manufacturerSigner = getManufacturerSigner(manufacturerPrivateKey);
    const contractWithSigner = new ethers.Contract(
      myNFTAddress,
      myNFTABI,
      manufacturerSigner
    );

    const tx = await contractWithSigner.manufacturerTransferToDistributor(
      tokenIds,
      amounts,
      distributorAddress
    );

    console.log("Transaction transfer NFT đã được gửi:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction transfer NFT đã được confirm:", receipt.blockNumber);

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      receipt,
    };
  } catch (error) {
    console.error("Lỗi khi transfer NFT:", error);
    throw error;
  }
};

// Get tracking history của một token
export const getTrackingHistory = async (tokenId) => {
  try {
    if (!myNFTContract) {
      initializeBlockchain();
    }

    const result = await myNFTContract.getTrackingHistory(tokenId);
    
    return result.map((track) => ({
      fromUserType: track.fromUserType,
      toUserType: track.toUserType,
      fromUserAddress: track.fromUserAddress,
      toUserAddress: track.toUserAddress,
      receivedTimestamp: Number(track.recivedtimeSpan),
    }));
  } catch (error) {
    console.error("Lỗi khi lấy tracking history:", error);
    throw error;
  }
};

// Get balance của một token
export const getTokenBalance = async (ownerAddress, tokenId) => {
  try {
    if (!myNFTContract) {
      initializeBlockchain();
    }

    if (!ethers.isAddress(ownerAddress)) {
      throw new Error("Địa chỉ owner không hợp lệ");
    }

    const balance = await myNFTContract.balanceOf(ownerAddress, tokenId);
    return balance.toString();
  } catch (error) {
    console.error("Lỗi khi lấy balance:", error);
    throw error;
  }
};

initializeBlockchain();

