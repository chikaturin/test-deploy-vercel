export const validateRole = (user, requiredRole, res) => {
  if (!user || user.role !== requiredRole) {
    const roleNames = {
      pharma_company: "pharma company",
      distributor: "distributor",
      pharmacy: "pharmacy",
      admin: "admin",
      user: "user",
    };
    
    const roleName = roleNames[requiredRole] || requiredRole;
    
    return res.status(403).json({
      success: false,
      message: `Chỉ có ${roleName} mới có thể thực hiện thao tác này`,
    });
  }
  return null;
};

