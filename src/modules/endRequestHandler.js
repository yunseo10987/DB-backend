const {
  NotFoundException,
  ConflictException,
} = require("../model/customException");

/**
 *
 * @param {import("express").RequestHandler} requestHandler
 * @returns {import("express").RequestHandler}
 */

const endRequestHandler = (requestHandler) => {
  return async (req, res, next) => {
    try {
      await requestHandler(req, res, next);
    } catch (err) {
      if (err?.code === "23503") next(new NotFoundException());
      if (err?.code === "23505") next(new ConflictException());

      next(err);
    }
  };
};

module.exports = endRequestHandler;