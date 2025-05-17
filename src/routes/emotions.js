const router = require("express").Router();

const psql = require("../../database/postgre");

const endRequestHandler = require("../modules/endRequestHandler");

router.get("/", endRequestHandler(async (req, res, next) => {
    const emotionList = (await psql.query(`SELECT idx, name FROM emotion;`)).rows;

    if(emotionList.length === 0) return res.sendStatus(204); 

    return res.status(200).send({
        list: emotionList
    });
}));

module.exports = router;