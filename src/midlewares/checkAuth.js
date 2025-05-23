const jwt = require("jsonwebtoken");

const {
    UnauthorizedException
} = require("../model/customException");

const checkAuth = ({required = true} = {}) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // "Bearer <토큰>"에서 "<토큰>" 부분만 추출

        try {
            if (!token) {
                if (required) {
                    return next(new UnauthorizedException());
                } else {
                    req.decoded = null;
                    return next();
                }
            }

            const jwtData = jwt.verify(token, process.env.TOKEN_SECRET_KEY);
            req.decoded = jwtData;
            
            return next();
        } catch (err) {
            return next(new UnauthorizedException());
        }
    }
}



module.exports = checkAuth