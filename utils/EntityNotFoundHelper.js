export const checkEntityExists = (entity, entityName, res) => {
  if (!entity) {
    return res.status(404).json({
      success: false,
      message: `Không tìm thấy ${entityName}`,
    });
  }
  return null;
};

export const checkEntityExistsWithMessage = (entity, message, res) => {
  if (!entity) {
    return res.status(404).json({
      success: false,
      message,
    });
  }
  return null;
};

