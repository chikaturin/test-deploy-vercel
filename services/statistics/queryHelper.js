export const createDateRangeQuery = (field, startDate, endDate) => {
  const query = {};
  if (startDate || endDate) {
    query[field] = {};
    if (startDate) {
      query[field].$gte = startDate;
    }
    if (endDate) {
      query[field].$lte = endDate;
    }
  }
  return query;
};

export const calculateTotalQuantity = (documents) => {
  return documents.reduce((sum, doc) => sum + (doc.quantity || 0), 0);
};

export const groupByStatus = (documents, statusField = "status") => {
  const grouped = {};
  documents.forEach((doc) => {
    const status = doc[statusField];
    if (!grouped[status]) {
      grouped[status] = [];
    }
    grouped[status].push(doc);
  });
  return grouped;
};

export const countByStatus = async (Model, baseQuery, statusField = "status") => {
  const statuses = await Model.distinct(statusField, baseQuery);
  const counts = {};
  
  await Promise.all(
    statuses.map(async (status) => {
      counts[status] = await Model.countDocuments({
        ...baseQuery,
        [statusField]: status,
      });
    })
  );
  
  return counts;
};

export const calculatePercentage = (part, total, decimals = 2) => {
  if (total === 0) return "0";
  return ((part / total) * 100).toFixed(decimals);
};

