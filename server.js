const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./routes/api.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("."));

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Titan AI Hub server running on port ${PORT}`);
});
