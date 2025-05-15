const jwt = require("jsonwebtoken");
const { EXPIRESIN } = require("../constants")

const makeToken = (Object) => {
  const token = process.env.TOKEN_SECRET_KEY;

  const accessToken = jwt.sign(Object, token, {
    issuer: "DB1",
    expiresIn: EXPIRESIN,
  });

  return accessToken;
};

module.exports = makeToken;
