import NFTInfo from "../../models/NFTInfo.js";

class NFTService {

  static async validateNFTOwnership(tokenIds, owner, status = null) {
    const query = {
      tokenId: { $in: tokenIds },
      owner: owner._id || owner,
    };

    if (status) {
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else {
        query.status = status;
      }
    }

    const nfts = await NFTInfo.find(query);

    const foundTokenIds = nfts.map(nft => nft.tokenId);
    const missingTokenIds = tokenIds.filter(id => !foundTokenIds.includes(id));

    return {
      valid: missingTokenIds.length === 0,
      nfts,
      missingTokenIds,
      foundCount: nfts.length,
      requestedCount: tokenIds.length
    };
  }

  static async getTokenIds(query) {
    const nfts = await NFTInfo.find(query).select("tokenId");
    return nfts.map(nft => nft.tokenId);
  }

  static getNFTsWithSample(nfts, sampleSize = 3) {
    return {
      tokenIds: nfts.map(nft => nft.tokenId),
      sampleNFTs: nfts.slice(0, sampleSize).map(nft => ({
        tokenId: nft.tokenId,
        owner: nft.owner,
        status: nft.status,
        drug: nft.drug,
      }))
    };
  }

  static filterByOwner(nfts, ownerId) {
    const ownerIdStr = ownerId?.toString?.() || ownerId;
    return nfts.filter(nft => {
      const nftOwnerId = nft.owner?.toString?.() || nft.owner;
      return nftOwnerId === ownerIdStr;
    });
  }


  static extractTokenIds(nfts) {
    return nfts.map(nft => nft.tokenId);
  }

  static async getTokenIdsFromInvoice(invoice, user = null) {
    let tokenIds = [];
    
    // Thử 1: Tìm theo chainTxHash (không cần owner, vì NFT có thể đã được transferred)
    if (invoice.chainTxHash) {
      const nfts = await NFTInfo.find({
        chainTxHash: invoice.chainTxHash,
      }).select("tokenId owner status");
      
      // Filter theo owner nếu có (NFT có thể thuộc về distributor sau khi approve)
      if (user && nfts.length > 0) {
        const ownerNFTs = this.filterByOwner(nfts, user._id);
        tokenIds = ownerNFTs.length > 0 
          ? this.extractTokenIds(ownerNFTs)
          : this.extractTokenIds(nfts);
      } else {
        tokenIds = this.extractTokenIds(nfts);
      }
    }
    
    // Thử 2: Nếu chưa có tokenIds và có proofOfProduction, lấy từ proofOfProduction
    if (tokenIds.length === 0 && invoice.proofOfProduction) {
      const proofOfProductionId = invoice.proofOfProduction._id || invoice.proofOfProduction;
      const query = {
        proofOfProduction: proofOfProductionId,
        status: { $in: ["transferred", "minted"] },
      };
      
      if (user) {
        query.owner = user._id;
      }
      
      tokenIds = await this.getTokenIds(query);
    }
    
    // Thử 3: Tìm theo owner và status transferred (nếu đã được approve)
    if (tokenIds.length === 0 && user) {
      tokenIds = await this.getTokenIds({
        owner: user._id,
        status: "transferred",
      });
      // Limit để tránh lấy quá nhiều
      tokenIds = tokenIds.slice(0, 100);
    }

    return tokenIds;
  }
}

export default NFTService;

