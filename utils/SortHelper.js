export const SORT_OPTIONS = {
  CREATED_DESC: { createdAt: -1 },
  CREATED_ASC: { createdAt: 1 },
  UPDATED_DESC: { updatedAt: -1 },
  UPDATED_ASC: { updatedAt: 1 },
  NAME_ASC: { name: 1 },
  NAME_DESC: { name: -1 },
};

export const getDefaultSort = () => {
  return SORT_OPTIONS.CREATED_DESC;
};

