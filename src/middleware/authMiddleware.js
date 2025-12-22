export const authorizeAdmin = (req, res, next) => {
  // req.user didapat dari authenticateToken sebelumnya
  if (req.user && req.user.role === "ADMIN") {
    next(); // Lanjut ke controller jika dia ADMIN
  } else {
    return res
      .status(403)
      .json({ error: "Akses ditolak. Halaman ini khusus Admin." });
  }
};
