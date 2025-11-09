export const handleError = (error, errorMessage, res, defaultMessage = "Lỗi server") => {
  console.error(errorMessage, error);
  
  let statusCode = 500;
  const message = error.message || defaultMessage;
  
  // Xác định status code dựa trên error message
  if (message.includes("Không tìm thấy") || message.includes("not found")) {
    statusCode = 404;
  } else if (
    message.includes("Chỉ có") ||
    message.includes("Role không hợp lệ") ||
    message.includes("Unauthorized") ||
    message.includes("Forbidden") ||
    message.includes("không có quyền") ||
    message.includes("chờ phê duyệt")
  ) {
    statusCode = 403;
  } else if (
    message.includes("Unauthenticated") ||
    message.includes("Token") ||
    message.includes("Email hoặc mật khẩu")
  ) {
    statusCode = 401;
  } else if (
    message.includes("validation") ||
    message.includes("Invalid") ||
    message.includes("Vui lòng cung cấp")
  ) {
    statusCode = 400;
  }
  
  return res.status(statusCode).json({
    success: false,
    message,
    error: error.message || defaultMessage,
  });
};

export const handleStatisticsError = (error, errorMessage, res) => {
  return handleError(error, errorMessage, res, "Lỗi server khi lấy thống kê");
};

export const handleAuthError = (error, errorMessage, res) => {
  return handleError(error, errorMessage, res, "Lỗi xác thực");
};

export const handleValidationError = (error, errorMessage, res) => {
  return handleError(error, errorMessage, res, "Dữ liệu không hợp lệ");
};

