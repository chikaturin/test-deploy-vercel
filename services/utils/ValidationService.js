class ValidationService {
  static validateRequired(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return {
        valid: false,
        message: `${fieldName} là bắt buộc`,
      };
    }
    return { valid: true };
  }

  static validateRequiredFields(fields) {
    const missingFields = [];
    for (const [fieldName, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === "") {
        missingFields.push(fieldName);
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        message: `Vui lòng cung cấp đầy đủ thông tin: ${missingFields.join(", ")}`,
        missingFields,
      };
    }

    return { valid: true };
  }

  static validateArray(value, fieldName, options = {}) {
    const { minLength = 1, allowEmpty = false } = options;

    if (!Array.isArray(value)) {
      return {
        valid: false,
        message: `${fieldName} phải là một array`,
      };
    }

    if (!allowEmpty && value.length === 0) {
      return {
        valid: false,
        message: `${fieldName} không được rỗng`,
      };
    }

    if (value.length < minLength) {
      return {
        valid: false,
        message: `${fieldName} phải có ít nhất ${minLength} phần tử`,
      };
    }

    return { valid: true };
  }

  static validateArrayLength(array1, array2, field1Name, field2Name) {
    if (array1.length !== array2.length) {
      return {
        valid: false,
        message: `Số lượng ${field1Name} phải bằng số lượng ${field2Name}`,
      };
    }
    return { valid: true };
  }

  static validateEmail(email) {
    if (!email) {
      return {
        valid: false,
        message: "Email là bắt buộc",
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        message: "Email không hợp lệ",
      };
    }

    return { valid: true };
  }

  static validateWalletAddress(walletAddress) {
    if (!walletAddress) {
      return {
        valid: false,
        message: "Wallet address là bắt buộc",
      };
    }

    // Basic Ethereum address validation (0x followed by 40 hex characters)
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletRegex.test(walletAddress)) {
      return {
        valid: false,
        message: "Wallet address không hợp lệ",
      };
    }

    return { valid: true };
  }

  static validateNumber(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return {
        valid: false,
        message: `${fieldName} là bắt buộc`,
      };
    }

    if (isNaN(Number(value))) {
      return {
        valid: false,
        message: `${fieldName} phải là một số`,
      };
    }

    return { valid: true };
  }


  static validatePositiveNumber(value, fieldName, options = {}) {
    const numberValidation = this.validateNumber(value, fieldName);
    if (!numberValidation.valid) {
      return numberValidation;
    }

    const numValue = Number(value);
    const { min = 0, max = null } = options;

    if (numValue <= 0) {
      return {
        valid: false,
        message: `${fieldName} phải lớn hơn 0`,
      };
    }

    if (min && numValue < min) {
      return {
        valid: false,
        message: `${fieldName} phải lớn hơn hoặc bằng ${min}`,
      };
    }

    if (max && numValue > max) {
      return {
        valid: false,
        message: `${fieldName} phải nhỏ hơn hoặc bằng ${max}`,
      };
    }

    return { valid: true };
  }

  static validateObjectId(value, fieldName) {
    if (!value) {
      return {
        valid: false,
        message: `${fieldName} là bắt buộc`,
      };
    }

    // MongoDB ObjectId is 24 hex characters
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(value.toString())) {
      return {
        valid: false,
        message: `${fieldName} không hợp lệ`,
      };
    }

    return { valid: true };
  }

  static validateDate(value, fieldName) {
    if (!value) {
      return {
        valid: false,
        message: `${fieldName} là bắt buộc`,
      };
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        message: `${fieldName} không hợp lệ`,
      };
    }

    return { valid: true, date };
  }

  static validateDateRange(startDate, endDate) {
    const startValidation = this.validateDate(startDate, "startDate");
    if (!startValidation.valid) {
      return startValidation;
    }

    const endValidation = this.validateDate(endDate, "endDate");
    if (!endValidation.valid) {
      return endValidation;
    }

    if (startValidation.date > endValidation.date) {
      return {
        valid: false,
        message: "startDate phải nhỏ hơn hoặc bằng endDate",
      };
    }

    return { valid: true };
  }


  static validateStringLength(value, fieldName, options = {}) {
    if (value === undefined || value === null) {
      return {
        valid: false,
        message: `${fieldName} là bắt buộc`,
      };
    }

    const strValue = String(value);
    const { minLength = 0, maxLength = null } = options;

    if (minLength && strValue.length < minLength) {
      return {
        valid: false,
        message: `${fieldName} phải có ít nhất ${minLength} ký tự`,
      };
    }

    if (maxLength && strValue.length > maxLength) {
      return {
        valid: false,
        message: `${fieldName} không được vượt quá ${maxLength} ký tự`,
      };
    }

    return { valid: true };
  }

  static validatePassword(password, options = {}) {
    const {
      minLength = 8,
      requireUppercase = false,
      requireLowercase = false,
      requireNumbers = false,
      requireSpecialChars = false,
    } = options;

    if (!password) {
      return {
        valid: false,
        message: "Password là bắt buộc",
      };
    }

    if (password.length < minLength) {
      return {
        valid: false,
        message: `Password phải có ít nhất ${minLength} ký tự`,
      };
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
      return {
        valid: false,
        message: "Password phải chứa ít nhất một chữ hoa",
      };
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      return {
        valid: false,
        message: "Password phải chứa ít nhất một chữ thường",
      };
    }

    if (requireNumbers && !/[0-9]/.test(password)) {
      return {
        valid: false,
        message: "Password phải chứa ít nhất một số",
      };
    }

    if (requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
      return {
        valid: false,
        message: "Password phải chứa ít nhất một ký tự đặc biệt",
      };
    }

    return { valid: true };
  }
}

export default ValidationService;

