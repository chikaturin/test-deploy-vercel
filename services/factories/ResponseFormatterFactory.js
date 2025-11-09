export class ResponseFormatterFactory {
  static formatPaginationResponse(data, total, page, limit) {
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static formatSuccessResponse(data, message = null) {
    const response = {
      success: true,
      data,
    };

    if (message) {
      response.message = message;
    }

    return response;
  }

  static formatListResponse(items, total, page, limit, itemName = "items") {
    return {
      success: true,
      data: {
        [itemName]: items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  static formatStatisticsResponse(stats) {
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Format paginated response với custom data structure
   * @param {Object} data - Data object với items
   * @param {Number} total - Total count
   * @param {Number} page - Current page
   * @param {Number} limit - Items per page
   * @returns {Object} Formatted response
   */
  static formatPaginatedResponse(data, total, page, limit) {
    return {
      success: true,
      data: {
        ...data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}

export default ResponseFormatterFactory;

