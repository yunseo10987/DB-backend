const { NotFoundException } = require("../model/customException");

const notFoundApi = (req, res, next) => {
  return next(new NotFoundException("요청하신 API를 찾을 수 없습니다."));
};

module.exports = notFoundApi;
