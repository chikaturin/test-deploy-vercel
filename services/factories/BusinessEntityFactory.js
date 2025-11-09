import PharmaCompany from "../../models/PharmaCompany.js";
import Distributor from "../../models/Distributor.js";
import Pharmacy from "../../models/Pharmacy.js";

export class BusinessEntityFactory {
  static async getBusinessEntity(user) {
    if (!user || !user.role) {
      throw new Error("User và role là bắt buộc");
    }

    switch (user.role) {
      case "pharma_company":
        return await this.getPharmaCompany(user);
      
      case "distributor":
        return await this.getDistributor(user);
      
      case "pharmacy":
        return await this.getPharmacy(user);
      
      default:
        throw new Error(`Role không hợp lệ: ${user.role}`);
    }
  }

  static async getBusinessEntityWithValidation(user, requiredRole) {
    if (!user || user.role !== requiredRole) {
      throw new Error(`Chỉ có ${requiredRole} mới có thể thực hiện thao tác này`);
    }

    const entity = await this.getBusinessEntity(user);
    
    if (!entity) {
      throw new Error(`Không tìm thấy ${requiredRole} cho user này`);
    }

    return entity;
  }

  static async getPharmaCompany(user) {
    if (user.pharmaCompany) {
      return await PharmaCompany.findById(user.pharmaCompany);
    }
    return await PharmaCompany.findOne({ user: user._id });
  }

  static async getDistributor(user) {
    if (user.distributor) {
      return await Distributor.findById(user.distributor);
    }
    return await Distributor.findOne({ user: user._id });
  }


  static async getPharmacy(user) {
    if (user.pharmacy) {
      return await Pharmacy.findById(user.pharmacy);
    }
    return await Pharmacy.findOne({ user: user._id });
  }

  static async createBusinessEntity(user, role, companyInfo) {
    if (!user || !role) {
      throw new Error("User và role là bắt buộc");
    }

    const baseInfo = {
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
    };

    switch (role) {
      case "pharma_company": {
        const pharmaCompany = new PharmaCompany({
          ...baseInfo,
          gmpCertNo: companyInfo.gmpCertNo || "",
        });
        await pharmaCompany.save();
        return pharmaCompany;
      }

      case "distributor": {
        const distributor = new Distributor({
          ...baseInfo,
        });
        await distributor.save();
        return distributor;
      }

      case "pharmacy": {
        const pharmacy = new Pharmacy({
          ...baseInfo,
        });
        await pharmacy.save();
        return pharmacy;
      }

      default:
        throw new Error(`Role không hợp lệ: ${role}`);
    }
  }

  static formatBusinessProfile(entity) {
    if (!entity) return null;

    return {
      id: entity._id,
      name: entity.name,
      licenseNo: entity.licenseNo,
      taxCode: entity.taxCode,
      status: entity.status,
      ...(entity.gmpCertNo && { gmpCertNo: entity.gmpCertNo }),
    };
  }
}

export default BusinessEntityFactory;

