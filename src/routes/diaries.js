const router = require("express").Router();
const psql = require("../../database/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");

const {
  TITLE_REGEX, COMMENT_CONTENT_REGEX, PARAM_REGEX, DATE_REGEX, TAG_REGEX, QUERY_REGEX
} = require("../constants");

const {
  BadRequestException, NotFoundException, ForbiddenException
} = require("../model/customException");

// GET /diaries (검색 + 정렬)
// GET /diaries
router.get("/", checkAuth(), checkValidity({
  [PARAM_REGEX]: ["sort"],
  [QUERY_REGEX]: ["emotion_idx"],
  [DATE_REGEX] : ["date", "start", "end"]
}), endRequestHandler(async (req, res, next) => {

  const userIdx     = req.decoded.idx;
  const sort        = Number(req.query.sort);
  const emotion_idx = Number(req.query.emotion_idx);
  const { date, start, end, tag } = req.query;

  const values = [userIdx];
  let whereClauses = ["D.user_idx = $1"];
  let joinClauses  = [];
  let paramIdx     = values.length + 1;
  const orderBy    = sort === 2 ? "D.date ASC" : "D.date DESC";
  
  if (date !== "-1") {
    whereClauses.push(`D.date = $${paramIdx++}`);
    values.push(date);
  } else if (start !== "-1" && end !== "-1") {
    whereClauses.push(`D.date BETWEEN $${paramIdx++} AND $${paramIdx}`);
    values.push(start, end);
    paramIdx++;
  }

  if (emotion_idx !== -1) {
    whereClauses.push(`D.emotion_idx = $${paramIdx++}`);
    values.push(emotion_idx);
  }

  if (typeof tag === "string" && tag !== "-1") {
    const cleanedTag = tag.trim().replace(/^#/, "");
    joinClauses.push(`
      JOIN (
        SELECT diary_idx
        FROM diary_tag
        WHERE name = $${paramIdx++}
        GROUP BY diary_idx
        HAVING COUNT(*) = 1
      ) TagFilter ON TagFilter.diary_idx = D.idx
    `);
    values.push(cleanedTag);
  }
console.log({ values, whereClauses, joinClauses });
  const result = await psql.query(`
    SELECT D.idx, D.title, D.content, D.emotion_idx, TO_CHAR(D.date, 'YYYY-MM-DD') AS date,
      COALESCE(
        ARRAY(
          SELECT name FROM diary_tag WHERE diary_idx = D.idx
        ), NULL
      ) AS tag
    FROM diary D
    ${joinClauses.join("\n")}
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY ${orderBy}
  `, values);

  const list = result.rows;
  if (!list || list.length === 0) return res.sendStatus(204);
  return res.status(200).send({ list });
}));

// POST /diaries
router.post("/", checkAuth(), checkValidity({
  [TITLE_REGEX]: ["title"],
  [COMMENT_CONTENT_REGEX]: ["content"],
  [PARAM_REGEX]: ["emotion_idx"],
  [DATE_REGEX]: ["date"]
}), endRequestHandler(async (req, res, next) => {
  const { title, content, emotion_idx, date, tag } = req.body;
  const userIdx = req.decoded.idx;

  const inserted = await psql.query(`
    INSERT INTO diary (user_idx, title, content, emotion_idx, date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING idx;
  `, [userIdx, title, content, emotion_idx, date]);

  const diaryIdx = inserted.rows[0].idx;

  if (Array.isArray(tag)) {
    for (let name of tag) {
      if (typeof name !== "string") continue;
      name = name.trim().replace(/^#/, "");
      if (!TAG_REGEX.test(name)) continue;

      await psql.query(`
        INSERT INTO diary_tag (name, diary_idx)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [name, diaryIdx]);
    }
  }

  return res.sendStatus(201);
}));

// GET /diaries/:idx
router.get("/:idx", checkAuth(), checkValidity({
  [PARAM_REGEX]: ["idx"]
}), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;
  const diaryIdx = req.params.idx;

  const diary = (await psql.query(`
    SELECT idx, title, content, emotion_idx, TO_CHAR(date, 'YYYY-MM-DD') AS date
    FROM diary
    WHERE idx = $1 AND user_idx = $2;
  `, [diaryIdx, userIdx])).rows[0];

  if (!diary) return next(new NotFoundException());

  const tagList = (await psql.query(`
    SELECT name FROM diary_tag WHERE diary_idx = $1;
  `, [diaryIdx])).rows.map(r => r.name);

  diary.tag = tagList.length > 0 ? tagList : null;

  return res.status(200).send(diary);
}));

// PUT /diaries/:idx
router.put("/:idx", checkAuth(), checkValidity({
  [TITLE_REGEX]: ["title"],
  [COMMENT_CONTENT_REGEX]: ["content"],
  [PARAM_REGEX]: ["emotion_idx", "idx"],
  [DATE_REGEX]: ["date"],
  [TAG_REGEX]: ["tag"]
}), endRequestHandler(async (req, res, next) => {
  const { title, content, emotion_idx, date, tag } = req.body;
  const diaryIdx = req.params.idx;
  const userIdx = req.decoded.idx;

  const targetDiary = await psql.query(`
    SELECT user_idx FROM diary WHERE idx = $1
  `, [diaryIdx]);

  if (targetDiary.rowCount === 0) {
    return next(new NotFoundException());
  }

  if (targetDiary.rows[0].user_idx !== userIdx) {
    return next(new ForbiddenException("작성자만 수정할 수 있습니다."));
  }

  await psql.query(`
    UPDATE diary
    SET title = $1, content = $2, emotion_idx = $3, date = $4
    WHERE idx = $5;
  `, [title, content, emotion_idx, date, diaryIdx]);

  await psql.query(`DELETE FROM diary_tag WHERE diary_idx = $1`, [diaryIdx]);

  if (Array.isArray(tag)) {
    for (let name of tag) {
      if (typeof name !== "string") continue;
      name = name.trim().replace(/^#/, "");
      if (!TAG_REGEX.test(name)) continue;

      await psql.query(`
        INSERT INTO diary_tag (name, diary_idx)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [name, diaryIdx]);
    }
  }

  return res.sendStatus(200);
}));

// DELETE /diaries/:idx
router.delete("/:idx", checkAuth(), checkValidity({
  [PARAM_REGEX]: ["idx"]
}), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;
  const diaryIdx = req.params.idx;

  const targetDiary = await psql.query(`
    SELECT user_idx FROM diary WHERE idx = $1
  `, [diaryIdx]);

  if (targetDiary.rowCount === 0) {
    return next(new NotFoundException());
  }

  if (targetDiary.rows[0].user_idx !== userIdx) {
    return next(new ForbiddenException("작성자만 삭제할 수 있습니다."));
  }

  await psql.query(`DELETE FROM diary_tag WHERE diary_idx = $1`, [diaryIdx]);
  await psql.query(`DELETE FROM diary WHERE idx = $1`, [diaryIdx]);

  return res.sendStatus(204);
}));

module.exports = router;
