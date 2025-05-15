const { customException } = require("../model/customException");

const errorHandler = async (err, req, res, next) => {
  if (err instanceof customException) {
    return res.status(err.status).send({
      message: err.message,
    });
  } else {
    console.error(err);

    return res.status(500).send({
      message: "서버 에러 발생",
    });
  }
};

module.exports = errorHandler;