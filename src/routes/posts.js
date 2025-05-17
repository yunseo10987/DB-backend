const router = require("express").Router();

const psql = require("../../database/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");
const makeToken = require("../modules/makeToken");

const {
    EMAIL_REGEX,PASSWORD_REGEX,
    PARAM_REGEX, TITLE_REGEX,
    COMMENT_CONTENT_REGEX,
    QUERY_REGEX} = require("../constants");
const { NotFoundException, BadRequestException, UnauthorizedException } = require("../model/customException");

router.post("/login", checkValidity({[EMAIL_REGEX]: ["id"], [PASSWORD_REGEX]: ["pw"]}), endRequestHandler(async (req, res, next) => {
  const { id, pw } = req.body;

  const loginUser = (await psql.query(`SELECT idx, role FROM "user" WHERE email=$1 AND password=$2;`, [id, pw])).rows[0];

  if (!loginUser) return next(new UnauthorizedException());

  const accessToken = makeToken({
    idx: loginUser.idx,
    rank: loginUser.role,
  });

  return res.status(200).send({
    token: accessToken
  })
})
);

//게시물 전체 보기
router.get("/", checkValidity({ [PARAM_REGEX]: ["page"], [QUERY_REGEX]: ["emotionIdx", "sort"] }), endRequestHandler(async (req, res, next) => {
    const { page, emotionIdx, sort } = req.query;
    const offset = (page - 1) * 10;

    const parsedSort = parseInt(sort);
    const parsedEmotion = parseInt(emotionIdx);

    if (parsedSort !== 1 && parsedSort !== 2) return next(new BadRequestException());

    // 기본 정렬: 최신순
    let orderBy = "P.created_at DESC";

    // 조건문 분기
    let whereConditions = [];
    let values = [];
    let valueIndex = 1;

    if (parsedEmotion !== -1) {
        whereConditions.push(`P.emotion_idx = $${valueIndex++}`);
        values.push(parsedEmotion);
    }

    if (parsedSort === 1) {
        // 좋아요 순 정렬 시 7일 이내만
        whereConditions.push(`P.created_at >= NOW() - INTERVAL '7 days'`);
        orderBy = `"likesCount" DESC`;
    }

    values.push(offset); // 마지막 값은 offset
    const offsetParam = `$${valueIndex}`;

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : '';

    const postList = (await psql.query(`
        SELECT 
            P.idx,
            P.title,
            P.created_at AS "createdAt",
            (
                SELECT COUNT(*) FROM post_likes PL
                WHERE PL.post_idx = P.idx
            ) AS "likesCount",
            (
                SELECT COUNT(*) FROM comment C
                WHERE C.post_idx = P.idx
            ) AS "commentsCount"
        FROM post P
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT 10 OFFSET ${offsetParam};
    `, values)).rows;

    if (!postList || postList.length === 0) return res.sendStatus(204);

    return res.status(200).send({ list: postList });
}));

//게시물 미리보기
router.get("/preview", endRequestHandler(async (req, res, next) => {

    const postTitleList = (await psql.query(`SELECT P.idx, P.title, E.name 
        FROM post P, emotion E WHERE P.emotion_idx = E.idx
        ORDER BY p.created_at DESC
        LIMIT 5;
        `)).rows;

    if(postTitleList === undefined || postTitleList === null || postTitleList.length === 0) return res.sendStatus(204); 
    
    return res.status(200).send({
        list: postTitleList
    });
}));

//게시물 상세보기
router.get("/:idx", checkAuth({required: false}), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async (req, res, next) => {
    const postIdx = req.params.idx;
    const loginUser = req.decoded;
    const userIdx = loginUser?.idx ?? -1;

    const post = (await psql.query(`SELECT P.title, P.content,
            (P.user_idx = $1) AS "isMine",
            P.created_at AS "date",
            (
                SELECT COUNT(*)
                FROM Post_Likes Pl
                WHERE Pl.post_idx = P.idx
            ) AS "likesCount",
            EXISTS (
                SELECT 1
                FROM Post_Likes Pl
                WHERE Pl.post_idx = P.idx AND Pl.user_idx = $1
            ) AS "likedByMe"
        FROM Post P
        WHERE P.idx = $2;
    `, [userIdx, postIdx])).rows[0];
    

    if(post === undefined || post === null || post.length === 0) return next(new NotFoundException());
    
    return res.status(200).send(post);
}));

//게시물 생성
router.post("/", checkAuth(), checkValidity({[TITLE_REGEX]: ["title"], [PARAM_REGEX]: ["emotionIdx"]}), endRequestHandler(async (req, res, next) => {
    const loginUser = req.decoded;
    const { title, content, emotionIdx } = req.body;

    await psql.query(`INSERT INTO post (title, content, emotion_idx, user_idx)
        VALUES ($1, $2, $3, $4)
        `, [title, content, emotionIdx, loginUser.idx]
    );

    return res.sendStatus(201);

}));

//게시물 수정
router.put("/:idx", checkAuth(), checkValidity({[TITLE_REGEX]: ["title"], [PARAM_REGEX]: ["emotionIdx"], [PARAM_REGEX]: ["idx"]}), endRequestHandler(async (req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;
    const { title, content, emotionIdx } = req.body;

    await psql.query(`UPDATE post SET title = $1, content = $2, emotion_idx = $3
        WHERE idx = $4 AND user_idx = $5;
        `, [title, content, emotionIdx, postIdx, loginUser.idx]
    );

    return res.sendStatus(201);
}));

//게시물 삭제
router.delete("/:idx", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;

    await psql.query(`DELETE FROM post 
        WHERE idx = $1 AND user_idx = $2;
        `, [postIdx, loginUser.idx]
    );

    return res.sendStatus(201);
}));

//게시물 좋아요 생성
router.post("/:idx/likes", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;

    await psql.query(`INSERT INTO post_likes (post_idx, user_idx)
        VALUES ($1, $2)
        ON CONFLICT (post_idx, user_idx) DO NOTHING
        `, [postIdx, loginUser.idx]
    );

    const likesCount = (await psql.query(`SELECT COUNT(*) AS "likesCount" FROM post_likes
        WHERE post_idx = $1;
        `, [postIdx]
    )).rows[0];

    return res.status(200).send(likesCount);
}));

//게시물 좋아요 삭제
router.delete("/:idx/likes", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;

    await psql.query(`DELETE FROM post_likes
        WHERE post_idx = $1 AND user_idx = $2;
        `, [postIdx, loginUser.idx]
    );

    const likesCount = (await psql.query(`SELECT COUNT(*) FROM post_likes
        WHERE post_idx = $1
        `, [postIdx]
    )).rows[0];

    return res.status(200).send(likesCount);
}));

//댓글 목록 불러오기
router.get("/:idx/comments", checkAuth({required: false}), checkValidity({[PARAM_REGEX]: ["idx", "page"]}), endRequestHandler(async(req, res, next) => {
    const postIdx = req.params.idx;
    const page = req.query.page;
    const offset = (page - 1) * 10;
    const loginUser = req.decoded;
    const userIdx = loginUser?.idx ?? -1;

    const commentsCount = (await psql.query(`SELECT COUNT(*) FROM comment
        WHERE post_idx = $1
        `, [postIdx])).rows[0].count;
    const commentsList = (await psql.query(`SELECT idx, content, created_at AS "createdAt", 
            (user_idx = $1) AS "isAuthor" FROM comment 
            WHERE post_idx = $2
            ORDER BY created_at DESC
            LIMIT 10 OFFSET $3
        `, [userIdx, postIdx, offset]
    )).rows;

    if(commentsList === undefined || commentsList === null || commentsList.length === 0) return res.sendStatus(204); 

    return res.status(200).send({
        commentsCount: commentsCount,
        list: commentsList
    });
}));

//게시물 댓글 생성
router.post("/:idx/comments", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"], [COMMENT_CONTENT_REGEX]: ["content"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;
    const content = req.body.content;

    await psql.query(`INSERT INTO comment (content, post_idx, user_idx)
        VALUES($1, $2, $3)
        `, [content, postIdx, loginUser.idx]
    );

    return res.sendStatus(201);
}));

//게시물 댓글 수정정
router.put("/comments/:idx", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"], [COMMENT_CONTENT_REGEX]: ["content"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const commentIdx = req.params.idx;
    const content = req.body.content;

    await psql.query(`UPDATE comment SET content = $1 
        WHERE idx = $2 AND user_idx = $3;
        `, [content, commentIdx, loginUser.idx]
    );

    return res.sendStatus(201);
}));

//게시물 댓글 삭제
router.delete("/comments/:idx", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const commentIdx = req.params.idx;

    await psql.query(`DELETE FROM comment 
        WHERE idx = $1 AND user_idx = $2
        `, [commentIdx, loginUser.idx]
    );

    return res.sendStatus(201);
}));

module.exports = router;