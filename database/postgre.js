const pg = require("pg");

const client = new pg.Pool({
    host: process.env.HOST,
    port: process.env.PSQL_PORT,
    user: process.env.PSQL_USER,
    password: process.env.PSQL_PASSWORD,
    database: process.env.PSQL_DATABASE,
    max: process.env.PSQL_MAX
})

module.exports = client;