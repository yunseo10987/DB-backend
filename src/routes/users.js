const router = require("express").Router();
const psql = require("../../database/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");
const makeToken = require("../modules/makeToken");

const {
  EMAIL_REGEX,
  PASSWORD_REGEX,
  NICKNAME_REGEX,
  PARAM_REGEX
} = require("../constants");

const {
  ConflictException,
  UnauthorizedException,
  NotFoundException
} = require("../model/customException");

// 회원가입
router.post("/", checkValidity({
  [EMAIL_REGEX]: ["email"],
  [PASSWORD_REGEX]: ["password"],
  [NICKNAME_REGEX]: ["nickname"]
}), endRequestHandler(async (req, res, next) => {
  const { email, password, nickname } = req.body;

  const exists = (await psql.query(`SELECT 1 FROM "user" WHERE email=$1`, [email])).rowCount > 0;
  if (exists) return next(new ConflictException("이미 존재하는 이메일입니다."));

  await psql.query(`
    INSERT INTO "user" (email, password, nickname)
    VALUES ($1, $2, $3)
  `, [email, password, nickname]);

  return res.sendStatus(201);
}));

// 로그인
router.post("/login", checkValidity({
  [EMAIL_REGEX]: ["email"],
  [PASSWORD_REGEX]: ["password"]
}), endRequestHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = (await psql.query(`
    SELECT idx, role FROM "user" WHERE email = $1 AND password = $2
  `, [email, password])).rows[0];

  if (!user) return next(new UnauthorizedException());

  const token = makeToken({ idx: user.idx, rank: user.role });

  return res.status(200).send({ token });
}));
