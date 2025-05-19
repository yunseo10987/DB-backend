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
//기본 role을 0(general)로 설정
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

// 내 정보 조회 (일반 사용자만)
router.get("/me", checkAuth(), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;

  const user = (await psql.query(`
    SELECT nickname, password, email, role
    FROM "user"
    WHERE user_idx = $1 AND role = 0
  `, [userIdx])).rows[0];

  if (!user) return next(new NotFoundException());
//감정 캐릭터터
  const emotionResult = (await psql.query(`
    SELECT emotion_idx
    FROM diary
    WHERE user_idx = $1
    GROUP BY emotion_idx
    ORDER BY COUNT(*) DESC
    LIMIT 1;
  `, [userIdx])).rows[0];
//감정 통계계
  const emotionList = (await psql.query(`
    SELECT emotion_idx, COUNT(*) AS count
    FROM diary
    WHERE user_idx = $1 AND DATE_PART('month', date) = DATE_PART('month', CURRENT_DATE)
      AND DATE_PART('year', date) = DATE_PART('year', CURRENT_DATE)
    GROUP BY emotion_idx
    ORDER BY count DESC;
  `, [userIdx])).rows;

  user.emotion_idx = emotionResult?.emotion_idx ?? null;
  user.monthly_emotion_stats = emotionList;

  return res.status(200).send(user);
}));

// 특정 유저 정보 조회 (관리자만 상세 조회)
router.get("/:idx", checkAuth(), checkValidity({
  [PARAM_REGEX]: ["idx"]
}), endRequestHandler(async (req, res, next) => {
  const requester = req.decoded;
  const targetIdx = req.params.idx;

  if (requester.rank !== 1) return next(new UnauthorizedException("관리자만 접근할 수 있습니다."));

  const user = (await psql.query(`
    SELECT nickname, email, role
    FROM "user"
    WHERE user_idx = $1
  `, [targetIdx])).rows[0];

  if (!user) return next(new NotFoundException());
//감정 캐릭터터
  const emotionResult = (await psql.query(`
    SELECT emotion_idx
    FROM diary
    WHERE user_idx = $1
    GROUP BY emotion_idx
    ORDER BY COUNT(*) DESC
    LIMIT 1;
  `, [targetIdx])).rows[0];

  user.emotion_idx = emotionResult?.emotion_idx ?? null;

  return res.status(200).send(user);
}));

// 회원 정보 수정 (닉네임 변경)
router.put("/", checkAuth(), checkValidity({
  [NICKNAME_REGEX]: ["nickname"]
}), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;
  const { nickname } = req.body;

  await psql.query(`UPDATE "user" SET nickname = $1 WHERE user_idx = $2`, [nickname, userIdx]);

  return res.sendStatus(200);
}));

// 회원 탈퇴
router.delete("/", checkAuth(), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;

  await psql.query(`DELETE FROM "user" WHERE user_idx = $1`, [userIdx]);

  return res.sendStatus(200);
}));

module.exports = router;