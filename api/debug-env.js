module.exports = async (req, res) => {
  const key = process.env.COINGECKO_API_KEY || "";

  res.status(200).json({
    ok: true,
    exists: !!key,
    prefix: key ? key.slice(0, 6) : null,
    length: key ? key.length : 0
  });
};
