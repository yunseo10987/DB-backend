const router = require("express").Router();
const psql = require("../../database/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");
const {
  TITLE_REGEX, COMMENT_CONTENT_REGEX, PARAM_REGEX, DATE_REGEX, TAG_REGEX
} = require("../constants");
const {
  BadRequestException, NotFoundException
} = require("../model/customException");

// GET /diaries (검색 + 정렬)
router.get("/", checkAuth(), checkValidity({
  [DATE_REGEX]: ["date", "start", "end"],
  [PARAM_REGEX]: ["emotion_idx", "sort"],
  [TAG_REGEX]:["tag"]
}), endRequestHandler(async (req, res, next) => {
  const userIdx = req.decoded.idx;
  const { date, start, end, emotion_idx, tag, sort } = req.query;

  const values = [userIdx];
  let whereClauses = [`D.user_idx = $1`];
  let joinClauses = [];
  let orderBy = sort == 1 ? `D.date ASC` : `D.date DESC`;
  let paramIdx = values.length + 1;

  if (date) {
    whereClauses.push(`D.date = $${paramIdx++}`);
    values.push(date);
  } else if (start && end) {
    whereClauses.push(`D.date BETWEEN $${paramIdx++} AND $${paramIdx}`);
    values.push(start, end);
    paramIdx++;
  }

  if (emotion_idx !== undefined) {
    whereClauses.push(`D.emotion_idx = $${paramIdx++}`);
    values.push(emotion_idx);
  }

  let tagNames = Array.isArray(tag) ? tag : tag ? [tag] : [];
  tagNames = tagNames.map(name => name.trim().replace(/^#/, ""))
                     .filter(name => TAG_REGEX.test(name));

  if (tagNames.length > 0) {
    joinClauses.push(`
      JOIN (
        SELECT DT.diary_idx
        FROM diary_tag DT
        JOIN tag T ON T.idx = DT.tag_idx
        WHERE T.name = ANY($${paramIdx++})
        GROUP BY DT.diary_idx
        HAVING COUNT(*) = $${paramIdx++}
      ) TagFilter ON TagFilter.diary_idx = D.idx
    `);
    values.push(tagNames, tagNames.length);
  }

  const result = await psql.query(`
    SELECT D.idx, D.title, D.content, D.emotion_idx, TO_CHAR(D.date, 'YYYY-MM-DD') AS date,
      COALESCE(
        ARRAY(
          SELECT T.name
          FROM diary_tag DT
          JOIN tag T ON DT.tag_idx = T.idx
          WHERE DT.diary_idx = D.idx
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
  [DATE_REGEX]: ["date"],
  [TAG_REGEX]: ["tag"]
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

      const tagResult = await psql.query(`
        INSERT INTO tag (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING idx;
      `, [name]);

      const tagIdx = tagResult.rows[0].idx;

      await psql.query(`
        INSERT INTO diary_tag (diary_idx, tag_idx)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [diaryIdx, tagIdx]);
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
    SELECT T.name
    FROM diary_tag DT
    JOIN tag T ON DT.tag_idx = T.idx
    WHERE DT.diary_idx = $1;
  `, [diaryIdx])).rows.map(r => r.name);

  diary.tag = tagList.length > 0 ? tagList : null;

  return res.status(200).send({
    idx: diary.idx,
    date: diary.date,
    title: diary.title,
    content: diary.content,
    emotion_idx: diary.emotion_idx,
    tag: diary.tag
  });
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

  const result = await psql.query(`
    UPDATE diary
    SET title = $1, content = $2, emotion_idx = $3, date = $4
    WHERE idx = $5 AND user_idx = $6
    RETURNING idx;
  `, [title, content, emotion_idx, date, diaryIdx, userIdx]);

  if (result.rowCount === 0) return next(new NotFoundException());

  await psql.query(`DELETE FROM diary_tag WHERE diary_idx = $1`, [diaryIdx]);

  if (Array.isArray(tag)) {
    for (let name of tag) {
      if (typeof name !== "string") continue;
      name = name.trim().replace(/^#/, "");
      if (!TAG_REGEX.test(name)) continue;

      const tagResult = await psql.query(`
        INSERT INTO tag (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING idx;
      `, [name]);

      const tagIdx = tagResult.rows[0].idx;

      await psql.query(`
        INSERT INTO diary_tag (diary_idx, tag_idx)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [diaryIdx, tagIdx]);
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

  await psql.query(`DELETE FROM diary_tag WHERE diary_idx = $1`, [diaryIdx]);
  const result = await psql.query(`DELETE FROM diary WHERE idx = $1 AND user_idx = $2`, [diaryIdx, userIdx]);

  if (result.rowCount === 0) return next(new NotFoundException());
  return res.sendStatus(200);
}));

module.exports = router;
