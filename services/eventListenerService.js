import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import CommercialInvoice from "../models/CommercialInvoice.js";
import ProofOfPharmacy from "../models/ProofOfPharmacy.js";
import NFTInfo from "../models/NFTInfo.js";
import User from "../models/User.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deployedAddressesPath = path.join(__dirname, "..", "deployed_addresses.json");
const myNFTABIPath = path.join(__dirname, "..", "DeployModule#MyNFT.json");

const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf8"));
const myNFTABI = JSON.parse(fs.readFileSync(myNFTABIPath, "utf8")).abi;

const myNFTAddress = deployedAddresses["DeployModule#MyNFT"];
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

let provider;
let myNFTContract;

// Khởi tạo blockchain connection
export const initializeEventListener = () => {
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    myNFTContract = new ethers.Contract(
      myNFTAddress,
      myNFTABI,
      provider
    );
    console.log("Event listener đã được khởi tạo thành công");
  } catch (error) {
    console.error("Lỗi khi khởi tạo event listener:", error);
    throw error;
  }
};

// Lắng nghe event DistributorToPharmacy
export const listenToDistributorToPharmacyEvent = async () => {
  try {
    if (!myNFTContract) {
      initializeEventListener();
    }

    console.log("Đang lắng nghe event DistributorToPharmacy...");

    // Lắng nghe event từ block hiện tại
    // Trong ethers.js v6, event listener nhận callback với (args..., eventLog)
    myNFTContract.on("DistributorToPharmacy", async (...args) => {
      try {
        // Trong ethers v6, tham số cuối cùng là event log object
        const eventLog = args[args.length - 1];
        const distributorAddress = args[0];
        const pharmacyAddress = args[1];
        const tokenIds = args[2];
        const receivedTimestamp = args[3];
        
        // Lấy transaction hash từ event log
        // Trong ethers v6, transaction hash thường nằm ở eventLog.log.transactionHash
        const transactionHash = 
          eventLog?.log?.transactionHash ||
          eventLog?.transactionHash ||
          eventLog?.hash ||
          eventLog?.txHash;
        
        console.log("Nhận được event DistributorToPharmacy:");
        console.log("Distributor:", distributorAddress);
        console.log("Pharmacy:", pharmacyAddress);
        console.log("Token IDs:", tokenIds.map((id) => id.toString()));
        console.log("Timestamp:", receivedTimestamp.toString());
        console.log("Event Log structure:", {
          hasLogObject: !!eventLog?.log,
          logTxHash: eventLog?.log?.transactionHash,
          hasHash: !!eventLog?.hash,
          hasTransactionHash: !!eventLog?.transactionHash,
          blockNumber: eventLog?.blockNumber,
          keys: eventLog ? Object.keys(eventLog) : [],
        });
        console.log("Transaction Hash:", transactionHash || "UNDEFINED");

        // Chuyển đổi timestamp
        const timestamp = Number(receivedTimestamp.toString()) * 1000; // Convert to milliseconds
        const transferDate = new Date(timestamp);

        // Tìm Distributor và Pharmacy trong database
        const distributor = await User.findOne({
          walletAddress: distributorAddress.toLowerCase(),
          role: "distributor",
        });

        const pharmacy = await User.findOne({
          walletAddress: pharmacyAddress.toLowerCase(),
          role: "pharmacy",
        });

        if (!distributor || !pharmacy) {
          console.error("Không tìm thấy distributor hoặc pharmacy trong database");
          console.error("Distributor found:", !!distributor);
          console.error("Pharmacy found:", !!pharmacy);
          return;
        }

        // Chuyển đổi tokenIds sang string array
        const tokenIdStrings = tokenIds.map((id) => id.toString());

        // Tìm các NFT trong database
        const nfts = await NFTInfo.find({
          tokenId: { $in: tokenIdStrings },
        });

        if (nfts.length === 0) {
          console.error("Không tìm thấy NFT nào trong database với tokenIds:", tokenIdStrings);
          return;
        }

        // Tìm CommercialInvoice liên quan
        // Tìm invoice gần nhất từ distributor này đến pharmacy này
        const commercialInvoice = await CommercialInvoice.findOne({
          fromDistributor: distributor._id,
          toPharmacy: pharmacy._id,
          status: { $in: ["sent", "issued"] },
        })
          .sort({ createdAt: -1 });

        // Tìm hoặc tạo ProofOfPharmacy
        let proofOfPharmacy;
        
        if (commercialInvoice) {
          proofOfPharmacy = await ProofOfPharmacy.findOne({
            commercialInvoice: commercialInvoice._id,
          });

          if (proofOfPharmacy) {
            // Cập nhật ProofOfPharmacy với thông tin từ blockchain
            if (transactionHash) {
              proofOfPharmacy.receiptTxHash = transactionHash;
            }
            proofOfPharmacy.status = "received"; // Đã nhận được NFT từ blockchain
            proofOfPharmacy.supplyChainCompleted = true;
            proofOfPharmacy.completedAt = transferDate;
            await proofOfPharmacy.save();
          } else {
            // Tạo mới ProofOfPharmacy nếu chưa có
            proofOfPharmacy = new ProofOfPharmacy({
              fromDistributor: distributor._id,
              toPharmacy: pharmacy._id,
              commercialInvoice: commercialInvoice._id,
              receiptTxHash: transactionHash,
              status: "received",
              supplyChainCompleted: true,
              completedAt: transferDate,
              receiptDate: transferDate,
            });
            await proofOfPharmacy.save();

            // Cập nhật CommercialInvoice để tham chiếu đến ProofOfPharmacy
            commercialInvoice.proofOfPharmacy = proofOfPharmacy._id;
            commercialInvoice.status = "sent"; // Đã gửi thành công
            if (transactionHash) {
              commercialInvoice.chainTxHash = transactionHash;
            }
            await commercialInvoice.save();
          }
        } else {
          console.warn("Không tìm thấy CommercialInvoice liên quan, tạo ProofOfPharmacy mới");
          proofOfPharmacy = new ProofOfPharmacy({
            fromDistributor: distributor._id,
            toPharmacy: pharmacy._id,
            receiptTxHash: transactionHash,
            status: "received",
            supplyChainCompleted: true,
            completedAt: transferDate,
            receiptDate: transferDate,
          });
          await proofOfPharmacy.save();
        }

        // Cập nhật NFT ownership và status
        const updateData = {
          $set: {
            owner: pharmacy._id,
            status: "sold",
          },
        };
        if (transactionHash) {
          updateData.$set.chainTxHash = transactionHash;
        }

        await NFTInfo.updateMany(
          { tokenId: { $in: tokenIdStrings } },
          updateData
        );

        console.log("Đã lưu thông tin từ event DistributorToPharmacy vào database:");
        console.log("- ProofOfPharmacy ID:", proofOfPharmacy._id);
        console.log("- Số lượng NFT cập nhật:", nfts.length);
        console.log("- Transaction Hash:", transactionHash || "KHÔNG TÌM THẤY");
        
        if (!transactionHash) {
          console.warn("⚠️ Cảnh báo: Transaction hash không có trong event. Kiểm tra các trường hash trong event log.");
          const safeSummary = {
            hasLogObject: !!eventLog?.log,
            logTxHash: eventLog?.log?.transactionHash,
            hash: eventLog?.hash,
            transactionHash: eventLog?.transactionHash,
            blockNumber: eventLog?.blockNumber,
          };
          console.warn("Event log summary:", safeSummary);
        }
      } catch (error) {
        console.error("Lỗi khi xử lý event DistributorToPharmacy:", error);
        console.error("Error details:", error.message);
        console.error("Stack:", error.stack);
      }
    });

    // Xử lý lỗi từ provider (network errors, connection issues, etc.)
    if (provider) {
      provider.on("error", (error) => {
        console.error("Lỗi từ blockchain provider:", error);
      });
    }

    return true;
  } catch (error) {
    console.error("Lỗi khi khởi tạo event listener:", error);
    throw error;
  }
};

// Dừng lắng nghe event (cleanup)
export const stopListening = () => {
  if (myNFTContract) {
    myNFTContract.removeAllListeners("DistributorToPharmacy");
    console.log("Đã dừng lắng nghe event DistributorToPharmacy");
  }
};

// Lắng nghe các event cũ từ một block cụ thể (để sync lại dữ liệu)
export const syncPastEvents = async (fromBlock = 0, toBlock = "latest") => {
  try {
    if (!myNFTContract) {
      initializeEventListener();
    }

    console.log(`Đang đồng bộ events từ block ${fromBlock} đến ${toBlock}...`);

    const filter = myNFTContract.filters.DistributorToPharmacy();
    const events = await myNFTContract.queryFilter(filter, fromBlock, toBlock);

    console.log(`Tìm thấy ${events.length} events trong khoảng block này`);

    // Xử lý từng event
    for (const event of events) {
      try {
        const args = event.args;
        const distributorAddress = args[0];
        const pharmacyAddress = args[1];
        const tokenIds = args[2];
        const receivedTimestamp = args[3];

        // Tạo một event object giống như khi lắng nghe real-time
        const mockEvent = {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
        };

        // Xử lý event giống như trong listenToDistributorToPharmacyEvent
        const timestamp = Number(receivedTimestamp.toString()) * 1000;
        const transferDate = new Date(timestamp);

        const distributor = await User.findOne({
          walletAddress: distributorAddress.toLowerCase(),
          role: "distributor",
        });

        const pharmacy = await User.findOne({
          walletAddress: pharmacyAddress.toLowerCase(),
          role: "pharmacy",
        });

        if (!distributor || !pharmacy) {
          console.error(`Event ${event.transactionHash}: Không tìm thấy distributor hoặc pharmacy`);
          continue;
        }

        const tokenIdStrings = tokenIds.map((id) => id.toString());

        // Kiểm tra xem event này đã được xử lý chưa
        const existingProof = await ProofOfPharmacy.findOne({
          receiptTxHash: event.transactionHash,
        });

        if (existingProof) {
          console.log(`Event ${event.transactionHash} đã được xử lý, bỏ qua`);
          continue;
        }

        const commercialInvoice = await CommercialInvoice.findOne({
          fromDistributor: distributor._id,
          toPharmacy: pharmacy._id,
          status: { $in: ["sent", "issued"] },
        })
          .sort({ createdAt: -1 });

        let proofOfPharmacy;

        if (commercialInvoice) {
          proofOfPharmacy = await ProofOfPharmacy.findOne({
            commercialInvoice: commercialInvoice._id,
          });

          if (!proofOfPharmacy) {
            proofOfPharmacy = new ProofOfPharmacy({
              fromDistributor: distributor._id,
              toPharmacy: pharmacy._id,
              commercialInvoice: commercialInvoice._id,
              receiptTxHash: event.transactionHash,
              status: "received",
              supplyChainCompleted: true,
              completedAt: transferDate,
              receiptDate: transferDate,
            });
            await proofOfPharmacy.save();

            commercialInvoice.proofOfPharmacy = proofOfPharmacy._id;
            commercialInvoice.status = "sent";
            commercialInvoice.chainTxHash = event.transactionHash;
            await commercialInvoice.save();
          }
        } else {
          proofOfPharmacy = new ProofOfPharmacy({
            fromDistributor: distributor._id,
            toPharmacy: pharmacy._id,
            receiptTxHash: event.transactionHash,
            status: "received",
            supplyChainCompleted: true,
            completedAt: transferDate,
            receiptDate: transferDate,
          });
          await proofOfPharmacy.save();
        }

        await NFTInfo.updateMany(
          { tokenId: { $in: tokenIdStrings } },
          {
            $set: {
              owner: pharmacy._id,
              status: "sold",
              chainTxHash: event.transactionHash,
            },
          }
        );

        console.log(`Đã đồng bộ event ${event.transactionHash}`);
      } catch (error) {
        console.error(`Lỗi khi xử lý event ${event.transactionHash}:`, error);
      }
    }

    console.log("Đã hoàn thành đồng bộ events");
    return events.length;
  } catch (error) {
    console.error("Lỗi khi đồng bộ events:", error);
    throw error;
  }
};

