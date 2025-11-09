export const sendValidationError = (res, message, missingFields = null) => {
  const response = {
    success: false,
    message,
  };

  if (missingFields && missingFields.length > 0) {
    response.missingFields = missingFields;
  }

  return res.status(400).json(response);
};

