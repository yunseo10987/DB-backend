const router = require("express").Router();

const psql = require("../../database/connect/postgre");

router.get("/", endRequestHandler(async (req, res, next) => {
    const categoryList = await psql.query(`SELECT idx, name FROM emotion`).rows;
    
    if(categoryList.length === 0) return res.sendStatus(204); 

    return res.status(200).send({
        list: categoryList
    });
}));

module.exports = router;