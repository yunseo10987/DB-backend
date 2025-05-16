const express = require("express");
require("dotenv").config();

const errorHandler = require("./src/midlewares/errorHandler");
const notFoundApi = require("./src/midlewares/notFoundApi");

const postsApi = require("./src/routes/posts");

const app = express();
const port = process.env.HTTP_PORT;

app.use(express.json());
app.use("/posts", postsApi);

app.use(notFoundApi);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`${port}번에서 HTTP Web Server 실행`);
});