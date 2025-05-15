const { BadRequestException } = require("../model/customException");

const {
    WHITESPACE_REGEX,
    PARAM_REGEX,
    TITLE_REGEX,
    COMMENT_CONTENT_REGEX
} = require("../constants");

const checkValidity = (data) => {
    return (req, res, next) => {
        for (typeKey in data) {
            for (const item of data[typeKey]) {
                let source;
                const value = req.body[item] ? (source = "body", req.body[item]) :
                    req.params[item] ? (source = "params", req.params[item]) :
                        req.query[item] ? (source = "query", req.query[item]) :
                            null;

                const stringFieldArray = [TITLE_REGEX.source, COMMENT_CONTENT_REGEX.source];

                const regexParts = typeKey.match(/\/(.*?)\/([gimy]*)$/);
                const regex = new RegExp(regexParts[1], regexParts[2]);

                if (!value) {
                    return next(new BadRequestException());
                }

                if (!regex.test(value)) {
                    return next(new BadRequestException());
                }

                if (regex.source === PARAM_REGEX.source) {
                    req[source][item] = parseInt(req[source][item]);
                } else if (stringFieldArray.includes(regex.source)) {
                    req[source][item] = value.replace(WHITESPACE_REGEX, ' ');
                }

            }
        }
        return next();
    }
}

module.exports = checkValidity;