export const POPULATE_FIELDS = {
  USER_BASIC: "username email fullName",
  USER_WITH_WALLET: "username email fullName walletAddress",
  BUSINESS_BASIC: "name licenseNo taxCode",
  BUSINESS_FULL: "name licenseNo taxCode status address country contactEmail contactPhone",
  DRUG_BASIC: "tradeName atcCode",
  DRUG_FULL: "tradeName atcCode genericName",
  MANUFACTURER_BASIC: "name licenseNo taxCode country",
  MANUFACTURER_FULL: "name licenseNo taxCode country address",
};

export const getUserPopulateFields = (includeWallet = false) => {
  return includeWallet ? POPULATE_FIELDS.USER_WITH_WALLET : POPULATE_FIELDS.USER_BASIC;
};


export const getBusinessPopulateFields = (full = false) => {
  return full ? POPULATE_FIELDS.BUSINESS_FULL : POPULATE_FIELDS.BUSINESS_BASIC;
};


export const getDrugPopulateFields = (full = false) => {
  return full ? POPULATE_FIELDS.DRUG_FULL : POPULATE_FIELDS.DRUG_BASIC;
};

