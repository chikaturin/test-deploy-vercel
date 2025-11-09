import PharmaCompany from "../../models/PharmaCompany.js";
import Distributor from "../../models/Distributor.js";
import Pharmacy from "../../models/Pharmacy.js";
import { ManufacturerStatisticsStrategy } from "./ManufacturerStatisticsStrategy.js";
import { DistributorStatisticsStrategy } from "./DistributorStatisticsStrategy.js";
import { PharmacyStatisticsStrategy } from "./PharmacyStatisticsStrategy.js";
import StatisticsStrategy from "./StatisticsStrategy.js";


export class StatisticsFactory {
  static async createStrategy(user) {
    if (!user || !user.role) {
      throw new Error("User và role là bắt buộc");
    }

    switch (user.role) {
      case "pharma_company": {
        const pharmaCompany = await PharmaCompany.findOne({ user: user._id });
        if (!pharmaCompany) {
          throw new Error("Không tìm thấy pharma company");
        }
        return new ManufacturerStatisticsStrategy(user, pharmaCompany);
      }

      case "distributor": {
        const distributor = await Distributor.findOne({ user: user._id });
        if (!distributor) {
          throw new Error("Không tìm thấy distributor");
        }
        return new DistributorStatisticsStrategy(user, distributor);
      }

      case "pharmacy": {
        const pharmacy = await Pharmacy.findOne({ user: user._id });
        if (!pharmacy) {
          throw new Error("Không tìm thấy pharmacy");
        }
        return new PharmacyStatisticsStrategy(user, pharmacy);
      }

      default:
        throw new Error(`Role không hợp lệ: ${user.role}`);
    }
  }

  static async createStrategyWithRoleValidation(user, requiredRole) {
    if (user.role !== requiredRole) {
      throw new Error(`Chỉ có ${requiredRole} mới có thể thực hiện thao tác này`);
    }
    return await this.createStrategy(user);
  }

  static async createStrategyForBlockchain(user) {
    // Blockchain stats có thể được xem bởi tất cả các role
    return await this.createStrategy(user);
  }
}

export default StatisticsFactory;

