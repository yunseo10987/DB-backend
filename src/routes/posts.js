const router = require("express").Router();

const psql = require("../../database/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");

const {
    PARAM_REGEX, TITLE_REGEX,
    COMMENT_CONTENT_REGEX,
    QUERY_REGEX} = require("../constants");
const { NotFoundException, BadRequestException } = require("../model/customException");

//게시물 전체 보기
router.get("/", checkValidity({[PARAM_REGEX]: ["page"], [QUERY_REGEX]: ["emotionIdx", "sort"]}), endRequestHandler(async(req, res, next) => {
    const { page, emotionIdx, sort } = req.query;
    const offset = (page - 1) * 10;

    if(sort !== 0 && sort !== 1) return next(BadRequestException());
    

    let orderBy = "P.created_at DESC";
    if(sort === 0) orderBy = `"likesCount" DESC`;

    let whereEmotion = (emotionIdx !== -1) ? "WHERE P.emotion_idx = $1" : '';

    const values = emotionIdx !== -1 ? [emotionIdx, offset] : [offset];

    const postList = await psql.query(`SELECT P.idx, P.title, P.created_at AS "createdAt",
        (
            SELECT COUNT(*) FROM post_likes PL
            WHERE PL.post_idx = P.idx
        ) AS "likesCount",
        (
            SELECT COUNT(*) FROM comment C 
            WHERE C.post_idx = P.idx
        ) AS "commentsCount" 
        FROM post P ${whereEmotion}
        ORDER BY ${orderBy}
        LIMIT 10 OFFSET $2;
        `, values
    ).rows;

    if(postList.length === 0) return res.sendStatus(204);

    return res.status(200).send({
        list: postList
    });
}));

//게시물 상세보기
router.get("/:idx", checkAuth({required: false}), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async (req, res, next) => {
    const postIdx = req.params.idx;
    const loginUser = req.decoded;
    const userIdx = loginUser?.idx ?? -1;

    const post = await psql.query(`SELECT P.title, P.content,
            (P.user_idx = $1) AS "isMine",
            P.created_at AS "date",
            (
                SELECT COUNT(*)
                FROM Post_Likes Pl
                WHERE Pl.post_idx = P.post_idx
            ) AS "likesCount",
            EXISTS (
                SELECT 1
                FROM Post_Likes Pl
                WHERE Pl.post_idx = P.post_idx AND Pl.user_idx = $1
            ) AS "likedByMe"
        FROM Post P
        WHERE P.post_idx = $2;
    `, [userIdx, postIdx]).row[0];
    

    if(post.length === 0) return next(NotFoundException());
    
    return res.status(200).send(post);
}));

//게시물 미리보기
router.get("/preview", endRequestHandler(async (req, res, next) => {

    const postTitleList = await psql.query(`SELECT P.idx, P.title, E.name 
        FROM post P, emotion E WHERE P.emotion_idx = E.idx
        ORDER BY p.created_at DESC
        LIMIT 5;
        `).rows;

    if(postTitleList.length === 0) return res.sendStatus(204); 
    
    return res.status(200).send({
        list: postTitleList
    });
}));

//게시물 생성
router.post("/", checkAuth(), checkValidity({[TITLE_REGEX]: ["title"], [PARAM_REGEX]: ["emotionIdx"]}), endRequestHandler(async (req, res, next) => {
    const loginUser = req.decoded;
    const { title, content, emotionIdx } = req.body;

    await psql.query(`INSERT INTO post (title, content, emotion_idx, user_idx)
        VALUES ($1, $2, $3)
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

    const likesCount = await psql.query(`SELECT COUNT(*) FROM post_likes
        WHERE post_idx = $1
        `, [postIdx]
    ).row[0];

    return res.status(200).send({
        likesCount: likesCount,
        likedByMe: true
    });
}));

//게시물 좋아요 삭제
router.delete("/:idx/likes", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async(req, res, next) => {
    const loginUser = req.decoded;
    const postIdx = req.params.idx;

    await psql.query(`DELETE FROM post_likes
        WHERE post_idx = $1 AND user_idx = $2;
        `, [postIdx, loginUser.idx]
    );

    const likesCount = await psql.query(`SELECT COUNT(*) FROM post_likes
        WHERE post_idx = $1
        `, [postIdx]
    ).row[0];

    return res.status(200).send({
        likesCount: likesCount,
        likedByMe: false
    });
}));

//댓글 목록 불러오기
router.get("/:idx/comments", checkAuth({required: false}), checkValidity({[PARAM_REGEX]: ["idx", "page"]}), endRequestHandler(async(req, res, next) => {
    const postIdx = req.params.idx;
    const page = req.query.page;
    const offset = (page - 1) * 10;
    const loginUser = req.decoded;
    const userIdx = loginUser?.idx ?? -1;

    const commentsCount = await psql.query(`SELECT COUNT(*) FROM comment
        WHERE post_idx = $1
        `, [postIdx]).row[0];
    const commentsList = await psql.query(`SELECT idx, content, created_at AS "createdAt", 
            (user_idx = $1) AS "isAuthor" FROM comment 
            WHERE post_idx = $2
            ORDER BY created_at DESC
            LIMIT 10 OFFSET $3
        `, [userIdx, postIdx, offset]
    ).rows;

    if(commentsList.length === 0) return res.sendStatus(204); 

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