const router = require("express").Router();

const psql = require("../../database/connect/postgre");

const checkAuth = require("../midlewares/checkAuth");
const checkValidity = require("../midlewares/checkValidity");
const endRequestHandler = require("../modules/endRequestHandler");

const {
    PARAM_REGEX, TITLE_REGEX} = require("../constants");

router.get("/:idx", checkAuth(), checkValidity({[PARAM_REGEX]: ["idx"]}), endRequestHandler(async (req, res, next) => {
    const postIdx = req.params.idx;
    const loginUser = req.decoded;

    const postList = await psql.query(`SELECT P.title, P.content, (P.user_idx = $1) AS "isMine", P.created_at AS "date",
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
    `, [loginUser.idx, postIdx]).rows;

    if(postList.length === 0) return res.sendStatus(204); 
    
    return res.status(200).send({
        list: postList
    });
}));

router.get("/preview", endRequestHandler(async (req, res, next) => {

    const postTitleList = await psql.query(`SELECT P.idx, P.title, E.name 
        FROM post P, emotion E WHERE P.emotion_idx = E.idx;`
        ).rows;

    if(postTitleList.length === 0) return res.sendStatus(204); 
    
    return res.status(200).send({
        list: postTitleList
    });
}));

router.post("/", checkAuth(), checkValidity({[TITLE_REGEX]: ["title"], [PARAM_REGEX]: ["emotion_idx"]}), endRequestHandler(async (req, res, next) => {
    const loginUser = req.decoded;
    const { title, content, emotionIdx } = req.body;

    await psql.query(`INSERT INTO post (title, content, emotion_idx, user_idx)
        VALUES ($1, $2, $3)
        `, [title, content, emotionIdx, loginUser.idx]
    );

    return res.sendStatus(201);

}));

module.exports = router;